"use client";

// 教材内容制作·草稿列表（V0.3.4 票 04，拆自 StandardAdminClient）。
// 默认页 /admin/standard：tab（制作中/已定稿）+ 网格卡（样式对齐自定义列表），
// 原有按钮一个不少（去校对/去预览/查看/退回校对/删除），语义与拆分前一致。
import { useCallback, useEffect, useState } from "react";
import { STATUS_BADGES, previewGate } from "@/components/shared/draft-ui";
import {
  AccessGate,
  useAdminAccess,
  type StandardDraftOverview,
} from "./types";

export default function StandardDraftList() {
  const access = useAdminAccess();
  const [drafts, setDrafts] = useState<StandardDraftOverview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<"making" | "published">("making");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // V0.2.4 票 04：退回校对的进行中反馈
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    try {
      // 本页只管标准内容；type=standard 服务端过滤（V0.2 整改），
      // 管理员自己的自定义草稿归「自定义内容」页
      const res = await fetch("/api/drafts?type=standard");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { drafts?: StandardDraftOverview[] };
      setDrafts(body.drafts ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (access === "allowed") void loadDrafts();
  }, [access, loadDrafts]);

  async function handleUnpublish(draft: StandardDraftOverview) {
    if (unpublishingId) return;
    if (
      !window.confirm(
        `确定把「${draft.title}」退回校对吗？\n\n` +
          `· 该内容会立即从所有家庭的练习列表中消失；\n` +
          `· 所有家庭在这条内容上的练习记录将被清空；\n` +
          `· 校对成果保留，改完后重新定稿即可（练习链接不变）。`
      )
    ) {
      return;
    }
    setUnpublishingId(draft.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/unpublish`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDrafts();
        setNotice("已退回校对，改完句子重新确认并定稿即可重新发布。");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "退回失败，请重试");
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setUnpublishingId(null);
    }
  }

  async function handleDelete(draft: StandardDraftOverview) {
    if (deletingId) return;
    if (!window.confirm(`确定删除「${draft.title}」吗？视频文件会一并删除。`)) {
      return;
    }
    setDeletingId(draft.id);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      if (res.ok) await loadDrafts();
      else setError("删除失败，请重试");
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setDeletingId(null);
    }
  }

  const making = (drafts ?? []).filter((d) => d.status !== "published");
  const published = (drafts ?? []).filter((d) => d.status === "published");
  const list = tab === "making" ? making : published;

  return (
    <AccessGate access={access}>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <a href="/admin" className="text-lg text-emerald-700">
              ← 返回管理
            </a>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              教材内容制作
            </h1>
            <p className="mt-1 text-base text-slate-500">
              校对时对照教材原文，定稿后全账号可见
            </p>
          </div>
          <a
            href="/admin/standard/upload"
            className="shrink-0 rounded-2xl bg-emerald-500 px-5 py-2.5 text-base font-bold text-white shadow-md hover:bg-emerald-600"
          >
            ＋ 上传教材视频
          </a>
        </div>

        {(error || notice) && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-4 rounded-2xl px-4 py-3 text-base ${
              error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {error ?? notice}
          </p>
        )}

        {drafts === null && !failed ? (
          <p className="mt-8 text-lg text-slate-400" role="status">
            加载中…
          </p>
        ) : failed ? (
          <p className="mt-8 text-lg text-slate-400" role="alert">
            加载失败，请刷新重试
          </p>
        ) : (
          <>
            <div className="mt-6 inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-100">
              {(
                [
                  ["making", `制作中 (${making.length})`],
                  ["published", `已定稿 (${published.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-xl px-6 py-2 text-base font-bold ${
                    tab === key
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {list.length === 0 ? (
              <p className="mt-8 rounded-3xl bg-white p-12 text-center text-lg text-slate-500 shadow-md ring-1 ring-slate-100">
                {tab === "making"
                  ? "还没有制作中的标准内容，从右上角开始上传"
                  : "还没有已定稿的标准内容"}
              </p>
            ) : (
              <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                {list.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onUnpublish={handleUnpublish}
                    onDelete={handleDelete}
                    unpublishingId={unpublishingId}
                    deletingId={deletingId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AccessGate>
  );
}

function DraftCard({
  draft,
  onUnpublish,
  onDelete,
  unpublishingId,
  deletingId,
}: {
  draft: StandardDraftOverview;
  onUnpublish: (d: StandardDraftOverview) => void;
  onDelete: (d: StandardDraftOverview) => void;
  unpublishingId: string | null;
  deletingId: string | null;
}) {
  const badge = STATUS_BADGES[draft.status];
  // 票 09：与校对页/custom 详情同一把尺（previewGate）
  const gate = previewGate(draft.sentenceCount, draft.confirmedCount);
  const pct = draft.sentenceCount
    ? Math.round((draft.confirmedCount / draft.sentenceCount) * 100)
    : 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-slate-100">
      <div className="relative aspect-[9/16] w-full bg-slate-200">
        {draft.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 鉴权媒体路由的动态路径，未配 next/image 域
          <img
            src={draft.posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <span className="absolute left-3 top-3 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">
          标准
        </span>
        <span
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-base font-bold leading-snug">{draft.title}</h3>
        <p className="mt-0.5 text-xs leading-snug text-slate-500">
          {draft.subtitle ??
            (draft.unitId && draft.moduleKind
              ? `${draft.unitId} · ${draft.moduleKind} · ${draft.sentenceCount}句`
              : `${draft.sentenceCount} 句`)}
        </p>

        {draft.status === "proofreading" && (
          <div className="mt-1.5">
            <p className="text-xs text-slate-500">
              已确认 {draft.confirmedCount}/{draft.sentenceCount} 句
            </p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {draft.status === "transcribing" && (
          <p className="mt-1 text-xs text-slate-500">
            视频转写中，完成后可校对…
          </p>
        )}

        {/* 主操作（无框文字 + 箭头，纵向；V0.3.4 用户定稿）。
            去校对/查看是链接；去预览是按钮（原实现用 location.href 跳预览页）；
            退回校对是按钮（强确认 + unpublish），语义与拆分前一致 */}
        <div className="mt-auto flex flex-col gap-0.5 pt-2 text-lg font-extrabold">
          {draft.status === "published" ? (
            <>
              <a href={`/units/${draft.id}`} className="text-emerald-600">
                查看 →
              </a>
              <button
                type="button"
                onClick={() => onUnpublish(draft)}
                disabled={unpublishingId === draft.id}
                className="text-left text-red-600 disabled:opacity-40"
              >
                {unpublishingId === draft.id ? "退回中…" : "退回校对 →"}
              </button>
            </>
          ) : draft.status === "proofreading" ? (
            <>
              <a
                href={`/drafts/${draft.id}/proofread`}
                className="text-amber-600"
              >
                去校对 →
              </a>
              {gate.canPreview && (
                /* V0.3 票 09 / ADR 0005：定稿发布只从预览页发起，此处只送人去预览 */
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/drafts/${draft.id}/preview`;
                  }}
                  className="text-left text-emerald-600"
                >
                  去预览 →
                </button>
              )}
            </>
          ) : (
            <span className="text-slate-400">转写完成后可校对</span>
          )}
        </div>

        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => void onDelete(draft)}
            disabled={deletingId === draft.id}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-red-500 active:bg-slate-100 disabled:opacity-40"
          >
            {deletingId === draft.id ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
