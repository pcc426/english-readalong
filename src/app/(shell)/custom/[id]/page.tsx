"use client";

// 草稿详情（票 05）：只读展示转写句子与起止时间 + 鉴权视频播放。
// 校对入口：文本校对（票 07）+ 切点校对（票 08）。
// V0.2 整改：家长定稿入口——proofreading 状态可在此「定稿发布」
// （POST /api/drafts/[id]/publish，票 09 端点），422 的逐句问题就地展示。
// 视图类型复用 components/proofread/types（与 GET /api/drafts/[id] 响应一致）。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  STATUS_BADGES,
  formatMs,
} from "@/components/shared/draft-ui";
import type { DraftDetailView } from "@/components/proofread/types";

/** 定稿 422 响应里的逐句问题（与 POST /api/drafts/[id]/publish 响应对应） */
interface PublishIssue {
  index: number | null;
  problem: string;
}

export default function DraftDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [draft, setDraft] = useState<DraftDetailView | null>(null);
  const [failed, setFailed] = useState(false);
  // V0.2 整改：定稿发布的进行中/结果反馈
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<PublishIssue[] | null>(null);
  const [justPublished, setJustPublished] = useState(false);
  // V0.2 整改：转写失败重试的进行中/结果反馈
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/drafts/${id}`);
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { draft?: DraftDetailView };
      setDraft(body.draft ?? null);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  /** V0.2 整改：转写失败重试（POST /api/drafts/[id]/retry-transcription）。
   * 成功后整份详情重拉（fake 模式立即完成、真实 provider 清错误继续转写）。 */
  async function handleRetryTranscription() {
    if (!id || retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/drafts/${id}/retry-transcription`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDraft();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setRetryError(body?.error?.message ?? "重试失败，请稍后再试");
    } catch {
      setRetryError("网络开小差了，请重试");
    } finally {
      setRetrying(false);
    }
  }

  /** V0.2 整改：定稿发布（票 09 端点）。422 时逐句问题就地展示，
   * 成功后状态就地置 published 并提示可去练习。 */
  async function handlePublish() {
    if (!id || publishing) return;
    if (!window.confirm(`确定把「${draft?.title ?? ""}」定稿发布吗？定稿后就可以开始跟读了。`)) {
      return;
    }
    setPublishing(true);
    setPublishError(null);
    setPublishIssues(null);
    try {
      const res = await fetch(`/api/drafts/${id}/publish`, { method: "POST" });
      if (res.ok) {
        setDraft((prev) => (prev ? { ...prev, status: "published" } : prev));
        setJustPublished(true);
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; issues?: PublishIssue[] };
      } | null;
      setPublishError(body?.error?.message ?? "定稿失败，请重试");
      setPublishIssues(body?.error?.issues ?? null);
    } catch {
      setPublishError("网络开小差了，请重试");
    } finally {
      setPublishing(false);
    }
  }

  if (failed || draft === null) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <a href="/custom" className="text-lg text-emerald-700">
          ← 返回自定义内容
        </a>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          {failed ? "加载失败，请刷新重试" : "加载中…"}
        </p>
      </div>
    );
  }

  const badge = STATUS_BADGES[draft.status];
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <a href="/custom" className="text-lg text-emerald-700">
        ← 返回自定义内容
      </a>
      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{draft.title}</h1>
        <span className={`rounded-full px-4 py-1 text-lg font-bold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {draft.status === "transcribing" && !draft.transcribeError && (
        <p className="mt-4 rounded-2xl bg-sky-50 px-5 py-4 text-lg text-sky-700">
          正在转写，完成后回来校对句子。
        </p>
      )}
      {draft.transcribeError && (
        <div
          className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-lg text-red-600"
          role="alert"
        >
          <p>转写失败：{draft.transcribeError}</p>
          {/* V0.2 整改：转写失败的草稿可就地重试（真实引擎重新提交，fake 立即完成） */}
          {draft.status === "transcribing" && (
            <>
              {retryError && (
                <p className="mt-2 text-base text-red-700">{retryError}</p>
              )}
              <button
                type="button"
                onClick={() => void handleRetryTranscription()}
                disabled={retrying}
                className="mt-3 rounded-2xl bg-white px-5 py-2 text-lg font-semibold text-red-600 ring-1 ring-red-200 active:bg-red-100 disabled:opacity-40"
              >
                {retrying ? "重试中…" : "重试转写"}
              </button>
            </>
          )}
        </div>
      )}

      {draft.videoUrl && (
        <video
          controls
          src={draft.videoUrl}
          className="mt-6 w-full rounded-3xl bg-black shadow-md"
        />
      )}

      <h2 className="mt-8 text-xl font-bold text-slate-700">
        句子（{draft.sentences.length}）
      </h2>
      <ol className="mt-3 space-y-3">
        {draft.sentences.map((s) => (
          <li
            key={s.index}
            className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-100"
          >
            <p className="text-lg font-semibold leading-relaxed">{s.text}</p>
            <p className="mt-1 text-base text-slate-400">
              {formatMs(s.startMs)} – {formatMs(s.endMs)}
            </p>
          </li>
        ))}
      </ol>
      {draft.sentences.length === 0 && draft.status !== "transcribing" && (
        <p className="mt-3 text-lg text-slate-400">暂无句子</p>
      )}
      {draft.status === "proofreading" && (
        <a
          href={`/drafts/${draft.id}/proofread`}
          className="mt-6 block rounded-2xl bg-emerald-500 py-4 text-center text-xl font-bold text-white shadow-md active:bg-emerald-600"
        >
          去校对 →
        </a>
      )}

      {/* V0.2 整改：家长定稿入口（票 09 端点；422 逐句问题就地展示）。
       * V0.2.1 发布门槛：全部句子确认后才亮起（服务端 422 双保险）。 */}
      {draft.status === "proofreading" && (
        <>
          {publishError && (
            <div
              role="alert"
              className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-lg text-red-600"
            >
              <p>{publishError}</p>
              {publishIssues && publishIssues.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-6">
                  {publishIssues.map((issue, i) => (
                    <li key={i}>
                      {issue.index === null ? issue.problem : `第 ${issue.index + 1} 句：${issue.problem}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(() => {
            const unconfirmed = draft.sentences.filter(
              (s) => s.proofread !== "confirmed"
            ).length;
            const allConfirmed = draft.sentences.length > 0 && unconfirmed === 0;
            return (
              <>
                {!allConfirmed && (
                  <p role="status" className="mt-3 text-lg text-slate-400">
                    还有 {unconfirmed} 句未确认，确认完才能定稿。
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={publishing || !allConfirmed}
                  className="mt-3 w-full rounded-2xl bg-white py-4 text-center text-xl font-bold text-emerald-700 shadow-md ring-1 ring-emerald-200 active:bg-emerald-50 disabled:opacity-40"
                >
                  {publishing ? "定稿中…" : "定稿发布"}
                </button>
              </>
            );
          })()}
        </>
      )}
      {draft.status === "published" && justPublished && (
        <>
          <p
            role="status"
            className="mt-6 rounded-2xl bg-emerald-50 px-5 py-4 text-lg text-emerald-700"
          >
            已定稿发布！现在可以开始跟读了。
          </p>
          <a
            href={`/units/${draft.id}`}
            className="mt-3 block rounded-2xl bg-emerald-500 py-4 text-center text-xl font-bold text-white shadow-md active:bg-emerald-600"
          >
            去练习 →
          </a>
        </>
      )}
    </div>
  );
}
