// 句子插入端点（V0.2.1 票 03）：POST /api/drafts/[id]/sentences/[index]/insert
// 在 index 句之后插入新句（拆分过长分句用）：时间按占位规则生成（见
// insertSentenceAfter），文本可带初始值；置「已改」，返回整个 sentences 数组。
// 守卫（401/404/409）见 ../../shared.ts。
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { SentenceEditError, insertSentenceAfter } from "@/lib/drafts/sentences";
import {
  parseSentenceIndex,
  resolveEditableDraft,
  sentenceEditStatus,
} from "../../shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; index: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id, index: rawIndex } = await ctx.params;
  const resolved = resolveEditableDraft(req, id);
  if (!resolved.ok) return resolved.response;
  const { db } = resolved;
  try {
    const index = parseSentenceIndex(rawIndex);
    if (index === null) {
      return errorResponse(404, "SENTENCE_NOT_FOUND", "句子不存在");
    }
    const body = await req.json().catch(() => ({}));
    const sentences = insertSentenceAfter(db, id, index, body);
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
