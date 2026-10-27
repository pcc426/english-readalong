// 退回校对端点（V0.2.4 票 04）：POST /api/drafts/[id]/unpublish
// published → proofreading；清空该内容所有账号的练习记录、删除内容包文件。
// 未登录 401；他人/不存在 404（不暴露存在性）；非 published 409 NOT_PUBLISHED。
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { openDb, dbPath } from "@/lib/db";
import { requireAccount } from "@/lib/auth/guard";
import { getDraft } from "@/lib/drafts/repo";
import { unpublishDraft } from "@/lib/drafts/finalize";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = openDb(dbPath());
  try {
    const draft = getDraft(db, id);
    if (!draft || draft.accountId !== auth.account.id) {
      return errorResponse(404, "DRAFT_NOT_FOUND", "草稿不存在");
    }
    if (draft.status !== "published") {
      return errorResponse(409, "NOT_PUBLISHED", "草稿不在已发布状态");
    }
    unpublishDraft(db, draft);
    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}
