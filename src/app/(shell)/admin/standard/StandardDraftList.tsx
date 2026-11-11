"use client";

// 教材内容制作·草稿列表（V0.3.4 票 04，拆自 StandardAdminClient）。
// 默认页 /admin/standard：tab（制作中/已定稿）+ 网格卡（样式对齐自定义列表），
// 原有按钮一个不少（去校对/去预览/查看/退回校对/删除），语义与拆分前一致。
import { useCallback, useEffect, useRef, useState } from "react";
import {
  STATUS_BADGES,
  TRANSCRIBE_FAILED_BADGE,
  TRANSCRIBE_FAILED_HINT,
  previewGate,
} from "@/components/shared/draft-ui";
import { readUploadHint, UPLOAD_WATCH_MS } from "@/components/shared/upload-handoff";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  AccessGate,
  useAdminAccess,
  type StandardDraftOverview,
} from "./types";

/** 转写中卡片的自动刷新间隔（V0.4.2）：转写完成后无需手动刷新即出现「去校对」 */
const TRANSCRIBING_POLL_MS = 3000;

/** 退回校对的后果要点（V0.4.2：从原生 confirm 换到自定义弹框，文案不变） */
const UNPUBLISH_POINTS = [
  "该内容会立即从所有家庭的练习列表中消失",
  "所有家庭在这条内容上的练习记录将被清空",
  "校对成果保留，改完后重新定稿即可（练习链接不变）",
];

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
  // V0.4.2：确认弹框（替换原生 confirm）
  const [confirming, setConfirming] = useState<
    { kind: "unpublish" | "delete"; draft: StandardDraftOverview } | null
  >(null);
  // v0.3.6：标准内容当前是否对家庭账号开放（只用于状态提示）
  const [standardPublic, setStandardPublic] = useState<boolean | null>(null);

  // V0.4.2：转写中卡片的自动刷新
  const loadedRef = useRef(false);

  const loadDrafts = useCallback(async () => {
    try {
      // 本页只管标准内容；type=standard 服务端过滤（V0.2 整改），
      // 管理员自己的自定义草稿归「自定义内容」页
      const res = await fetch("/api/drafts?type=standard");
      if (!res.ok) {
        // 已有数据时（轮询刷新）不把整页切成失败态
        if (!loadedRef.current) setFailed(true);
        return;
      }
      const body = (await res.json()) as { drafts?: StandardDraftOverview[] };
      loadedRef.current = true;
      setDrafts(body.drafts ?? []);
    } catch {
      if (!loadedRef.current) setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (access === "allowed") void loadDrafts();
  }, [access, loadDrafts]);

  // V0.4.2：只要还有转写中的卡片就 3 秒一轮刷新，转写完自动出「去校对」
  const transcribing = (drafts ?? []).some((d) => d.status === "transcribing");
  // 刚上传过时（100% 就跳回列表，草稿可能还没建好）额外轮询一小段时间
  const [uploadWatch, setUploadWatch] = useState(false);
  useEffect(() => {
    if (!readUploadHint()) return;
    setUploadWatch(true);
    const timer = setTimeout(() => setUploadWatch(false), UPLOAD_WATCH_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (access !== "allowed" || (!transcribing && !uploadWatch)) return;
    const timer = setInterval(() => void loadDrafts(), TRANSCRIBING_POLL_MS);
    return () => clearInterval(timer);
  }, [access, transcribing, uploadWatch, loadDrafts]);

  useEffect(() => {
    if (access !== "allowed") return;
    let cancelled = false;
    fetch("/api/admin/content-visibility")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { standardContentPublic?: boolean } | null;
      })
      .then((body) => {
        if (!cancelled && body) {
          setStandardPublic(body.standardContentPublic === true);
        }
      })
      .catch(() => {
        // 状态提示失败不阻断制作流程
      });
    return () => {
      cancelled = true;
    };
  }, [access]);

  /** 点「退回校对」：先弹确认框，确认后才真正执行 */
  function requestUnpublish(draft: StandardDraftOverview) {
    if (unpublishingId) return;
    setConfirming({ kind: "unpublish", draft });
  }

  async function handleUnpublish(draft: StandardDraftOverview) {
    if (unpublishingId) return;
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

  /** 点「删除」：先弹确认框 */
  function requestDelete(draft: StandardDraftOverview) {
    if (deletingId) return;
    setConfirming({ kind: "delete", draft });
  }

  async function handleDelete(draft: StandardDraftOverview) {
    if (deletingId) return;
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
              校对时对照教材原文，定稿后按可见性开关对家庭账号开放
            </p>
            {standardPublic !== null && (
              <p
                className={`mt-1 text-sm font-semibold ${
                  standardPublic ? "text-emerald-600" : "text-amber-600"
                }`}
                role="status"
              >
                {standardPublic ? "当前：已对家庭账号开放" : "当前：仅管理员可见"}
              </p>
            )}
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
                  ["published", `已发布 (${published.length})`],
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
                  : "还没有已发布的标准内容"}
              </p>
            ) : (
              <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                {list.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onUnpublish={requestUnpublish}
                    onDelete={requestDelete}
                    unpublishingId={unpublishingId}
                    deletingId={deletingId}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        icon={confirming?.kind === "unpublish" ? "⚠️" : "🗑️"}
        title={
          confirming?.kind === "unpublish"
            ? `退回校对「${confirming.draft.title}」？`
            : confirming
              ? `删除「${confirming.draft.title}」？`
              : ""
        }
        message={
          confirming?.kind === "delete"
            ? "这条内容和它的视频文件会一起删除，删除后不能恢复。"
            : undefined
        }
        points={confirming?.kind === "unpublish" ? UNPUBLISH_POINTS : undefined}
        confirmLabel={
          confirming?.kind === "unpublish" ? "确定退回校对" : "确定删除"
        }
        onConfirm={() => {
          const target = confirming;
          setConfirming(null);
          if (!target) return;
          if (target.kind === "unpublish") void handleUnpublish(target.draft);
          else void handleDelete(target.draft);
        }}
      />
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
  // 转写失败（V0.4.2）：徽标与提示都换掉，卡片保持不可点
  const failed = draft.status === "transcribing" && Boolean(draft.transcribeError);
  const badge = failed ? TRANSCRIBE_FAILED_BADGE : STATUS_BADGES[draft.status];
  // 票 09：与校对页/custom 详情同一把尺（previewGate）
  const gate = previewGate(draft.sentenceCount, draft.confirmedCount);
  const pct = draft.sentenceCount
    ? Math.round((draft.confirmedCount / draft.sentenceCount) * 100)
    : 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-slate-100">
      <div className="relative aspect-[3/4] w-full bg-slate-200">
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
          <p
            className={`mt-1 text-xs ${failed ? "font-semibold text-red-600" : "text-slate-500"}`}
          >
            {failed ? TRANSCRIBE_FAILED_HINT : "视频转写中，完成后可校对…"}
          </p>
        )}

        {/* 主操作（无框文字 + 箭头，纵向；V0.3.4 用户定稿）。
            去校对/查看是链接；去预览是按钮（原实现用 location.href 跳预览页）。
            V0.4.2：「退回校对」弱化后移到底栏，与「删除」同一行对齐 */}
        <div className="mt-auto flex flex-col gap-0.5 pt-2 text-lg font-extrabold">
          {draft.status === "published" ? (
            <a href={`/units/${draft.id}`} className="text-emerald-600">
              查看 →
            </a>
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
          ) : failed ? null : (
            <span className="text-slate-400">转写完成后可校对</span>
          )}
        </div>

        {/* 底栏（V0.4.2）：published 卡左下「退回校对」与右下「删除」同字号、同 hover 样式；
            左按钮去掉左内边距，让文字与上方「查看 →」左对齐 */}
        <div className="mt-1 flex items-center justify-between gap-2">
          {draft.status === "published" ? (
            <button
              type="button"
              onClick={() => onUnpublish(draft)}
              disabled={unpublishingId === draft.id}
              className="rounded-lg py-1 pl-0 pr-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-red-500 active:bg-slate-100 disabled:opacity-40"
            >
              {unpublishingId === draft.id ? "退回中…" : "退回校对"}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => void onDelete(draft)}
            disabled={deletingId === draft.id}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-red-500 active:bg-slate-100 disabled:opacity-40"
          >
            {deletingId === draft.id ? "删除中…" : "删除"}
          </button>
        </div>
      </div>
    </div>
  );
}
