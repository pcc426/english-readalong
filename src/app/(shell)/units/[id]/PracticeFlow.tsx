"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import {
  canSkip,
  TICK_MS,
  initialFlow,
  reduceFlow,
  type FlowEvent,
  type FlowMode,
  type FlowState,
} from "@/lib/domain/practice-flow";
import { mapScoreToStars } from "@/lib/domain/stars";
import { sourceLabel } from "@/lib/content/source-label";
import type { ContentDetail } from "@/lib/content/view";
import { cellStars, replayControl } from "./practice-panel";

// 录音最长秒数：超时自动提交，防止孩子忘按"读好了"一直录
const MAX_RECORD_SECONDS = 15;

// 出分鼓励语：按星级分池轮换（同档不连续重复），语音文件由 edge-tts 预生成
const PRAISE: Record<number, Array<{ text: string; src: string }>> = {
  3: [
    { text: "Excellent!", src: "/media/audio/3-excellent.mp3" },
    { text: "Perfect!", src: "/media/audio/3-perfect.mp3" },
    { text: "Amazing!", src: "/media/audio/3-amazing.mp3" },
    { text: "Fantastic!", src: "/media/audio/3-fantastic.mp3" },
  ],
  2: [
    { text: "Good!", src: "/media/audio/2-good.mp3" },
    { text: "Not bad!", src: "/media/audio/2-not-bad.mp3" },
    { text: "Good job!", src: "/media/audio/2-good-job.mp3" },
    { text: "Well done!", src: "/media/audio/2-well-done.mp3" },
  ],
  1: [{ text: "Try again!", src: "/media/audio/1-try-again.mp3" }],
};

/** 停止录音的意图：提交评分 / 弃旧重录 / 纯丢弃（不重录不提交） */
type StopIntent = "submit" | "rerecord" | "discard";

