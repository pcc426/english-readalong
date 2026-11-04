"use client";

// 「自定义内容」页（票 06 改版：原型变体 A）：tabs + 紧凑封面卡网格。
// 上传表单已移至 /custom/upload（票 07），本页只做列表：右上【＋ 上传视频】进入。
// tabs「可练习（已定稿）/ 制作中（转写中＋待校对）」默认可练习，?tab=making 直开
// 制作中（上传成功跳回带此参）；数据仍走 GET /api/drafts?type=custom，
// published 行携带 latestRunStars（同 owned-content 口径）供「🌟N 上次练习获得」。
// UI 不做自动化测试，走 iPad 真机手工验收清单（spec · Testing Decisions）。
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { STATUS_BADGES, type DraftStatusUI } from "@/components/shared/draft-ui";
import {
  parseTabParam,
  tabOfStatus,
  sortByCreatedDesc,
  type CustomTab,
} from "./custom-list";

// 与 GET /api/drafts 响应对应（壳只走 HTTP，不从 src/lib 引类型）
interface DraftOverview {
  id: string;
  title: string;
  type: "custom" | "standard";
  unitId: string | null;
  moduleKind: string | null;
  status: DraftStatusUI;
  sentenceCount: number;
  confirmedCount: number;
  posterUrl: string | null;
  /** 最近一次练习获得的总星数；仅 published 行有值，没练过为 null（不显示星块） */
  latestRunStars: number | null;
  createdAt: string;
}

export default function CustomContentPage() {
  return (
    <Suspense fallback={null}>
      <CustomListInner />
    </Suspense>
  );
}

function CustomListInner() {
  const params = useSearchParams();
  // 初次挂载读一次 ?tab=；此后切换 tab 只改本地状态（不回写 URL）
  const [tab, setTab] = useState<CustomTab>(() =>
    parseTabParam(params.get("tab"))
  );
  const [drafts, setDrafts] = useState<DraftOverview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    try {
      // 本页只管自定义内容；管理员的标准草稿走「标准内容制作」页
      const res = await fetch("/api/drafts?type=custom");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { drafts?: DraftOverview[] };
      setDrafts(body.drafts ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  async function handleDelete(draft: DraftOverview) {
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

  const all = drafts ?? [];
  // 制作中按 created 倒排，新上传卡在第一位（API 已倒序，页面侧确定性兜底）
  const ready = sortByCreatedDesc(
    all.filter((d) => tabOfStatus(d.status) === "ready")
  );
  const making = sortByCreatedDesc(
    all.filter((d) => tabOfStatus(d.status) === "making")
  );
  const list = tab === "ready" ? ready : making;

  if (failed) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold">自定义内容</h1>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          加载失败，请刷新重试
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">自定义内容</h1>
        {/* 票 07：上传分步向导页（本页不再内联上传表单） */}
        <Link
          href="/custom/upload"
          className="rounded-2xl bg-emerald-500 px-6 py-3 text-base font-bold text-white shadow-md hover:bg-emerald-600"
        >
          ＋ 上传视频
        </Link>
      </div>

      <div className="mt-5 inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-100">
        {(
          [
            ["ready", `可练习 (${ready.length})`],
            ["making", `制作中 (${making.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-6 py-2 text-base font-bold ${
              tab === key ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-lg text-red-600">
          {error}
        </p>
      )}

      {drafts === null ? (
        <p className="mt-8 text-lg text-slate-400" role="status">
          加载中…
        </p>
      ) : list.length === 0 ? (
        <div className="mt-10 rounded-3xl bg-white p-12 text-center text-slate-500 shadow-sm ring-1 ring-slate-100">
          这里还没有内容
        </div>
      ) : (
        <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
          {list.map((draft) =>
            draft.status === "transcribing" ? (
              // 转写中不可点、不裂图（无封面显示占位）
              <div
                key={draft.id}
                className="flex flex-col overflow-hidden rounded-3xl bg-white opacity-90 shadow-md ring-1 ring-slate-100"
              >
                {cardBody(draft)}
              </div>
            ) : (
              <a
                key={draft.id}
                href={cardHref(draft)}
                className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {cardBody(draft)}
              </a>
            )
          )}
        </div>
      )}
    </div>
  );

  /** published 直达练习（自定义内容同样走 /units），待校对直达文本校对工具（票 07） */
  function cardHref(draft: DraftOverview): string {
    return draft.status === "published"
      ? `/units/${draft.id}`
      : `/drafts/${draft.id}/proofread`;
  }

  function cardBody(draft: DraftOverview) {
    return (
      <>
        {cover(draft)}
        <div className="flex flex-1 flex-col p-3">
          <h3 className="text-base font-bold leading-snug">{draft.title}</h3>
          {draft.status === "published" ? (
            <p className="mt-0.5 text-xs text-slate-500">{draft.sentenceCount} 句</p>
          ) : draft.status === "proofreading" ? (
            <div className="mt-2">
              <p className="text-xs text-slate-500">
                已确认 {draft.confirmedCount}/{draft.sentenceCount} 句
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{
                    width: `${
                      draft.sentenceCount > 0
                        ? Math.round(
                            (draft.confirmedCount / draft.sentenceCount) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-xs text-slate-500">
              视频转写中，完成后可校对…
            </p>
          )}
          <div className="mt-2 border-t border-slate-100 pt-2">
            {draft.status === "published" && draft.latestRunStars != null ? (
              <>
                <span className="block text-2xl font-extrabold leading-none text-amber-500">
                  🌟{draft.latestRunStars}
                </span>
                <p className="mt-0.5 text-[11px] text-slate-400">上次练习获得</p>
              </>
            ) : (
              <span />
            )}
          </div>
          {/* V0.3.4 验收调整：CTA 与删除同排、底部对齐（一大一小） */}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <span className="text-lg font-extrabold">{cta(draft)}</span>
            {deleteButton(draft)}
          </div>
        </div>
      </>
    );
  }

  /** 封面 9:16（票 01 抽帧；转写期间可能已好，转写中卡图 opacity-60）＋叠放徽标 */
  function cover(draft: DraftOverview) {
    const dim = draft.status === "transcribing" ? " opacity-60" : "";
    return (
      <div className="relative">
        {draft.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 鉴权媒体路由的动态路径，未配 next/image 域
          <img
            src={draft.posterUrl}
            alt=""
            className={`aspect-[9/16] w-full object-cover${dim}`}
          />
        ) : (
          <div className={`aspect-[9/16] w-full bg-slate-100${dim}`} />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
          自定义
        </span>
        <span className="absolute right-3 top-3">{statusBadge(draft.status)}</span>
      </div>
    );
  }

  /** 状态徽标（配色沿用 STATUS_BADGES：转写中 sky / 待校对 amber / 已定稿 emerald） */
  function statusBadge(status: DraftStatusUI) {
    const badge = STATUS_BADGES[status];
    return (
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>
        {badge.label}
      </span>
    );
  }

  function cta(draft: DraftOverview) {
    if (draft.status === "published") {
      return <span className="text-emerald-600">去练习 →</span>;
    }
    if (draft.status === "proofreading") {
      return <span className="text-amber-600">去校对 →</span>;
    }
    return <span className="text-slate-400">转写完成后可校对</span>;
  }

  /** 删除（transcribing/proofreading/published 都能删）；卡是 <a>，阻断冒泡防误跳 */
  function deleteButton(draft: DraftOverview) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleDelete(draft);
        }}
        disabled={deletingId === draft.id}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-red-500 active:bg-slate-100 disabled:opacity-40"
      >
        {deletingId === draft.id ? "删除中…" : "删除"}
      </button>
    );
  }
}
