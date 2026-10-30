"use client";

// 统一校对页（V0.2.1 票 04，合并原文本校对与切点校对；V0.2.2 票 01 改左右分栏）：
// 左列视频常驻（竖版占满整列高度），右列固定宽、独立滚动——当前句卡片
// （可编辑文本、±0.25s 时点微调、新增一句 / 并入上一句 / 与下一句合并 / 删除、
// 确认本句）全部在右列，整页无纵向滚动条。
// 任何改动都会让句子回到「未确认」；全部确认后详情/管理页才能进预览，
// 定稿发布只从预览页发起（V0.3 票 09 / ADR 0005）。
// 标准草稿保留教材原文参照与一键采用（1:1 对齐守卫，V0.2 整改语义不变）。
// UI 不做自动化，走 iPad 手工验收清单。壳只走 HTTP，不从 src/lib 引类型。
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { adjustBoundsMs, CALIBRATE_STEP_MS, MIN_CLIP_MS } from "@/lib/domain/calibrate";
import { formatMs, previewGate } from "@/components/shared/draft-ui";
import {
  useSentenceSave,
} from "@/components/shared/use-draft-save";
import {
  TEXTBOOK_MISALIGNED_HINT,
  textbookAligns,
} from "@/components/proofread/textbook";
import type {
  DraftDetailView,
  DraftSentenceView,
  SentencesResponse,
  TextbookModuleView,
} from "@/components/proofread/types";

const ACTION_BTNS =
  "rounded-2xl bg-white px-4 py-2 text-base font-semibold text-slate-600 ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40";
const ADJUST_BTNS =
  "rounded-xl bg-slate-100 py-3 text-lg font-bold active:bg-slate-200 disabled:opacity-40";

// V0.3 票 10：常驻状态条四态 + 初始空闲的配色（只切类名，容器始终渲染不塌）。
// saving 用 animate-pulse 给忙碌感，不引入 spinner 库；idle 为淡色占位。
type StatusTone = "error" | "saving" | "warn" | "success" | "idle";
const STATUS_TONE: Record<StatusTone, string> = {
  error: "bg-red-50 text-red-600",
  saving: "bg-slate-100 text-slate-600 animate-pulse",
  warn: "bg-amber-50 text-amber-700",
  success: "bg-emerald-50 text-emerald-700",
  idle: "bg-transparent text-slate-400",
};

