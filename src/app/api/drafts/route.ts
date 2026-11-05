// 草稿列表（票 05）：仅本账号的草稿（spec 用户故事 16，内容按账号隔离）。
// 票 12：条目补 type 与教材引用字段（管理员的标准草稿也只有管理员自己看得到）。
// V0.2 整改：支持 ?type=custom|standard 过滤——「自定义内容」页与
// 「标准内容制作」页各取各的，管理员的两种草稿不再混进对方页面。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { listDraftsByAccount, sentenceCountsByDraft, confirmedCountsByDraft } from "@/lib/drafts/repo";
import { draftModuleMapByAccount } from "@/lib/drafts/standard-drafts";
import { beijingToday } from "@/lib/domain/beijing-date";
import { latestAwardedRunStars, weeklyRunsFor } from "@/lib/domain/star-ledger";
import { mediaUrl } from "@/lib/media-url";
import { standardEnumSubtitleForModule } from "@/lib/textbook/enum-subtitle";

export const dynamic = "force-dynamic";

/** ?type= 的合法值；缺省/其他值视为不过滤（内部 UI 参数，宽松处理） */
function parseTypeFilter(raw: string | null): "custom" | "standard" | null {
  return raw === "custom" || raw === "standard" ? raw : null;
}

export async function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const type = parseTypeFilter(new URL(req.url).searchParams.get("type"));
  const db = openDb(dbPath());
  try {
    const modules = draftModuleMapByAccount(db, auth.account.id);
    const drafts = listDraftsByAccount(db, auth.account.id, type ?? undefined);
    // V0.2 整改：句子计数一次批量查询，取代逐草稿 N+1；
    // V0.2.1：确认计数同批查询（发布门槛的列表展示）
    const counts = sentenceCountsByDraft(
      db,
      drafts.map((d) => d.id)
    );
    const confirmed = confirmedCountsByDraft(
      db,
      drafts.map((d) => d.id)
    );
    // 最近一次完整练习的入账星与本周入账次数（V0.4 账本口径）：仅 published 行携带。
    // 定稿后内容包 id 即草稿 id（finalize.packFromDraft），
    // 与 owned-content 的账本查询同源；latestRunStars 在非 published / 从未入账时为 null，
    // weeklyRuns 在非 published 行恒为 0。
    const today = beijingToday();
    return NextResponse.json({
      drafts: drafts.map((d) => {
        const module = modules.get(d.id);
        return {
          id: d.id,
          title: d.title,
          type: d.type,
          unitId: module?.unitId ?? null,
          moduleKind: module?.moduleKind ?? null,
          status: d.status,
          sentenceCount: counts.get(d.id) ?? 0,
          confirmedCount: confirmed.get(d.id) ?? 0,
          // 封面（票 01）：抽帧完成才有，转写期间列表对缺失容忍（null → 占位）
          posterUrl: d.posterPath ? mediaUrl(d.posterPath) : null,
          // 枚举串（V0.3.4 票 04）：标准草稿服务端生成（与首页同源）；
          // custom / 注册表查不到为 null（卡片回退 unitId · moduleKind 文案）
          subtitle:
            d.type === "standard" && module
              ? standardEnumSubtitleForModule(
                  module.unitId,
                  module.moduleKind,
                  counts.get(d.id) ?? 0
                )
              : null,
          latestRunStars:
            d.status === "published"
              ? latestAwardedRunStars(db, auth.account.id, d.id)
              : null,
          weeklyRuns:
            d.status === "published"
              ? weeklyRunsFor(db, auth.account.id, d.id, today)
              : 0,
          createdAt: d.createdAt,
        };
      }),
    });
  } finally {
    db.close();
  }
}
