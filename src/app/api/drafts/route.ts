// 草稿列表（票 05）：仅本账号的草稿（spec 用户故事 16，内容按账号隔离）。
// 票 12：条目补 type 与教材引用字段（管理员的标准草稿也只有管理员自己看得到）。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { listDraftsByAccount, listDraftSentences } from "@/lib/drafts/repo";
import { draftModuleMapByAccount } from "@/lib/drafts/standard-drafts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const db = openDb(dbPath());
  try {
    const modules = draftModuleMapByAccount(db, auth.account.id);
    const drafts = listDraftsByAccount(db, auth.account.id).map((d) => {
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
