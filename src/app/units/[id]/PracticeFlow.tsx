"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  TICK_MS,
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
  const [isPaused, setIsPaused] = useState(false);

  const current = state.step === "finished" ? null : unit.sentences[state.index];

  // 暂停图标跟随视频真实状态（含系统级中断）
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setIsPaused(video.paused);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
    };
  }, []);

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

  // 倒计时态：每秒一跳
  useEffect(() => {
    if (state.step !== "waiting") return;
    const timer = setTimeout(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || state.step !== "playing") return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  const prevSentence = () => {
    if (state.step === "finished") dispatch({ type: "select", index: total - 1 });
    else if (state.step !== "idle") dispatch({ type: "select", index: Math.max(0, state.index - 1) });
  };
  const nextSentence = () => {
    if (state.step === "waiting") dispatch({ type: "skip" });
    else if (state.step === "playing" && state.index + 1 < total)
      dispatch({ type: "select", index: state.index + 1 });
  };

  return (
    <div className="mt-6">
      <div className="relative">
        <video
          ref={videoRef}
          src={encodeURI(unit.video)}
          playsInline
          preload="metadata"
          className="w-full rounded-2xl bg-black shadow-md"
        />
        {/* 倒计时浮层 */}
        {state.step === "waiting" && (
          <button
            onClick={() => dispatch({ type: "skip" })}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/50 text-white"
          >
            <span className="text-8xl font-bold tabular-nums">
              {state.secondsLeft}
            </span>
            <span className="mt-2 text-xl">下一句马上来，点击跳过</span>
          </button>
        )}
      </div>

      {/* 三大控制按钮：上一句 / 暂停·播放 / 下一句 */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <button
          onClick={prevSentence}
          disabled={state.step === "idle"}
          className="rounded-2xl bg-white py-5 text-xl font-bold text-slate-700 shadow-md ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
        >
          ⏮ 上一句
        </button>
        <button
          onClick={togglePlay}
          disabled={state.step !== "playing"}
          className="rounded-2xl bg-slate-700 py-5 text-xl font-bold text-white shadow-md active:bg-slate-800 disabled:opacity-40"
        >
          {isPaused ? "▶ 继续" : "⏸ 暂停"}
        </button>
        <button
          onClick={nextSentence}
          disabled={state.step === "idle" || state.step === "finished" || (state.step === "playing" && state.index + 1 >= total)}
          className="rounded-2xl bg-white py-5 text-xl font-bold text-slate-700 shadow-md ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
        >
          下一句 ⏭
        </button>
      </div>

      {/* 当前句大字卡 */}
      {current && (
        <section className="mt-5 rounded-3xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <p className="text-2xl leading-relaxed font-semibold">
            {current.index + 1}. {current.text}
          </p>
          <p className="mt-3 text-lg text-slate-500">
            {state.step === "playing" && (isPaused ? "⏸ 已暂停，点「继续」接着听" : "🔊 示范播放中，仔细听…")}
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
      <nav
        className="mt-6 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(total, 7)}, minmax(0, 1fr))` }}
      >
        {unit.sentences.map((s) => {
          const isCurrent = state.step !== "finished" && state.index === s.index;
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

      <a href={`/units/${unit.id}/calibrate`} className="mt-8 block text-center text-base text-slate-400">
        🔧 校对模式（家长调句子边界用）
      </a>
    </div>
  );
}