export default function ProofreadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [draft, setDraft] = useState<DraftDetailView | null>(null);
  const [sentences, setSentences] = useState<DraftSentenceView[]>([]);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // 票 12（仅 standard 草稿）：教材原文参照；null = 加载中/失败或 custom 草稿
  const [textbookSentences, setTextbookSentences] = useState<string[] | null>(null);
  const [textbookFailed, setTextbookFailed] = useState(false);

  // position 是 sentences 数组下标（插删换血后按位置导航最稳）
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // V0.2.4 票 03：可编辑标题（发布以新标题为准）
  const [titleValue, setTitleValue] = useState<string | null>(null);
  const [titleSave, setTitleSave] = useState<
    null | "saving" | "saved" | "error"
  >(null);

  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;
  const videoRef = useRef<HTMLVideoElement>(null);

  const {
    saveStates,
    commitSave,
    scheduleSave,
    seedServerState,
    cancelTimer,
    clearTimers,
    clearSaveStates,
  } = useSentenceSave({
    draftId: id,
    // 比对键=文本+时点：任一变化都要发请求；确认/采用走 overrides.force
    keyOf: (s) => `${s.text}|${s.startMs}-${s.endMs}`,
    bodyFor: (s) => ({ text: s.text, startMs: s.startMs, endMs: s.endMs }),
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
          seedServerState(body.draft.sentences);
          // 票 12：standard 草稿拉取教材原文做参照（加载失败不阻断校对，只提示）
          if (body.draft.type === "standard" && body.draft.unitId && body.draft.moduleKind) {
            const query = new URLSearchParams({
              unitId: body.draft.unitId,
              moduleKind: body.draft.moduleKind,
            });
            try {
              const tbRes = await fetch(`/api/textbook/module?${query}`);
              if (cancelled) return;
              if (!tbRes.ok) {
                setTextbookFailed(true);
                return;
              }
              const tb = (await tbRes.json()) as TextbookModuleView;
              if (!cancelled) setTextbookSentences(tb.sentences);
            } catch {
              if (!cancelled) setTextbookFailed(true);
            }
          }
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

  const current = sentences[Math.min(position, sentences.length - 1)] ?? null;

  // 标题输入框跟随服务端值（载入/保存成功后同步）
  useEffect(() => {
    setTitleValue(draft?.title ?? null);
  }, [draft?.id, draft?.title]);

  async function saveTitle() {
    if (!id || titleSave === "saving") return;
    const next = (titleValue ?? "").trim();
    if (!next || next === draft?.title) {
      setTitleValue(draft?.title ?? "");
      return;
    }
    setTitleSave("saving");
    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDraft((prev) => (prev ? { ...prev, title: next } : prev));
      setTitleValue(next);
      // V0.3 票 10：saved 常驻，不再 1.5s 定时清除
      setTitleSave("saved");
    } catch {
      setTitleSave("error");
    }
  }

  const confirmedCount = sentences.filter(
    (s) => s.proofread === "confirmed"
  ).length;
  // 票 09：与 custom 详情/标准制作列表同一把尺 previewGate——
  // 至少一句且全部确认才可去预览；0 句草稿三处都不可预览。
  const gate = previewGate(sentences.length, confirmedCount);
  const currentSaveState = current ? saveStates[current.index] : undefined;

  /** 结构性操作（删/并/插）后整体换血：清编辑现场、停播放、按位置钳制导航 */
  function applySentences(next: DraftSentenceView[]) {
    clearTimers();
    videoRef.current?.pause();
    setPlaying(false);
    clearSaveStates();
    setSentences(next);
    seedServerState(next);
    setPosition((prev) => Math.min(prev, Math.max(0, next.length - 1)));
  }

  /** 微调当前句的某一边：领域层钳制（起点 ≥ 0、最短片段 200ms），
   * 终点不越过视频末尾（时长未知时不设上限，服务端校验兜底），防抖自动保存 */
  function adjust(field: "start" | "end", deltaMs: number) {
    if (!current) return;
    const index = current.index;
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

  function handleTextChange(text: string) {
    if (!current) return;
    const index = current.index;
    setSentences((prev) =>
      prev.map((s) => (s.index === index ? { ...s, text } : s))
    );
    scheduleSave(index);
  }

  function handleCommit() {
    if (!current) return;
    cancelTimer(current.index);
    void commitSave(current.index);
  }

  /** 切句：先把当前句未触发的防抖立即提交，再换句并停掉片段播放 */
  function selectSentence(nextPos: number) {
    if (!current || nextPos === position) return;
    cancelTimer(current.index);
    void commitSave(current.index);
    videoRef.current?.pause();
    setPlaying(false);
    setPosition(nextPos);
  }

  /** 确认本句：文本与时点一起确认（PUT confirm:true，force 带最新值）。
   * 之后任何改动都会被服务端置回 edited（未确认）。 */
  function confirmSentence() {
    if (!current) return;
    void commitSave(current.index, {
      force: true,
      body: {
        text: current.text,
        startMs: current.startMs,
        endMs: current.endMs,
        confirm: true,
      },
    });
  }

  /** 新增一句（拆分长句）：插在当前句后，自动跳到新句开始编辑 */
  async function handleInsert() {
    if (!id || !current || mutating) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/drafts/${id}/sentences/${current.index}/insert`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "" }),
        }
      );
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SentencesResponse;
      applySentences(body.sentences);
      setPosition(position + 1);
    } catch {
      setActionError("新增失败，请重试");
    } finally {
      setMutating(false);
    }
  }

  /** 并入上一句：调既有 merge（index-1 与 index 合并） */
  async function handleMergePrev() {
    if (!id || !current || mutating || position === 0) return;
    const target = sentences[position - 1];
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/drafts/${id}/sentences/${target.index}/merge`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SentencesResponse;
      applySentences(body.sentences);
      setPosition(Math.max(0, position - 1));
    } catch {
      setActionError("合并失败，请重试");
    } finally {
      setMutating(false);
    }
  }

  /** 与下一句合并：调既有 merge（index 与 index+1 合并），留在本句看合并结果 */
  async function handleMergeNext() {
    if (!id || !current || mutating) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/drafts/${id}/sentences/${current.index}/merge`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SentencesResponse;
      applySentences(body.sentences);
    } catch {
      setActionError("合并失败，请重试");
    } finally {
      setMutating(false);
    }
  }

  async function handleDelete() {
    if (!id || !current || mutating) return;
    if (
      !window.confirm(
        `确定删除第 ${current.index + 1} 句吗？删除后不能恢复。`
      )
    ) {
      return;
    }
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/drafts/${id}/sentences/${current.index}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as SentencesResponse;
      applySentences(body.sentences);
    } catch {
      setActionError("删除失败，请重试");
    } finally {
      setMutating(false);
    }
  }

  /** 票 12：一键采用本句的教材原文（仅 1:1 对齐时可达） */
  function handleAdopt() {
    if (!current || !textbookSentences || current.index >= textbookSentences.length)
      return;
    cancelTimer(current.index);
    void commitSave(current.index, {
      force: true,
      body: { text: textbookSentences[current.index] },
    });
  }

  /** 设为播放位（V0.2.3）：把起点/终点设为视频当前播放位置，钳制后防抖保存。
   * ASR 切点偏差可达 10s+，±0.25s 步进不现实——自由播放/拖到想要的位置一键落点。 */
  function setToPlayhead(field: "start" | "end") {
    const v = videoRef.current;
    if (!v || !current) return;
    const ms = Math.max(0, Math.round(v.currentTime * 1000));
    const index = current.index;
    setSentences((prev) =>
      prev.map((s) => {
        if (s.index !== index) return s;
        if (field === "start") {
          const start = Math.max(0, Math.min(ms, s.endMs - MIN_CLIP_MS));
          return { ...s, startMs: start };
        }
        let end = Math.max(ms, s.startMs + MIN_CLIP_MS);
        const duration = v.duration;
        if (typeof duration === "number" && duration > 0) {
          end = Math.min(end, Math.round(duration * 1000));
        }
        return { ...s, endMs: Math.max(end, s.startMs + MIN_CLIP_MS) };
      })
    );
    scheduleSave(index);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v || !current) return;
    if (playing) {
      v.pause();
      setPlaying(false);
      return;
    }
    v.currentTime = current.startMs / 1000;
    void v.play();
    setPlaying(true);
  }

  /** 播到本句终点毫秒就停 */
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || !playing || !current) return;
    if (v.currentTime * 1000 >= current.endMs) {
      v.pause();
      setPlaying(false);
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

  // V0.2 整改：句子被增删后与教材模块不再 1:1 对齐，采用按钮整体隐藏
  const textbookAligned = textbookAligns(textbookSentences, sentences.length);
  const textbookText =
    current && textbookSentences && current.index < textbookSentences.length
      ? textbookSentences[current.index]
      : null;

  // V0.3 票 10：常驻状态条（互斥单条）。优先级：结构操作错误 > 保存失败 >
  // 保存中 > 待重新确认（服务端把已确认句打回 edited）> 已保存 > 初始空闲。
  // 标题保存沿用同一状态集合、同一文案；saved/needs-reconfirm 均常驻，
  // 下一次编辑开始时被 saving 替换。调用方只渲染、不计时。
  const status: { tone: StatusTone; text: string } = (() => {
    if (actionError) return { tone: "error" as const, text: actionError };
    if (titleSave === "error" || currentSaveState === "error")
      return { tone: "error" as const, text: "保存失败，请重试" };
    if (titleSave === "saving" || currentSaveState === "saving")
      return { tone: "saving" as const, text: "保存中…" };
    if (currentSaveState === "needs-reconfirm")
      return { tone: "warn" as const, text: "句子已修改，请重新确认" };
    if (currentSaveState === "saved" || titleSave === "saved")
      return { tone: "success" as const, text: "所有修改已保存" };
    // 初始空闲（页面刚加载、无任何修改）：淡色占位，高度不塌
    return { tone: "idle" as const, text: "所有修改已保存" };
  })();

  // V0.3 票 10：教材原文提示是另一种常驻信息，不混进保存状态条——
  // 保持原样条件渲染在状态条下方，不参与保存态切换与跳动问题。
  const textbookHint:
    | { role: "alert" | "status"; className: string; text: string }
    | null =
    draft?.type === "standard" && textbookFailed
      ? {
          role: "alert",
          className: "bg-red-50 text-red-600",
          text: "教材原文加载失败，可直接手工校对",
        }
      : draft?.type === "standard" &&
          textbookSentences !== null &&
          !textbookAligned
        ? {
            role: "status",
            className: "bg-amber-50 text-amber-700",
            text: TEXTBOOK_MISALIGNED_HINT,
          }
        : null;

  if (notFound || failed || draft === null) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
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
      <div className="mx-auto max-w-xl px-5 py-8">
        <a href={backHref} className="text-lg text-emerald-700">
          {backLabel}
        </a>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{draft.title}</h1>
        <p
          className="mt-6 rounded-3xl bg-sky-50 px-6 py-8 text-center text-xl text-sky-700"
          role="status"
        >
          转写中，完成后回来校对句子。
        </p>
      </div>
    );
  }

  if (draft.status === "published") {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <a href={backHref} className="text-lg text-emerald-700">
          {backLabel}
        </a>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">{draft.title}</h1>
        <p className="mt-6 rounded-3xl bg-emerald-50 px-6 py-8 text-center text-xl text-emerald-700">
          这份内容已定稿发布，不能再编辑句子。
        </p>
        {/* V0.3 票 09：预览页发布成功后再回到本 URL 时落地在此，给出下一步入口 */}
        <a
          href={`/units/${draft.id}`}
          className="mt-4 block rounded-2xl bg-emerald-500 py-4 text-center text-xl font-bold text-white shadow-md active:bg-emerald-600"
        >
          去练习 →
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左列：视频常驻（竖版占满高度，横版按宽适配），黑底居中。
          controls 供自由拖动/暂停——「设为播放位」以当前播放位置为准 */}
      <div className="flex min-w-0 flex-1 items-center justify-center bg-black p-2">
        <video
          ref={videoRef}
          src={draft.videoUrl}
          onTimeUpdate={handleTimeUpdate}
          preload="auto"
          controls
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {/* 右列：操作区，固定宽、独立滚动 */}
      <aside className="flex h-full w-[30rem] shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <a href={backHref} className="shrink-0 text-base text-emerald-700">
            {backLabel}
          </a>
          <span className="shrink-0 rounded-full bg-amber-100 px-3 py-0.5 text-base font-bold text-amber-700">
            未校对
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          {/* V0.2.4 票 03：标题可就地编辑，发布以最新标题为准 */}
          <input
            value={titleValue ?? draft.title}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="草稿标题"
            className="min-w-0 flex-1 rounded-xl bg-transparent px-1 py-0.5 text-xl font-bold tracking-tight focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <span className="shrink-0 text-base text-slate-500" role="status">
            已确认 {confirmedCount} / {sentences.length} 句
          </span>
        </div>

        {/* V0.3 票 10：固定高度常驻状态条——min-h 与单行文案等高（text-sm
            行高 1.25rem + py-1.5 = 2rem），始终渲染只切文案/配色，右栏不跳动 */}
        <p
          role={status.tone === "error" ? "alert" : "status"}
          className={`flex min-h-8 items-center rounded-xl px-3 py-1.5 text-sm ${STATUS_TONE[status.tone]}`}
        >
          {status.text}
        </p>

        {textbookHint && (
          <p
            role={textbookHint.role}
            className={`rounded-xl px-3 py-1.5 text-sm ${textbookHint.className}`}
          >
            {textbookHint.text}
          </p>
        )}

        {current && (
          <section className="rounded-3xl bg-white p-4 shadow-md ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-base font-bold text-slate-500">
                第 {current.index + 1} 句
              </span>
              {current.proofread === "confirmed" ? (
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-base font-semibold text-emerald-700">
                  已确认
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-base text-slate-400">
                  未确认
                </span>
              )}
              <button
                type="button"
                onClick={togglePlay}
                disabled={mutating}
                className={`ml-auto rounded-xl px-4 py-2 text-base font-bold shadow-sm disabled:opacity-40 ${
                  playing
                    ? "bg-emerald-600 text-white active:bg-emerald-700"
                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-100"
                }`}
              >
                {playing ? "停止" : "▶ 播放本句"}
              </button>
            </div>

            <textarea
              value={current.text}
              onChange={(e) => handleTextChange(e.target.value)}
              onBlur={handleCommit}
              aria-label={`第 ${current.index + 1} 句文本`}
              rows={3}
              className="mt-2 w-full resize-none rounded-2xl bg-slate-50 px-4 py-3 text-xl leading-relaxed ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />

            {/* 票 12（仅 standard 草稿）：教材原文参照；ASR 文本与时点保留作对照 */}
            {textbookText !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-sky-50 px-3 py-2">
                <span className="shrink-0 text-sm font-semibold text-sky-700">
                  教材原文
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-600">
                  {textbookText}
                </span>
                {textbookAligned && current.text !== textbookText && (
                  <button
                    type="button"
                    onClick={handleAdopt}
                    disabled={mutating}
                    className="shrink-0 rounded-xl bg-sky-100 px-3 py-1.5 text-sm font-semibold text-sky-700 active:bg-sky-200 disabled:opacity-40"
                  >
                    采用教材原文
                  </button>
                )}
              </div>
            )}

            {/* 时点微调（V0.2.3 重排）：每行 = 标签 + 当前值 + 微调 + 设为播放位 */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-base font-semibold text-slate-500">起点</span>
                <span className="w-[4.5rem] text-lg font-bold tabular-nums text-emerald-700">
                  {formatMs(current.startMs)}
                </span>
                <button type="button" onClick={() => adjust("start", -CALIBRATE_STEP_MS)} disabled={mutating} className={ADJUST_BTNS}>
                  −0.25s
                </button>
                <button type="button" onClick={() => adjust("start", CALIBRATE_STEP_MS)} disabled={mutating} className={ADJUST_BTNS}>
                  ＋0.25s
                </button>
                <button
                  type="button"
                  onClick={() => setToPlayhead("start")}
                  disabled={mutating}
                  title="把起点设为视频当前播放位置"
                  className={ACTION_BTNS}
                >
                  设为起点
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-base font-semibold text-slate-500">终点</span>
                <span className="w-[4.5rem] text-lg font-bold tabular-nums text-emerald-700">
                  {formatMs(current.endMs)}
                </span>
                <button type="button" onClick={() => adjust("end", -CALIBRATE_STEP_MS)} disabled={mutating} className={ADJUST_BTNS}>
                  −0.25s
                </button>
                <button type="button" onClick={() => adjust("end", CALIBRATE_STEP_MS)} disabled={mutating} className={ADJUST_BTNS}>
                  ＋0.25s
                </button>
                <button
                  type="button"
                  onClick={() => setToPlayhead("end")}
                  disabled={mutating}
                  title="把终点设为视频当前播放位置"
                  className={ACTION_BTNS}
                >
                  设为终点
                </button>
              </div>
            </div>

            {/* 结构操作：新增（拆分长句）/ 并入上一句 / 与下一句合并 / 删除 */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void handleInsert()} disabled={mutating} className={ACTION_BTNS}>
                ＋新增一句
              </button>
              <button
                type="button"
                onClick={() => void handleMergePrev()}
                disabled={mutating || position === 0}
                className={ACTION_BTNS}
              >
                并入上一句
              </button>
              <button
                type="button"
                onClick={() => void handleMergeNext()}
                disabled={mutating || position >= sentences.length - 1}
                className={ACTION_BTNS}
              >
                与下一句合并
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={mutating || sentences.length <= 1}
                className="rounded-2xl bg-red-50 px-4 py-2 text-base font-semibold text-red-600 ring-1 ring-red-100 active:bg-red-100 disabled:opacity-40"
              >
                删除
              </button>
            </div>

            <button
              type="button"
              onClick={confirmSentence}
              disabled={mutating || currentSaveState === "saving"}
              className={`mt-3 w-full rounded-2xl py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40 ${
                current.proofread === "confirmed" ? "bg-emerald-600" : "bg-emerald-500"
              }`}
            >
              {current.proofread === "confirmed"
                ? "本句已确认 ✓"
                : "✓ 确认本句"}
            </button>
          </section>
        )}

        {/* 句间导航：末句时「下一句」变为「预览 →」（V0.3 票 09 / ADR 0005：
            定稿发布只从预览页发起，此处只负责把人送到预览） */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => selectSentence(position - 1)}
            disabled={position === 0 || mutating}
            className="rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
          >
            ‹ 上一句
          </button>
          <span className="text-lg text-slate-500">
            第 {current ? current.index + 1 : 0} / {sentences.length} 句
          </span>
          {position < sentences.length - 1 ? (
            <button
              type="button"
              onClick={() => selectSentence(position + 1)}
              disabled={position >= sentences.length - 1 || mutating}
              className="rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
            >
              下一句 ›
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                window.location.href = `/drafts/${id}/preview`;
              }}
              disabled={!gate.canPreview}
              title={
                gate.unconfirmedCount > 0
                  ? `还有 ${gate.unconfirmedCount} 句未确认`
                  : sentences.length === 0
                    ? "还没有句子"
                    : undefined
              }
              className="rounded-2xl bg-emerald-500 px-5 py-2 text-lg font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
            >
              预览 →
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
