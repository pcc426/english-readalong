// 草稿列表（票 05）：仅本账号的草稿（spec 用户故事 16，内容按账号隔离）。
// 票 12：条目补 type 与教材引用字段（管理员的标准草稿也只有管理员自己看得到）。
// V0.2 整改：支持 ?type=custom|standard 过滤——「自定义内容」页与
// 「标准内容制作」页各取各的，管理员的两种草稿不再混进对方页面。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { listDraftsByAccount, listDraftSentences } from "@/lib/drafts/repo";
import { draftModuleMapByAccount } from "@/lib/drafts/standard-drafts";

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
    const drafts = listDraftsByAccount(db, auth.account.id, type ?? undefined).map((d) => {
      const module = modules.get(d.id);
      return {
        id: d.id,
        title: d.title,
        type: d.type,
        unitId: module?.unitId ?? null,
        moduleKind: module?.moduleKind ?? null,
        status: d.status,
        sentenceCount: listDraftSentences(db, d.id).length,
        createdAt: d.createdAt,
      };
    });
    return NextResponse.json({ drafts });
  } finally {
    db.close();
  }
}
