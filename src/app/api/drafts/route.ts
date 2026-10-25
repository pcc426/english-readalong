// 草稿列表（票 05）：仅本账号的草稿（spec 用户故事 16，内容按账号隔离）。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { listDraftsByAccount, listDraftSentences } from "@/lib/drafts/repo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const db = openDb(dbPath());
  try {
    const drafts = listDraftsByAccount(db, auth.account.id).map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      sentenceCount: listDraftSentences(db, d.id).length,
      createdAt: d.createdAt,
    }));
    return NextResponse.json({ drafts });
  } finally {
    db.close();
  }
}
