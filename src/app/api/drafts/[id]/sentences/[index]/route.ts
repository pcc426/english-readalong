// 单句变更端点（票 07）：
//   PUT    更新 text / startMs / endMs / confirm —— confirm:true 置「已确认」，
//          否则手工改动置「已改」；text/startMs/endMs 至少给一个。08 号票的
//          切点校对工具复用同一条缝保存起止时间。
//   DELETE 删除该句（草稿至少保留一句），后续序号前移，返回整个 sentences 数组。
// 守卫（401/404/409）见 ../shared.ts；值校验在领域层 src/lib/drafts/sentences.ts。
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { SentenceEditError, deleteSentence, updateSentence } from "@/lib/drafts/sentences";
import {
  parseSentenceIndex,
  resolveEditableDraft,
  sentenceEditStatus,
} from "../shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; index: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const { id, index: rawIndex } = await ctx.params;
  const resolved = resolveEditableDraft(req, id);
  if (!resolved.ok) return resolved.response;
  const { db } = resolved;
  try {
    const index = parseSentenceIndex(rawIndex);
    if (index === null) {
      return errorResponse(404, "SENTENCE_NOT_FOUND", "句子不存在");
    }
    const body = await req.json().catch(() => null);
    const sentence = updateSentence(db, id, index, body);
    return NextResponse.json({ sentence });
  } catch (e) {
    if (e instanceof SentenceEditError) {
      return errorResponse(sentenceEditStatus(e.code), e.code, e.message);
    }
    return errorResponse(400, "SENTENCE_INVALID", "请求体格式不正确");
  } finally {
    db.close();
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id, index: rawIndex } = await ctx.params;
  const resolved = resolveEditableDraft(req, id);
  if (!resolved.ok) return resolved.response;
  const { db } = resolved;
  try {
    const index = parseSentenceIndex(rawIndex);
    if (index === null) {
      return errorResponse(404, "SENTENCE_NOT_FOUND", "句子不存在");
    }
    const sentences = deleteSentence(db, id, index);
    return NextResponse.json({ sentences });
  } catch (e) {
    if (e instanceof SentenceEditError) {
      return errorResponse(sentenceEditStatus(e.code), e.code, e.message);
    }
    return errorResponse(400, "SENTENCE_INVALID", "请求体格式不正确");
  } finally {
    db.close();
  }
}
