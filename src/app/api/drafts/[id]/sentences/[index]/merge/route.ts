// 句子合并端点（票 07）：POST /api/drafts/[id]/sentences/[index]/merge
// index 句与 index+1 句合并：文本拼接（补一个空格）、起止取并集、置「已改」，
// 后续句子序号前移，返回整个 sentences 数组（前端据此刷新序号）。
// 守卫（401/404/409）见 ../../shared.ts。
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { SentenceEditError, mergeSentenceWithNext } from "@/lib/drafts/sentences";
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
    const sentences = mergeSentenceWithNext(db, id, index);
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
