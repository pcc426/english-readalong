// 转写失败重试（V0.2 整改）：transcribing 且 transcribe_error 非空才允许重试，
// 复用 runTranscription——真实 provider 重新 submit（拿新任务引用继续轮询），
// fake 模式下立即完成转 proofreading。他人与不存在一律 404（沿用 05 语义）；
// 状态不符（未失败过 / 已在校对 / 已发布）409，不让无谓的重试空转。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { getDraft } from "@/lib/drafts/repo";
import { runTranscription } from "@/lib/drafts/service";

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
    if (draft.status !== "transcribing" || !draft.transcribeError) {
      return errorResponse(
        409,
        "RETRY_NOT_AVAILABLE",
        draft.status === "transcribing"
          ? "转写还在进行中，不用重试"
          : "转写已结束，无需重试"
      );
    }
    await runTranscription(db, draft.id);
    const updated = getDraft(db, draft.id)!;
    return NextResponse.json({
      draft: {
        id: updated.id,
        status: updated.status,
        transcribeError: updated.transcribeError,
      },
    });
  } finally {
    db.close();
  }
}
