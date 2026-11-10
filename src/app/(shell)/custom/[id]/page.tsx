"use client";

// 草稿详情（票 05）：只读展示转写句子与起止时间 + 鉴权视频播放。
// 校对入口：文本校对（票 07）+ 切点校对（票 08）。
// V0.3 票 09 / ADR 0005：定稿发布只从预览页发起——proofreading 态此页入口
// 改为「去预览」（未全部确认时禁用，与校对页同一把尺 previewGate）。
// 视图类型复用 components/proofread/types（与 GET /api/drafts/[id] 响应一致）。
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  STATUS_BADGES,
  formatMs,
  previewGate,
  statusBadgeLabel,
} from "@/components/shared/draft-ui";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { DraftDetailView } from "@/components/proofread/types";

export default function DraftDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [draft, setDraft] = useState<DraftDetailView | null>(null);
  const [failed, setFailed] = useState(false);
  // V0.2 整改：转写失败重试的进行中/结果反馈
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // V0.2.4 票 04：退回校对的进行中/结果反馈
  const [unpublishing, setUnpublishing] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  // V0.4.2：退回校对的确认弹框（替换原生 confirm）
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);

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

  /** V0.2.4 票 04：退回校对。强确认写明清空后果；成功后整份详情重拉，
   * 回到校对态 UI（句子原样保留，改错句 → 重新确认 → 再次定稿）。 */
  async function handleUnpublish() {
    if (!id || unpublishing) return;
    setUnpublishing(true);
    setUnpublishError(null);
    try {
      const res = await fetch(`/api/drafts/${id}/unpublish`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDraft();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setUnpublishError(body?.error?.message ?? "退回失败，请重试");
    } catch {
      setUnpublishError("网络开小差了，请重试");
    } finally {
      setUnpublishing(false);
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
          {statusBadgeLabel(draft.status, "custom")}
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

      {/* V0.3 票 09 / ADR 0005：定稿发布只从预览页发起，此入口改为「去预览」。
       * 未全部确认时禁用（与校对页同一把尺 previewGate），由提示文案说明。 */}
      {draft.status === "proofreading" &&
        (() => {
          const gate = previewGate(
            draft.sentences.length,
            draft.sentences.filter((s) => s.proofread === "confirmed").length
          );
          return (
            <>
              {!gate.canPreview && (
                <p role="status" className="mt-3 text-lg text-slate-400">
                  还有 {gate.unconfirmedCount} 句未确认，全部确认后可去预览，预览中定稿发布。
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  window.location.href = `/drafts/${draft.id}/preview`;
                }}
                disabled={!gate.canPreview}
                title={
                  gate.canPreview
                    ? undefined
                    : `还有 ${gate.unconfirmedCount} 句未确认`
                }
                className="mt-3 w-full rounded-2xl bg-white py-4 text-center text-xl font-bold text-emerald-700 shadow-md ring-1 ring-emerald-200 active:bg-emerald-50 disabled:opacity-40"
              >
                去预览
              </button>
            </>
          );
        })()}

      {/* V0.2.4 票 04：发布者可退回校对（清空该内容所有家庭的练习记录），
       * 改错句后重新确认、定稿，不必整个重新上传校对 */}
      {draft.status === "published" && (
        <>
          {unpublishError && (
            <p role="alert" className="mt-4 text-lg text-red-600">
              {unpublishError}
            </p>
          )}
          <button
            type="button"
            onClick={() => setConfirmingUnpublish(true)}
            disabled={unpublishing}
            className="mt-8 rounded-2xl bg-red-50 px-5 py-3 text-lg font-semibold text-red-600 ring-1 ring-red-100 active:bg-red-100 disabled:opacity-40"
          >
            {unpublishing ? "退回中…" : "退回校对（发现错误要改时用）"}
          </button>
        </>
      )}

      <ConfirmDialog
        open={confirmingUnpublish}
        onClose={() => setConfirmingUnpublish(false)}
        icon="⚠️"
        title={`退回校对「${draft.title}」？`}
        points={[
          "该内容会立即从所有家庭的练习列表中消失",
          "所有家庭在这条内容上的练习记录将被清空",
          "校对成果保留，改完后重新定稿即可（练习链接不变）",
        ]}
        confirmLabel="确定退回校对"
        onConfirm={() => {
          setConfirmingUnpublish(false);
          void handleUnpublish();
        }}
      />
    </div>
  );
}
