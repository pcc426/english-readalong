// 草稿定稿（票 09）。他人与不存在的草稿一律 404，不暴露存在性（沿用 05 语义）；
// 定稿流程与失败语义见 src/lib/drafts/finalize.ts：
// - 校验失败（缺文本/起止非法/空草稿）→ 422 + 逐句问题清单
// - 内容包写盘成功后才把草稿置 published；写盘失败 → 500，状态不变可重试
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { getDraft } from "@/lib/drafts/repo";
import { FinalizeValidationError, finalizeDraft } from "@/lib/drafts/finalize";

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
    if (draft.status === "published") {
      return errorResponse(409, "ALREADY_PUBLISHED", "内容已定稿，不用重复操作");
    }
    if (draft.status !== "proofreading") {
      return errorResponse(409, "NOT_PROOFREADING", "转写还没完成，等转写结束后再定稿");
    }

    let pack;
    try {
      pack = finalizeDraft(db, draft);
    } catch (err) {
      if (err instanceof FinalizeValidationError) {
        // 错误基础形状 { error: { code, message } } 之上附带逐句问题清单
        return NextResponse.json(
          {
            error: {
              code: "INVALID_DRAFT",
              message: "内容还有问题没解决，定稿前先处理",
              issues: err.issues,
            },
          },
          { status: 422 }
        );
      }
      console.error("[publish] 内容包写盘失败:", (err as Error).message);
      return errorResponse(500, "PACK_WRITE_FAILED", "定稿失败，请重试");
    }

    return NextResponse.json({
      content: {
        id: pack.id,
        title: pack.title,
        type: pack.type,
        owner: pack.owner,
      },
    });
  } finally {
    db.close();
  }
}