export default function PracticeFlow({
  unit,
  mode = "practice",
  backHref = "/",
  backLabel = "‹ 单元列表",
  unconfirmedCount = 0,
}: {
  unit: ContentDetail;
  /** practice＝正式练习（默认，行为零变化）；preview＝草稿预览：不录音不评分（V0.3 票 08） */
  mode?: FlowMode;
  /** 左上返回链接（preview 下指向校对页）；默认维持正式练习的「单元列表」 */
  backHref?: string;
  backLabel?: string;
  /** preview 专用：未确认句数，>0 时顶部提示且定稿按钮禁用 */
  unconfirmedCount?: number;
}) {
  const practice = mode === "practice";
  const total = unit.sentences.length;
  const [state, dispatch] = useReducer(
    (s: FlowState, e: FlowEvent) => reduceFlow(s, e, total, mode),
    initialFlow()
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  // isPaused 跟随视频真实状态：点按钮暂停、系统中断、自动暂停都会同步到按钮文案
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setIsPaused(video.paused);
    sync();
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
    };
  }, []);

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
  // 会话过期（提交练习遇 401）：与普通提交失败分开处理，提示重新登录
  const [sessionExpired, setSessionExpired] = useState(false);
  const [minePlaying, setMinePlaying] = useState(false);
  const mineAudioRef = useRef<HTMLAudioElement | null>(null);
  const mineUrlRef = useRef<string | null>(null);
  const [praiseText, setPraiseText] = useState<string | null>(null);
  const praiseAudioRef = useRef<HTMLAudioElement | null>(null);
  const praiseCursor = useRef<Record<number, number>>({});
  const [localBest, setLocalBest] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      unit.sentences
        .filter((s) => s.bestScore != null)
        .map((s) => [s.index, Math.round(s.bestScore!)])
    )
  );
  // 本次会话练过（出过分）的句子，用于收尾时统计"本次练习"总星级
  const [sessionPracticed, setSessionPracticed] = useState<Set<number>>(new Set());
  // 练习 run 归属（票 04）：一次 mount（或「再练一遍」整体重开）为新一轮，
  // 轮内所有评分提交共享同一 runId，服务端据此统计「最近一次练习」总星数
  const [runId, setRunId] = useState(() => crypto.randomUUID());

  const current = state.step === "finished" ? null : unit.sentences[state.index];
  // 依赖 key：只在"进入某个句子的某个步骤"时触发相关 effect（tick/held 等细节变化不触发）
  const flowKey = state.step === "finished" ? "finished" : `${state.step}-${state.index}`;
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
      stopIntentRef.current = "submit"; // 新录音默认意图回到提交，防止残留
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
      form.append("runId", runId);
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
        setSessionPracticed((prev) => new Set(prev).add(sentenceIndex));
        setMicNotice(null);
        // 出分后保留录音，供"听我读的"回放；离开该句时统一清理
        dispatch({ type: "scored", result });
      } else {
        dispatch({ type: "submitFailed" });
        if (res.status === 401) {
          // API 守卫判会话失效（ADR-0003）：普通"再试一次"救不回来，引导重新登录
          setSessionExpired(true);
          return;
        }
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

  // 录音态：自动开录（保留已有录音时等用户选择"重新提交"或"重读"）。
  // preview 整体短路：状态机不会进 recording，这里再挡一道，绝不请求麦克风（票 08）
  useEffect(() => {
    if (!practice) return;
    if (state.step === "recording" && !hasBlob && !recorderActive && !micNotice) {
      void startRecording();
    }
  }, [state.step, hasBlob, recorderActive, micNotice, practice]);

  // 录音计时 + 超时自动提交（preview 下整体短路）
  useEffect(() => {
    if (!practice) return;
    if (state.step !== "recording" || !recorderActive) return;
    const timer = setTimeout(() => {
      // 副作用不能放 setState updater 里：dev 严格模式 updater 会双调用，
      // 第二次对已停止的 recorder 调 stop() 抛 InvalidStateError
      if (recordSeconds + 1 >= MAX_RECORD_SECONDS) stopRecording("submit");
      setRecordSeconds(recordSeconds + 1);
    }, TICK_MS);
    return () => clearTimeout(timer);
  }, [state.step, recorderActive, recordSeconds, practice]);

  // 离开本句（跳句、出分后离开、收尾）时：丢弃进行中的录音与回放 URL，
  // 防止上一句的音频混进下一次提交
  useEffect(() => {
    if (state.step !== "recording" && state.step !== "submitting" && state.step !== "scored") {
      if (recorderRef.current?.state === "recording") stopRecording("discard");
      if (blobRef.current) {
        blobRef.current = null;
        setHasBlob(false);
      }
      if (mineUrlRef.current) {
        URL.revokeObjectURL(mineUrlRef.current);
        mineUrlRef.current = null;
        mineAudioRef.current?.pause();
        mineAudioRef.current = null;
        setMinePlaying(false);
      }
    }
  }, [state.step]);

  /** 出分页"听我读的"：回放孩子刚才的录音，切换播放/停止 */
  function toggleMine() {
    if (!blobRef.current) return;
    dispatch({ type: "hold" });
    praiseAudioRef.current?.pause(); // 听自己的录音时暂停鼓励语音
    // 首次播放时创建 Audio；按钮文案由 onplay/onpause 事件同步
    if (!mineUrlRef.current) mineUrlRef.current = URL.createObjectURL(blobRef.current);
    if (!mineAudioRef.current) {
      mineAudioRef.current = new Audio(mineUrlRef.current);
      mineAudioRef.current.onplay = () => setMinePlaying(true);
      mineAudioRef.current.onpause = () => setMinePlaying(false);
      mineAudioRef.current.onended = () => setMinePlaying(false);
    }
    const audio = mineAudioRef.current;
    // 只切换播放状态：暂停着就从头播，播着就暂停
    if (audio.paused) {
      audio.currentTime = 0;
      audio.play().catch(() => setMinePlaying(false));
    } else {
      audio.pause();
    }
  }

  /** 出分页"再练一次这句"：暂停回放、丢弃旧录音，回录音态重新开录 */
  function retrySentence() {
    mineAudioRef.current?.pause();
    setMinePlaying(false);
    if (mineUrlRef.current) {
      URL.revokeObjectURL(mineUrlRef.current);
      mineUrlRef.current = null;
      mineAudioRef.current = null;
    }
    blobRef.current = null;
    setHasBlob(false);
    dispatch({ type: "retry" });
  }

  // 挂载/卸载：卸载按"丢弃"处理并释放麦克风。
  // 挂载时必须把 mountedRef 设回 true——React 严格模式（仅 dev）会先预演一次
  // 清理，少了这句 ref 会从页面打开起恒为 false，所有录音都被当"已卸载"丢弃。
  useEffect(() => {
    mountedRef.current = true;
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

  // 出分展示倒计时（preview 无出分态，整体短路）
  useEffect(() => {
    if (!practice) return;
    if (state.step !== "scored") return;
    const timer = setTimeout(() => dispatch({ type: "tick" }), TICK_MS);
    return () => clearTimeout(timer);
  }, [state, practice]);

  // 出分时播放星级对应的鼓励语音（同档轮换），并把说的短语显示在卡上。
  // preview 整体短路：不播鼓励语音（票 08）
  useEffect(() => {
    if (!practice) return;
    if (state.step !== "scored") return;
    const pool = PRAISE[state.result.stars] ?? [];
    if (pool.length === 0) return;
    const level = state.result.stars;
    const i = (praiseCursor.current[level] ?? 0) % pool.length;
    praiseCursor.current[level] = i + 1;
    const pick = pool[i];
    setPraiseText(pick.text);
    const audio = new Audio(pick.src);
    praiseAudioRef.current?.pause();
    praiseAudioRef.current = audio;
    audio.play().catch(() => {
    /* 自动播放被拦截时保持静音，文字鼓励仍在 */
    });
    return () => {
      audio.pause();
      setPraiseText(null);
    };
    // 只在进入出分态时触发一次（tick/held 变化不重播）
  }, [flowKey, practice]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || state.step !== "playing") return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  // 录音态点"再读一遍"：中断录音、丢弃旧录音，重播本句示范
  const replaySentence = () => {
    if (recorderRef.current?.state === "recording") stopRecording("discard");
    blobRef.current = null;
    setHasBlob(false);
    setMicNotice(null);
    setSubmitError(null);
    dispatch({ type: "replay" });
  };

  const prevSentence = () => {
    if (state.step === "finished") dispatch({ type: "select", index: total - 1 });
    else if (state.step !== "idle")
      dispatch({ type: "select", index: Math.max(0, state.index - 1) });
  };
  const nextSentence = () => {
    // clipDone（preview 播完停住）同样可跳下一句（票 08）
    if (canSkip(state) || state.step === "clipDone") dispatch({ type: "skip" });
    else if (state.step === "playing" && state.index + 1 < total)
      dispatch({ type: "select", index: state.index + 1 });
  };

  /** 收尾页「再练一遍」：整体重开＝新一轮练习，换新 runId（票 04） */
  const restartRun = () => {
    setRunId(crypto.randomUUID());
    dispatch({ type: "select", index: 0 });
  };

  // —— 定稿发布（仅 preview 渲染入口，票 08 / ADR 0005：发布动作只从预览页发起） ——
  // 沿用校对页的确认文案与 422 逐句问题拼接；成功跳真实练习页 /units/{id}
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  async function publishDraft() {
    if (publishing) return;
    if (
      !window.confirm(
        `确定把「${unit.title}」定稿发布吗？发布后所有账号可见、可跟读。`
      )
    ) {
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/drafts/${unit.id}/publish`, {
        method: "POST",
      });
      if (res.ok) {
        window.location.href = `/units/${unit.id}`;
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: {
          message?: string;
          issues?: Array<{ index: number | null; problem: string }>;
        };
      } | null;
      const issues = body?.error?.issues
        ?.map(
          (i) => (i.index === null ? "" : `第 ${i.index + 1} 句 `) + i.problem
        )
        .join("；");
      setPublishError(
        (body?.error?.message ?? "定稿失败，请重试") + (issues ? `：${issues}` : "")
      );
    } catch {
      setPublishError("网络开小差了，请重试");
    } finally {
      setPublishing(false);
    }
  }

  const result = state.step === "scored" ? state.result : null;
  // 播放控制排中间按钮的文案与色调（票 11）：录音态重播示范改叫「再播一遍」＝高亮黄
  const replay = replayControl(state.step, isPaused);

  return (
    <>
      {/* 左列：视频常驻（竖版占满高度，横版按宽适配），REC 角标叠加其上；
          出分鼓励语渲染在右列，视频尺寸恒定不再被挤压 */}
      <div className="relative flex min-w-0 flex-1 items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={unit.video}
          playsInline
          preload="metadata"
          className="max-h-full max-w-full object-contain"
        />
        {state.step === "recording" && recorderActive && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-lg font-bold text-white">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white" />
            REC {recordSeconds}s
          </div>
        )}
      </div>

      {/* 右列：操作区，固定宽、独立滚动 */}
      <aside className="flex h-full w-[26rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
        <div>
          <a href={backHref} className="text-base text-emerald-700">
            {backLabel}
          </a>
          <h1 className="mt-1 truncate text-2xl font-bold">{unit.title}</h1>
          <p className="text-base text-slate-500">
            {sourceLabel(unit.source)} · {unit.sentences.length} 句
          </p>
          {/* 票 08：预览模式标记 + 用户指定的 info 提示小字（右栏标题区） */}
          {mode === "preview" && (
            <div className="mt-2">
              <span className="rounded-full bg-sky-100 px-3 py-0.5 text-base font-bold text-sky-700">
                预览模式
              </span>
              <p className="mt-1 text-sm text-slate-500">
                仅供检查句子切分，不会录音、不会评分
              </p>
            </div>
          )}
        </div>

        {/* 票 08：有未确认句直接访问预览 URL——可预览但定稿按钮禁用 */}
        {mode === "preview" && unconfirmedCount > 0 && (
          <p
            role="status"
            className="shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-base text-amber-700"
          >
            还有 {unconfirmedCount} 句未确认，可预览但不能定稿
          </p>
        )}

        {/* 当前句 / 录音 / 出分 主卡（票 11：上移到标题行下，当前句文本常驻） */}
        {current && (
          <section className="shrink-0 rounded-3xl bg-white p-4 shadow-md ring-1 ring-slate-100">
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

            {/* 票 08（preview）：示范播完停住等操作——重播/换句，不录音 */}
            {state.step === "clipDone" && (
              <p className="mt-3 text-lg text-slate-500">
                ⏹ 本句播完，可「再播一遍」或换句
              </p>
            )}

            {state.step === "scored" && result && (
              <div className="mt-3">
                {praiseText && (
                  <p className="text-2xl font-bold text-emerald-600">{praiseText}</p>
                )}
                <p className="text-5xl font-bold tabular-nums">
                  {Math.round(result.score)}
                  <span className="ml-2 text-5xl text-amber-500">
                    {"★".repeat(result.stars)}
                    <span className="text-slate-200">{"☆".repeat(3 - result.stars)}</span>
                  </span>
                </p>
                <p className="mt-2 text-lg">
                  {result.isNewBest && <span className="font-bold text-emerald-600">🏅 新纪录！</span>}
                  <span className="ml-2 text-slate-500">
                    最好成绩 {localBest[state.index] ?? Math.round(result.score)} 分
                    {!state.held && (
                      <span className="ml-2 text-slate-400">{state.secondsLeft} 秒后下一句</span>
                    )}
                  </span>
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-lg font-bold">
                  <button
                    onClick={toggleMine}
                    className="rounded-xl bg-slate-100 py-4 text-slate-700 active:bg-slate-200"
                  >
                    {minePlaying ? "⏹ 停止播放" : "🎧 听我读的"}
                  </button>
                  <button
                    onClick={retrySentence}
                    className="rounded-xl bg-emerald-500 py-4 text-white active:bg-emerald-600"
                  >
                    ↺ 再练一次这句
                  </button>
                </div>
              </div>
            )}

            {(state.step === "idle" || state.step === "finished") && (
              <p className="mt-3 text-lg text-slate-500">
                {state.step === "idle"
                  ? practice
                    ? "准备好就开始吧！"
                    : "点「开始播放」逐句检查切分"
                  : "整个单元练完啦！"}
              </p>
            )}
          </section>
        )}

        {/* 播放控制排：上一句 / 暂停·继续·再播一遍 / 下一句（票 11：中间按钮改名与配色）
            票 08：clipDone（preview 播完停住）中间按钮＝再播一遍、可换下一句 */}
        <div className="grid shrink-0 grid-cols-3 gap-3">
          <button
            onClick={prevSentence}
            disabled={state.step === "idle"}
            className="rounded-2xl bg-white py-4 text-xl font-bold text-slate-700 shadow-md ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
          >
            ⏮ 上一句
          </button>
          <button
            onClick={
              state.step === "recording" || state.step === "clipDone"
                ? replaySentence
                : togglePlay
            }
            disabled={
              state.step !== "playing" &&
              state.step !== "recording" &&
              state.step !== "clipDone"
            }
            className={`rounded-2xl py-4 text-xl font-bold text-white shadow-md disabled:opacity-40 ${
              replay.highlight
                ? "bg-amber-400 active:bg-amber-500"
                : "bg-slate-700 active:bg-slate-800"
            }`}
          >
            {replay.label}
          </button>
          <button
            onClick={nextSentence}
            disabled={
              state.step === "idle" ||
              state.step === "finished" ||
              ((state.step === "playing" || state.step === "clipDone") &&
                state.index + 1 >= total)
            }
            className="rounded-2xl bg-white py-4 text-xl font-bold text-slate-700 shadow-md ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
          >
            下一句 ⏭
          </button>
        </div>

        {/* 主操作排（票 11）：开始练习 + 听我读（本句尚无录音时置灰，读完一句后可回放）。
            preview（票 08）：听我读不渲染，只留全宽「开始播放」（用户手势后才能自动播声） */}
        {state.step === "idle" && practice && (
          <div className="grid shrink-0 grid-cols-[2fr_1fr] gap-3">
            <button
              onClick={() => dispatch({ type: "begin" })}
              className="rounded-2xl bg-emerald-500 py-4 text-2xl font-bold text-white shadow-md active:bg-emerald-600"
            >
              ▶ 开始练习
            </button>
            <button
              onClick={toggleMine}
              disabled={!hasBlob}
              title={hasBlob ? undefined : "读完一句后可回放录音"}
              className="rounded-2xl bg-white py-4 text-base font-bold text-slate-400 shadow-md ring-1 ring-slate-100 disabled:opacity-60"
            >
              🎧 听我读
            </button>
          </div>
        )}
        {state.step === "idle" && !practice && (
          <button
            onClick={() => dispatch({ type: "begin" })}
            className="shrink-0 rounded-2xl bg-emerald-500 py-4 text-2xl font-bold text-white shadow-md active:bg-emerald-600"
          >
            ▶ 开始播放
          </button>
        )}

        {/* 底部操作排（票 08，仅 preview）：退回校对 / 定稿发布——
            定稿动作只从预览页发起（ADR 0005），确认文案与 422 展示沿用校对页 */}
        {mode === "preview" && (
          <>
            {publishError && (
              <p
                role="alert"
                className="shrink-0 rounded-xl bg-red-50 px-3 py-2 text-base text-red-600"
              >
                {publishError}
              </p>
            )}
            <div className="grid shrink-0 grid-cols-2 gap-3">
              <a
                href={backHref}
                className="rounded-2xl bg-white py-4 text-center text-xl font-bold text-slate-700 shadow-md ring-1 ring-slate-200 active:bg-slate-100"
              >
                ← 退回校对
              </a>
              <button
                onClick={() => void publishDraft()}
                disabled={publishing || unconfirmedCount > 0}
                title={
                  unconfirmedCount > 0
                    ? `还有 ${unconfirmedCount} 句未确认，可预览但不能定稿`
                    : undefined
                }
                className="rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
              >
                定稿发布
              </button>
            </div>
          </>
        )}

        {/* 会话过期：覆盖普通提交错误提示，引导去重新登录（回来后本页重新加载即恢复） */}
        {sessionExpired && (
          <section className="shrink-0 rounded-3xl bg-amber-50 p-4 text-center ring-1 ring-amber-100">
            <p className="text-lg font-semibold text-amber-700">
              登录已过期，请重新登录
            </p>
            <a
              href="/login"
              className="mt-3 block rounded-2xl bg-emerald-500 py-3 text-xl font-bold text-white active:bg-emerald-600"
            >
              去登录
            </a>
          </section>
        )}

        {/* 编号句格（票 11：mt-auto 沉底）：序号 + 下方最佳星级 ★×n（amber-500 加粗）/「未练」 */}
        <nav
          className="mt-auto grid shrink-0 gap-2 pt-2"
          style={{ gridTemplateColumns: `repeat(${Math.min(total, 7)}, minmax(0, 1fr))` }}
        >
          {unit.sentences.map((s) => {
            const isCurrent = state.step !== "finished" && state.index === s.index;
            const best = localBest[s.index];
            const cell = cellStars(best != null ? mapScoreToStars(best) : null);
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
                <span
                  className={`mt-0.5 block text-xs ${
                    cell.learned ? "font-bold text-amber-500" : "font-normal text-slate-400"
                  }`}
                >
                  {cell.text}
                </span>
              </button>
            );
          })}
        </nav>

        {/* 收尾总结（票 11：保持在句格之后；preview 无收尾页，票 08）；「再练一遍」整体重开换新 runId（票 04） */}
        {state.step === "finished" && practice && (() => {
          const earned = unit.sentences.reduce((sum, s) => {
            if (!sessionPracticed.has(s.index) || localBest[s.index] == null) return sum;
            return sum + mapScoreToStars(localBest[s.index]);
          }, 0);
          const practiced = sessionPracticed.size;
          return (
            <section className="mt-5 rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
              <p className="text-2xl font-bold text-emerald-700">
                🎉 整个单元练完啦！
              </p>
              {practiced > 0 && (
                <p className="mt-3 text-3xl font-bold text-amber-500">
                  本次练习共收获 {earned} 颗星
                  <span className="ml-2 text-lg font-normal text-slate-500">
                    （练了 {practiced} 句，满 {practiced * 3} 颗）
                  </span>
                </p>
              )}
              <button
                onClick={restartRun}
                className="mt-4 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white active:bg-emerald-600"
              >
                ↺ 再练一遍
              </button>
            </section>
          );
        })()}
      </aside>
    </>
  );
}
