// 句子变更端点（07/08 号票）共享守卫：鉴权 → 草稿归属 → 可编辑状态。
// 他人与不存在一律 404（不暴露其他账号草稿的存在性）；
// 非 proofreading（transcribing / published）一律 409 DRAFT_NOT_EDITABLE。
// 成功时把打开的库连接交给调用方，由路由在 finally 里关闭。
import type { NextResponse } from "next/server";
import { openDb, dbPath, type Db } from "@/lib/db";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";
import { getDraft, type Draft } from "@/lib/drafts/repo";

export type EditableDraft =
  | { ok: true; db: Db; draft: Draft }
  | { ok: false; response: NextResponse };

export function resolveEditableDraft(req: Request, id: string): EditableDraft {
  const auth = requireAccount(req);
  if (!auth.ok) return { ok: false, response: auth.response };
  const db = openDb(dbPath());
  const draft = getDraft(db, id);
  if (!draft || draft.accountId !== auth.account.id) {
    db.close();
    return {
      ok: false,
      response: errorResponse(404, "DRAFT_NOT_FOUND", "草稿不存在"),
    };
  }
  if (draft.status !== "proofreading") {
    db.close();
    return {
      ok: false,
      response: errorResponse(
        409,
        "DRAFT_NOT_EDITABLE",
        "草稿当前状态不可编辑句子"
      ),
    };
  }
  return { ok: true, db, draft };
}

/** URL 序号参数解析：只认整数，其余（含非数字）按越界处理 */
export function parseSentenceIndex(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

/** 领域错误码 → HTTP 状态：句子不存在 404，值非法/业务规则 400 */
export function sentenceEditStatus(code: string): 400 | 404 {
  return code === "SENTENCE_NOT_FOUND" ? 404 : 400;
}
