"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  canSkip,
  TICK_MS,
  initialFlow,
  reduceFlow,
  type FlowEvent,
  type FlowState,
} from "@/lib/domain/practice-flow";
import type { UnitDetail } from "@/lib/units";

// 录音最长秒数：超时自动提交，防止孩子忘按"读好了"一直录
const MAX_RECORD_SECONDS = 15;

/** 停止录音的意图：提交评分 / 弃旧重录 / 纯丢弃（不重录不提交） */
type StopIntent = "submit" | "rerecord" | "discard";

export default function PracticeFlow({ unit }: { unit: UnitDetail }) {
  const total = unit.sentences.length;
  const [state, dispatch] = useReducer(
    (s: FlowState, e: FlowEvent) => reduceFlow(s, e, total),
    initialFlow()
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // —— 录音（流与录音器用 ref 管理，避免渲染期抖动） ——
  const mountedRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const stopIntentRef = useRef<StopIntent>("submit");
  const [hasBlob, setHasBlob] = useState(false);
  const [recorderActive, setRecorderActive] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [localBest, setLocalBest] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      unit.sentences.filter((s) => s.bestScore != null).map((s) => [s.index, s.bestScore!])
    )
  );

  const current = state.step === "finished" ? null : unit.sentences[state.index];
  const index = state.step === "finished" ? 0 : state.index;

  async function ensureStream(): Promise<MediaStream> {
    if (streamRef.current && streamRef.current.active) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    return stream;
  }

  async function startRecording() {
    setSubmitError(null);
    try {
      if (typeof MediaRecorder === "undefined") {
        setMicNotice("这个浏览器不支持录音，请换 Safari 或 Chrome");
        return;
      }
      const stream = await ensureStream();
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setRecorderActive(false);
        const intent = stopIntentRef.current;
        if (intent === "discard" || !mountedRef.current) {
          blobRef.current = null;
          setHasBlob(false);
          return;
        }
        blobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType });
        setHasBlob(true);
        if (intent === "submit") void submitRecording();
        else if (intent === "rerecord") void startRecording();
      };
      recorderRef.current = recorder;
      recorder.start();
      blobRef.current = null;
      setHasBlob(false);
      setRecordSeconds(0);
      setRecorderActive(true);
    } catch {
      setMicNotice("请允许麦克风权限，然后点「开始读」");
      setRecorderActive(false);
    }
  }

  function stopRecording(intent: StopIntent) {
    stopIntentRef.current = intent;
    recorderRef.current?.stop();
  }

  async function submitRecording() {
    const blob = blobRef.current;
    if (!blob || !mountedRef.current) return;
    const sentenceIndex = index;
    dispatch({ type: "submitting" });
    setSubmitError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "recording");
      form.append("sentenceIndex", String(sentenceIndex));
      const res = await fetch(`/api/units/${unit.id}/practice`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (res.ok) {
        const result = body as { score: number; stars: number; isNewBest: boolean };
        setLocalBest((prev) => ({
          ...prev,
          [sentenceIndex]: Math.max(prev[sentenceIndex] ?? 0, result.score),
        }));
        setMicNotice(null);
        dispatch({ type: "scored", result });
        blobRef.current = null;
        setHasBlob(false);
      } else {
        dispatch({ type: "submitFailed" });
        const code = body?.error?.code as string | undefined;
        if (code === "EMPTY_AUDIO") {
          // 不自动重录：让孩子看到提示、自己点"开始读"再读一遍
          setMicNotice("没听清，再读一次吧！");
          blobRef.current = null;
          setHasBlob(false);
        } else {
          setSubmitError(body?.error?.message ?? "出了点小问题，再试一次");
        }
      }
    } catch {
      if (!mountedRef.current) return;
      dispatch({ type: "submitFailed" });
      setSubmitError("网络不太好，点「重新提交」再试试");
    }
  }

  // 录音态：自动开录（保留已有录音时等用户选择"重新提交"或"重读"）
  useEffect(() => {
    if (state.step === "recording" && !hasBlob && !recorderActive && !micNotice) {
      void startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, hasBlob, recorderActive, micNotice]);

  // 录音计时 + 超时自动提交
  useEffect(() => {
    if (state.step !== "recording" || !recorderActive) return;
    const timer = setTimeout(() => {
      setRecordSeconds((s) => {
        if (s + 1 >= MAX_RECORD_SECONDS) stopRecording("submit");
        return s + 1;
      });
    }, TICK_MS);
    return () => clearTimeout(timer);
  }, [state.step, recorderActive, recordSeconds]);

  // 离开录音/提交态（跳句、出分）时：丢弃进行中的录音与陈旧 blob，
  // 防止上一句的音频混进下一次提交
  useEffect(() => {
    if (state.step !== "recording" && state.step !== "submitting") {
      if (recorderRef.current?.state === "recording") stopRecording("discard");
      if (blobRef.current) {
        blobRef.current = null;
        setHasBlob(false);
      }
    }
  }, [state.step]);

  // 卸载：按"丢弃"处理并释放麦克风
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopIntentRef.current = "discard";
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 播放态：seek 完成再播；未切分句防御性跳过
  useEffect(() => {
    if (state.step !== "playing") return;
    setMicNotice(null); // 进入新一句示范，清掉上一句的提示
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
      video.play().catch(() => {});
    };
    if (video.readyState >= 1 && video.seekable.length > 0) {
      video.addEventListener("seeked", playFromStart, { once: true });
      video.currentTime = start;
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

  // 播放态：到句尾暂停并进入录音态；视频自然播完也兜底
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
    const onEnded = () => dispatch({ type: "clipEnded" });
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [state, unit.sentences]);

  // 出分展示倒计时
  useEffect(() => {
    if (state.step !== "scored") return;
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
    else if (state.step !== "idle")
      dispatch({ type: "select", index: Math.max(0, state.index - 1) });
  };
  const nextSentence = () => {
    if (canSkip(state)) dispatch({ type: "skip" });
    else if (state.step === "playing" && state.index + 1 < total)
      dispatch({ type: "select", index: state.index + 1 });
  };

  const result = state.step === "scored" ? state.result : null;

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
        {state.step === "recording" && recorderActive && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-lg font-bold text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white" />
            REC {recordSeconds}s
          </div>
        )}
      </div>

      {/* 三大控制按钮：上一句 / 暂停·继续 / 下一句 */}
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

      {/* 当前句 / 录音 / 出分 主卡 */}
      {current && (
        <section className="mt-5 rounded-3xl bg-white p-6 shadow-md ring-1 ring-slate-100">
          <p className="text-2xl leading-relaxed font-semibold">
            {current.index + 1}. {current.text}
          </p>

          {state.step === "playing" && (
            <p className="mt-3 text-lg text-slate-500">
              {isPaused ? "⏸ 已暂停，点「继续」接着听" : "🔊 示范播放中，仔细听…"}
            </p>
          )}

          {state.step === "recording" && (
            <div className="mt-3">
              {micNotice ? (
                <p className="text-lg text-amber-600">{micNotice}</p>
              ) : submitError ? (
                <p className="text-lg text-red-500">{submitError}</p>
              ) : recorderActive ? (
                <p className="text-lg text-red-500">🎤 轮到你读了！（已录 {recordSeconds} 秒）</p>
              ) : hasBlob ? (
                <p className="text-lg text-slate-500">录音已就绪</p>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-3 text-xl font-bold">
                {recorderActive ? (
                  <button
                    onClick={() => stopRecording("rerecord")}
                    className="rounded-xl bg-slate-100 py-4 active:bg-slate-200"
                  >
                    ↺ 重读
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMicNotice(null);
                      void startRecording();
                    }}
                    className="rounded-xl bg-slate-100 py-4 active:bg-slate-200"
                  >
                    🎙 开始读
                  </button>
                )}
                {hasBlob ? (
                  <button
                    onClick={() => void submitRecording()}
                    className="rounded-xl bg-emerald-500 py-4 text-white active:bg-emerald-600"
                  >
                    ↻ {submitError ? "重新提交" : "提交这段"}
                  </button>
                ) : (
                  <button
                    onClick={() => stopRecording("submit")}
                    disabled={!recorderActive}
                    className="rounded-xl bg-emerald-500 py-4 text-white active:bg-emerald-600 disabled:opacity-40"
                  >
                    ✓ 读好了
                  </button>
                )}
              </div>
            </div>
          )}

          {state.step === "submitting" && (
            <p className="mt-3 text-lg text-slate-500">正在评分…</p>
          )}

          {state.step === "scored" && result && (
            <div className="mt-3">
              <p className="text-5xl font-bold tabular-nums">
                {result.score}
                <span className="ml-3 text-3xl text-amber-500">
                  {"★".repeat(result.stars)}
                  <span className="text-slate-200">{"☆".repeat(3 - result.stars)}</span>
                </span>
              </p>
              <p className="mt-2 text-lg">
                {result.isNewBest && <span className="font-bold text-emerald-600">🏅 新纪录！</span>}
                <span className="ml-2 text-slate-500">
                  最好成绩 {localBest[state.index] ?? result.score} 分
                  {" · "}
                  {state.secondsLeft} 秒后下一句
                </span>
              </p>
              <button
                onClick={() => dispatch({ type: "retry" })}
                className="mt-3 w-full rounded-xl bg-slate-100 py-3 text-lg font-bold text-slate-700 active:bg-slate-200"
              >
                ↺ 再练一次这句
              </button>
            </div>
          )}

          {(state.step === "idle" || state.step === "finished") && (
            <p className="mt-3 text-lg text-slate-500">
              {state.step === "idle" ? "准备好就开始吧！" : "整个单元练完啦！"}
            </p>
          )}
        </section>
      )}

      {state.step === "idle" && (
        <button
          onClick={() => dispatch({ type: "begin" })}
          className="mt-5 w-full rounded-2xl bg-emerald-500 py-5 text-2xl font-bold text-white shadow-md active:bg-emerald-600"
        >
          ▶ 开始练这一单元
        </button>
      )}
      {state.step === "finished" && (
        <section className="mt-5 rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
          <p className="text-2xl font-bold text-emerald-700">
            🎉 整个单元练完啦！
          </p>
          <button
            onClick={() => dispatch({ type: "select", index: 0 })}
            className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
          >
            ↺ 再练一遍
          </button>
        </section>
      )}

      {/* 句子导航 */}
      <nav
        className="mt-6 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(total, 7)}, minmax(0, 1fr))` }}
      >
        {unit.sentences.map((s) => {
          const isCurrent = state.step !== "finished" && state.index === s.index;
          const best = localBest[s.index];
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
                {best != null ? `${best}分` : "未练"}
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
