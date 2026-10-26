"use client";

// 切点校对页（票 08）：改造自 V0.1 单元「校对模式」。保留逐句播放与 ±0.25s 微调；
// 「导出 JSON 发给 Claude」流程退役，起止时间经 PUT /api/drafts/[id]/sentences/[index]
// 直接保存回草稿（微调后 0.8s 防抖自动保存，切句前立即补存），重进接着调。
// 任意草稿可用，自定义视频走 /api/media 鉴权流。UI 不做自动化，走 iPad 手工验收清单。
// V0.2 整改：单句保存骨架（saving/saved/error + 防抖 + 没变不发请求）
// 与文本校对页共用 useSentenceSave（比对键=起止毫秒对）。
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ClipCard from "@/components/cutpoint/ClipCard";
import { adjustBoundsMs, MIN_CLIP_MS } from "@/lib/domain/calibrate";
import {
  useSentenceSave,
} from "@/components/shared/use-draft-save";
import type {
  DraftDetailView,
  DraftSentenceView,
} from "@/components/proofread/types";

export default function CutpointPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [draft, setDraft] = useState<DraftDetailView | null>(null);
  const [sentences, setSentences] = useState<DraftSentenceView[]>([]);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [current, setCurrent] = useState(0);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    saveStates,
    commitSave,
    scheduleSave,
    seedServerState,
    cancelTimer,
  } = useSentenceSave({
    draftId: id,
    keyOf: (s) => `${s.startMs}-${s.endMs}`,
    bodyFor: (s) => ({ startMs: s.startMs, endMs: s.endMs }),
    applySentence: (sentence) =>
      setSentences((prev) =>
        prev.map((s) => (s.index === sentence.index ? sentence : s))
      ),
    getSentence: (index) =>
      sentencesRef.current.find((s) => s.index === index),
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/drafts/${id}`);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const body = (await res.json()) as { draft?: DraftDetailView };
        if (cancelled) return;
        if (body.draft) {
          setDraft(body.draft);
          setSentences(body.draft.sentences);
          setCurrent(body.draft.sentences[0]?.index ?? 0);
          seedServerState(body.draft.sentences);
        } else {
          setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, seedServerState]);

  const currentSentence =
    sentences.find((s) => s.index === current) ?? sentences[0] ?? null;

  /** 微调当前句的某一边：领域层钳制（起点 ≥ 0、最短片段 200ms），
   * 终点另外不越过视频末尾（时长未知时不设上限，服务端校验兜底），
   * 防抖后自动保存。 */
  function adjust(index: number, field: "start" | "end", deltaMs: number) {
    setSentences((prev) =>
      prev.map((s) => {
        if (s.index !== index) return s;
        const { start, end } = adjustBoundsMs(
          { start: s.startMs, end: s.endMs },
          field,
          deltaMs
        );
        let endMs = end;
        const duration = videoRef.current?.duration;
        if (field === "end" && typeof duration === "number" && duration > 0) {
          endMs = Math.max(
            start + MIN_CLIP_MS,
            Math.min(endMs, Math.round(duration * 1000))
          );
        }
        return { ...s, startMs: start, endMs };
      })
    );
    scheduleSave(index);
  }

  /** 切句：先把当前句未触发的防抖立即提交，再换句并停掉片段播放 */
  function selectSentence(index: number) {
    if (index === current) return;
    cancelTimer(current);
    void commitSave(current);
    videoRef.current?.pause();
    setPlayingIndex(null);
    setCurrent(index);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v || !currentSentence) return;
    if (playingIndex !== null) {
      v.pause();
      setPlayingIndex(null);
      return;
    }
    v.currentTime = currentSentence.startMs / 1000;
    void v.play();
    setPlayingIndex(currentSentence.index);
  }

  /** 播到本句终点毫秒就停 */
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || playingIndex === null) return;
    const s = sentencesRef.current.find((x) => x.index === playingIndex);
    if (s && v.currentTime * 1000 >= s.endMs) {
      v.pause();
      setPlayingIndex(null);
    }
  }

  // 票 12 + V0.2 整改：standard 草稿从管理端进入，回「标准内容制作」；
  // custom 草稿回详情页；draft 未加载时退回自定义内容列表兜底
  const backHref =
    draft?.type === "standard"
      ? "/admin/standard"
      : draft
        ? `/custom/${draft.id}`
        : "/custom";
  const backLabel =
    draft?.type === "standard"
      ? "← 返回标准内容制作"
      : draft
        ? "← 返回内容详情"
        : "← 返回自定义内容";

  if (notFound || failed || draft === null) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <a href={backHref} className="text-lg text-emerald-700">
          {backLabel}
        </a>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          {notFound
            ? "草稿不存在，或没有权限访问"
            : failed
              ? "加载失败，请刷新重试"
              : "加载中…"}
        </p>
      </div>
    );
  }

  if (draft.status === "transcribing") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <a href={backHref} className="text-lg text-emerald-700">
          {backLabel}
        </a>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{draft.title}</h1>
        <p
          className="mt-6 rounded-3xl bg-sky-50 px-6 py-8 text-center text-xl text-sky-700"
          role="status"
        >
          转写中，完成后回来校对切点。
        </p>
      </div>
    );
  }

  if (draft.status === "published") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8">
        <a href={backHref} className="text-lg text-emerald-700">
          {backLabel}
        </a>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{draft.title}</h1>
        <p className="mt-6 rounded-3xl bg-emerald-50 px-6 py-8 text-center text-xl text-emerald-700">
          这份内容已定稿发布，不能再调整切点。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <a href={backHref} className="text-lg text-emerald-700">
        {backLabel}
      </a>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{draft.title}</h1>
        <span className="rounded-full bg-amber-100 px-4 py-1 text-lg font-bold text-amber-700">
          未校对
        </span>
      </div>

      <a
        href={`/drafts/${draft.id}/proofread`}
        className="mt-3 inline-block text-base text-emerald-700 underline underline-offset-4"
      >
        改句子文字？去文本校对 →
      </a>

      <p className="mt-3 text-base text-slate-400">
        播放本句听效果，用按钮微调起点/终点（步进 0.25 秒）；改动自动保存，
        中途退出可回来接着做。
      </p>

      {!draft.videoUrl ? (
        <p className="mt-6 rounded-3xl bg-red-50 px-6 py-8 text-center text-xl text-red-600" role="alert">
          视频缺失，无法校对切点。
        </p>
      ) : sentences.length === 0 ? (
        <>
          <video
            ref={videoRef}
            src={draft.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="mt-5 w-full rounded-2xl bg-black shadow-md"
          />
          <p className="mt-6 rounded-3xl bg-white px-6 py-10 text-center text-xl text-slate-400 shadow-md ring-1 ring-slate-100">
            暂无句子
          </p>
        </>
      ) : (
        <>
          <video
            ref={videoRef}
            src={draft.videoUrl}
            playsInline
            preload="metadata"
            onTimeUpdate={handleTimeUpdate}
            className="mt-5 w-full rounded-2xl bg-black shadow-md"
          />

          {currentSentence && (
            <div className="mt-4">
              <ClipCard
                number={currentSentence.index + 1}
                text={currentSentence.text}
                startMs={currentSentence.startMs}
                endMs={currentSentence.endMs}
                playing={playingIndex === currentSentence.index}
                saveState={saveStates[currentSentence.index]}
                disabled={false}
                onAdjust={(field, deltaMs) =>
                  adjust(currentSentence.index, field, deltaMs)
                }
                onPlay={togglePlay}
              />
            </div>
          )}

          <nav className="mt-4 grid grid-cols-7 gap-2" aria-label="选择句子">
            {sentences.map((s) => (
              <button
                key={s.index}
                type="button"
                onClick={() => selectSentence(s.index)}
                aria-current={current === s.index ? "true" : undefined}
                className={`rounded-xl py-3 text-xl font-bold shadow-sm ${
                  current === s.index
                    ? "bg-emerald-500 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                }`}
              >
                {s.index + 1}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
