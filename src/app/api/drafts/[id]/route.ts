// 草稿详情与删除（票 05）。他人与不存在一律 404，不暴露其他账号草稿的存在性；
// 删除做一致性清理：句子 + 草稿行（事务）+ 磁盘视频文件。
// 句子编辑（07/08 号票）与定稿（09 号票）后续接入，本期详情只读。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { deleteDraft, getDraft, listDraftSentences } from "@/lib/drafts/repo";
import { getDraftModule } from "@/lib/drafts/standard-drafts";
import { deleteUploadVideo } from "@/lib/drafts/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = openDb(dbPath());
  try {
    const draft = getDraft(db, id);
    if (!draft || draft.accountId !== auth.account.id) {
      return errorResponse(404, "DRAFT_NOT_FOUND", "草稿不存在");
    }
    // 票 12：type 与教材引用字段供校对页做教材原文预填（custom 草稿为 null）
    const module = getDraftModule(db, id);
    return NextResponse.json({
      draft: {
        id: draft.id,
        title: draft.title,
        type: draft.type,
        unitId: module?.unitId ?? null,
        moduleKind: module?.moduleKind ?? null,
        status: draft.status,
        videoPath: draft.videoPath,
        videoUrl: `/api/media/${draft.videoPath}`,
        transcribeError: draft.transcribeError,
        createdAt: draft.createdAt,
        sentences: listDraftSentences(db, draft.id),
      },
    });
  } finally {
    db.close();
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = openDb(dbPath());
  try {
    const draft = getDraft(db, id);
    if (!draft || draft.accountId !== auth.account.id) {
      return errorResponse(404, "DRAFT_NOT_FOUND", "草稿不存在");
    }
    deleteDraft(db, id);
    // 文件已不在（先前的清理/写盘中断）不算错——rm force 语义
    deleteUploadVideo(draft.videoPath);
    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}
