"use client";

import { useEffect, useReducer, useRef } from "react";
import {
  ADVANCE_DELAY_MS,
  initialFlow,
  reduceFlow,
  type FlowEvent,
  type FlowState,
} from "@/lib/domain/practice-flow";
import type { UnitDetail } from "@/lib/units";

export default function PracticeFlow({ unit }: { unit: UnitDetail }) {
  const total = unit.sentences.length;
  const [state, dispatch] = useReducer(
    (s: FlowState, e: FlowEvent) => reduceFlow(s, e, total),
    initialFlow()
  );
  const videoRef = useRef<HTMLVideoElement>(null);

  // 播放态：seek 到句起点，等 seek 完成再播放（iPad Safari 直接 play 会竞态）；
  // 没有起止时间的句子（防御，正常内容包不会出现）直接跳过
  useEffect(() => {
    if (state.step !== "playing") return;
    const video = videoRef.current;
    const sentence = unit.sentences[state.index];
    if (!video) return;
    const { start, end } = sentence;
    if (start == null || end == null) {
      dispatch({ type: "clipEnded" });
      return;
    }
    const playFromStart = () => {
      video.currentTime = start;
      video.play().catch(() => {
        /* 自动播放被系统拦截时，用户再点一次"开始"即可 */
      });
    };
    if (video.readyState >= 1 && video.seekable.length > 0) {
      video.addEventListener("seeked", playFromStart, { once: true });
      video.currentTime = start;
      // 若本来就在该位置，seeked 不会触发，兜底直接播
      if (Math.abs(video.currentTime - start) < 0.05) {
        video.removeEventListener("seeked", playFromStart);
        playFromStart();
      }
    } else {
      video.addEventListener("canplay", playFromStart, { once: true });
      video.load();
    }
    return () => video.removeEventListener("seeked", playFromStart);
  }, [state, unit.sentences]);

  // 播放态：到句尾时间点就暂停并通知状态机
  useEffect(() => {
    if (state.step !== "playing") return;
    const video = videoRef.current;
    const sentence = unit.sentences[state.index];
    if (!video || sentence.end == null) return;
    const onTimeUpdate = () => {
      if (video.currentTime >= sentence.end!) {
        video.pause();
        dispatch({ type: "clipEnded" });
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [state, unit.sentences]);

  // 等待态：定时自动进下一句
  useEffect(() => {
    if (state.step !== "waiting") return;
    const timer = setTimeout(() => dispatch({ type: "advance" }), ADVANCE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const current =
    state.step === "finished" ? null : unit.sentences[state.index];

  return (
    <div className="mt-6">
      <video
        ref={videoRef}
        src={encodeURI(unit.video)}
        playsInline
        preload="metadata"
        className="w-full rounded-2xl bg-black shadow-md"
      />

      {/* 当前句大字卡 */}
      {current && (
        <section className="mt-5 rounded-3xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <p className="text-2xl leading-relaxed font-semibold">
            {current.index + 1}. {current.text}
          </p>
          <p className="mt-3 text-lg text-slate-500">
            {state.step === "playing" && "🔊 示范播放中，仔细听…"}
            {state.step === "waiting" && "⏭ 即将播放下一句"}
            {state.step === "idle" && "准备好就开始吧！"}
            {current.bestScore != null
              ? ` · 最好成绩 ${current.bestScore} 分`
              : " · 还没练过"}
          </p>
        </section>
      )}

      {/* 开始 / 收尾面板 */}
      {state.step === "idle" && (
        <button
          onClick={() => dispatch({ type: "begin" })}
          className="mt-5 w-full rounded-2xl bg-emerald-500 py-5 text-2xl font-bold text-white shadow-md active:bg-emerald-600"
        >
          ▶ 开始听整单元示范
        </button>
      )}
      {state.step === "finished" && (
        <section className="mt-5 rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
          <p className="text-2xl font-bold text-emerald-700">
            🎉 整单元示范听完啦！
          </p>
          <button
            onClick={() => dispatch({ type: "select", index: 0 })}
            className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
          >
            ↺ 从头再听一遍
          </button>
        </section>
      )}

      {/* 句子导航（手动跳转） */}
      <nav className="mt-6 grid grid-cols-5 gap-2">
        {unit.sentences.map((s) => {
          const isCurrent =
            state.step !== "finished" && state.index === s.index;
          return (
            <button
              key={s.index}
              onClick={() => dispatch({ type: "select", index: s.index })}
              className={`rounded-xl py-3 text-xl font-bold shadow-sm ${
                isCurrent
                  ? "bg-emerald-500 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {s.index + 1}
              <span className="block text-xs font-normal">
                {s.bestScore != null ? `${s.bestScore}分` : "未练"}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
