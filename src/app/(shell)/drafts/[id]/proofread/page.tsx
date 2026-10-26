"use client";

// 文本校对页（票 07）：每页 10 句，逐句对照视频画面字幕。
// 可改文本（失焦或停顿 0.8s 自动保存）、播放本句片段、删除、与下句合并、确认本页；
// 所有改动即时落草稿，中断后回来接着做。UI 不做自动化，走 iPad 手工验收清单。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import SentenceRow, { type RowSaveState } from "@/components/proofread/SentenceRow";
import {
  type DraftSentenceView,
  type DraftDetailView,
  type SentenceUpdateResponse,
  type SentencesResponse,
  type TextbookModuleView,
} from "@/components/proofread/types";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 800;
const SAVED_HINT_MS = 1500;

export default function ProofreadPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [draft, setDraft] = useState<DraftDetailView | null>(null);
  const [sentences, setSentences] = useState<DraftSentenceView[]>([]);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  // 票 12（仅 standard 草稿）：教材原文句子清单；null=加载中/加载失败或 custom 草稿
  const [textbookSentences, setTextbookSentences] = useState<string[] | null>(null);
  const [textbookFailed, setTextbookFailed] = useState(false);

  const [page, setPage] = useState(0);
  const [saveStates, setSaveStates] = useState<Record<number, RowSaveState>>({});
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;
  /** 每句最近一次服务端文本：判断「没改就不发请求」 */
  const serverTexts = useRef<Record<number, string>>({});
  /** 每句的防抖保存定时器 */
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const videoRef = useRef<HTMLVideoElement>(null);

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
          serverTexts.current = Object.fromEntries(
            body.draft.sentences.map((s) => [s.index, s.text])
          );
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
  }, [id]);

  const pageCount = Math.max(1, Math.ceil(sentences.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageSentences = sentences.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE
  );
  const confirmedCount = sentences.filter(
    (s) => s.proofread === "confirmed"
  ).length;

  /** 服务端返回整个数组时整体换血（删除/合并后序号变了），顺带清编辑现场 */
  function applySentences(next: DraftSentenceView[]) {
    for (const t of Object.values(timers.current)) clearTimeout(t);
    timers.current = {};
    videoRef.current?.pause();
    setPlayingIndex(null);
    setSaveStates({});
    setSentences(next);
    serverTexts.current = Object.fromEntries(
      next.map((s) => [s.index, s.text])
    );
  }

  /** 保存一句：overrides 供「确认本页」（confirm:true）与「采用教材原文」（text，票 12）
   * 用；缺省按手工改动保存当前文本。带 overrides 时跳过「没改就不发」。 */
  const commitSave = useCallback(
    async (index: number, overrides?: { confirm?: boolean; text?: string }) => {
      const target = sentencesRef.current.find((s) => s.index === index);
      if (!target) return;
      const confirm = overrides?.confirm ?? false;
      const text = overrides?.text ?? target.text;
      if (!overrides && target.text === serverTexts.current[index]) {
        setSaveStates((prev) => {
          if (!(index in prev)) return prev;
          const next = { ...prev };
          delete next[index];
          return next;
        });
        return;
      }
      setSaveStates((prev) => ({ ...prev, [index]: "saving" }));
      try {
        const res = await fetch(`/api/drafts/${id}/sentences/${index}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            confirm ? { text, confirm: true } : { text }
          ),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as SentenceUpdateResponse;
        serverTexts.current[index] = body.sentence.text;
        setSentences((prev) =>
          prev.map((s) => (s.index === index ? body.sentence : s))
        );
        setSaveStates((prev) => ({ ...prev, [index]: "saved" }));
        setTimeout(() => {
          setSaveStates((prev) => {
            if (prev[index] !== "saved") return prev;
            const next = { ...prev };
            delete next[index];
            return next;
          });
        }, SAVED_HINT_MS);
      } catch {
        setSaveStates((prev) => ({ ...prev, [index]: "error" }));
      }
    },
    [id]
  );

  function handleTextChange(index: number, text: string) {
    setSentences((prev) =>
      prev.map((s) => (s.index === index ? { ...s, text } : s))
    );
    clearTimeout(timers.current[index]);
    timers.current[index] = setTimeout(() => void commitSave(index), DEBOUNCE_MS);
  }

  function handleCommit(index: number) {
    clearTimeout(timers.current[index]);
    void commitSave(index);
  }

  /** 确认本页：逐句 PUT { text, confirm:true }。先取消未触发的防抖，
   * 确认请求本身带着最新文本，天然覆盖未保存的输入。 */
  async function handleConfirmPage() {
    if (confirming || !id) return;
    setConfirming(true);
    setConfirmDone(false);
    setActionError(null);
    for (const t of Object.values(timers.current)) clearTimeout(t);
    timers.current = {};
    let ok = true;
    for (const s of pageSentences) {
      try {
        const res = await fetch(`/api/drafts/${id}/sentences/${s.index}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: s.text, confirm: true }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as SentenceUpdateResponse;
        serverTexts.current[s.index] = body.sentence.text;
        setSentences((prev) =>
          prev.map((x) => (x.index === s.index ? body.sentence : x))
        );
      } catch {
        ok = false;
        break;
      }
    }
    setConfirming(false);
    if (ok) {
      setConfirmDone(true);
      setTimeout(() => setConfirmDone(false), SAVED_HINT_MS);
    } else {
      setActionError("「确认本页」没有完成，请重试");
    }
  }

  async function handleDelete(sentence: DraftSentenceView) {
    if (!id || mutating || confirming) return;
    if (!window.confirm(`确定删除第 ${sentence.index + 1} 句吗？删除后不能恢复。`)) {
      return;
    }
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/drafts/${id}/sentences/${sentence.index}`, {
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

  async function handleMerge(sentence: DraftSentenceView) {
    if (!id || mutating || confirming) return;
    setMutating(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/drafts/${id}/sentences/${sentence.index}/merge`,
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

  /** 票 12：一键采用本句的教材原文（走既有 PUT 端点）；
   * ASR 文本与起止时间不被删除，只是文本被替换，仍可继续手工修改 */
  function handleAdopt(sentence: DraftSentenceView) {
    if (!textbookSentences || sentence.index >= textbookSentences.length) return;
    clearTimeout(timers.current[sentence.index]);
    void commitSave(sentence.index, { text: textbookSentences[sentence.index] });
  }

  function playSentence(sentence: DraftSentenceView) {
    const v = videoRef.current;
    if (!v) return;
    if (playingIndex === sentence.index) {
      v.pause();
      setPlayingIndex(null);
      return;
    }
    v.currentTime = sentence.startMs / 1000;
    void v.play();
    setPlayingIndex(sentence.index);
  }

  /** 播到本句结束毫秒就停（字幕画面对照用的就是这一段） */
  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v || playingIndex === null) return;
    const s = sentencesRef.current.find((x) => x.index === playingIndex);
    if (s && v.currentTime * 1000 >= s.endMs) {
      v.pause();
      setPlayingIndex(null);
    }
  }

  // 翻页时停掉上一页的片段播放
  useEffect(() => {
    videoRef.current?.pause();
    setPlayingIndex(null);
  }, [current]);

  // 票 12：标准草稿从管理端「标准内容制作」进入，返回链接随之不同
  const backHref = draft?.type === "standard" ? "/admin/standard" : "/custom";
  const backLabel =
    draft?.type === "standard" ? "← 返回标准内容制作" : "← 返回自定义内容";

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
      </div>
    );
  }

  const pageAllConfirmed =
    pageSentences.length > 0 &&
    pageSentences.every((s) => s.proofread === "confirmed");

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <a href="/custom" className="text-lg text-emerald-700">
        ← 返回自定义内容
      </a>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{draft.title}</h1>
        <span className="rounded-full bg-amber-100 px-4 py-1 text-lg font-bold text-amber-700">
          待校对
        </span>
      </div>

      <div className="mt-4">
        <p className="text-lg text-slate-500" role="status">
          已确认 {confirmedCount} / 共 {sentences.length} 句
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{
              width:
                sentences.length === 0
                  ? "0%"
                  : `${(confirmedCount / sentences.length) * 100}%`,
            }}
          />
        </div>
      </div>

      <p className="mt-4 text-base text-slate-400">
        {draft.type === "standard"
          ? "逐句对照教材原文与视频画面字幕检查文字；与教材不一致的句子可一键采用原文，改动自动保存。"
          : "逐句对照视频画面字幕检查文字；改动自动保存，中途退出可回来接着做。"}
      </p>

      {draft.type === "standard" && textbookFailed && (
        <p role="alert" className="mt-2 rounded-2xl bg-amber-50 px-5 py-3 text-base text-amber-700">
          教材原文加载失败，可直接手工校对。
        </p>
      )}

      {/* 两个校对工具作用于同一草稿，可互相切换（spec · 校对工具） */}
      <a
        href={`/drafts/${id}/cutpoint`}
        className="mt-2 inline-block text-base text-emerald-700 underline underline-offset-4"
      >
        要微调句子起止时间？去切点校对 →
      </a>

      {/* 隐藏的视频元素：只借它按起止毫秒播片段 */}
      <video
        ref={videoRef}
        src={draft.videoUrl}
        onTimeUpdate={handleTimeUpdate}
        preload="auto"
        className="hidden"
        aria-hidden
      />

      {actionError && (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-5 py-3 text-lg text-red-600">
          {actionError}
        </p>
      )}

      {sentences.length === 0 ? (
        <p className="mt-6 rounded-3xl bg-white px-6 py-10 text-center text-xl text-slate-400 shadow-md ring-1 ring-slate-100">
          暂无句子
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0 || mutating || confirming}
              className="rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-lg text-slate-500">
              第 {current + 1} / {pageCount} 页
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1 || mutating || confirming}
              className="rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
            >
              下一页
            </button>
          </div>

          <ol className="mt-4 space-y-4">
            {pageSentences.map((s) => (
              <SentenceRow
                key={s.index}
                number={s.index + 1}
                sentence={s}
                isLastOverall={s.index === sentences.length - 1}
                saveState={saveStates[s.index]}
                playing={playingIndex === s.index}
                disabled={mutating || confirming}
                textbook={
                  textbookSentences && s.index < textbookSentences.length
                    ? {
                        text: textbookSentences[s.index],
                        onAdopt: () => handleAdopt(s),
                      }
                    : undefined
                }
                onTextChange={(text) => handleTextChange(s.index, text)}
                onCommit={() => handleCommit(s.index)}
                onPlay={() => playSentence(s)}
                onDelete={() => void handleDelete(s)}
                onMerge={() => void handleMerge(s)}
              />
            ))}
          </ol>

          <button
            type="button"
            onClick={() => void handleConfirmPage()}
            disabled={mutating || confirming || pageAllConfirmed}
            className={`mt-6 w-full rounded-2xl py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40 ${
              confirmDone || pageAllConfirmed ? "bg-emerald-600" : "bg-emerald-500"
            }`}
          >
            {confirming
              ? "确认中…"
              : confirmDone
                ? "本页已确认 ✓"
                : pageAllConfirmed
                  ? "本页已全部确认"
                  : "确认本页"}
          </button>
          {confirmDone && (
            <p role="status" className="mt-2 text-center text-lg text-emerald-600">
              本页各句已逐句标记为「已确认」
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 0 || mutating || confirming}
              className="rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-lg text-slate-500">
              第 {current + 1} / {pageCount} 页
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current >= pageCount - 1 || mutating || confirming}
              className="rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 active:bg-slate-50 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}
