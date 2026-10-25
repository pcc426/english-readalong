// 句子编辑领域逻辑（票 07）：文本校对页的三类变更——改文本/起止/确认、删句、与下句合并。
// 边界划分：「草稿是否存在 / 是否本人 / 是否 proofreading 状态」由 API 路由守卫
// （401/404/409，见 app/api/drafts/[id]/sentences/shared.ts），本模块只管句子层：
// 值校验（SENTENCE_INVALID）、越界序号（SENTENCE_NOT_FOUND）、删到最后一句
// （LAST_SENTENCE）、末句无下一句（NO_NEXT_SENTENCE）。
// 句子变更的数据访问收敛在本模块，不动票 05 的 repo.ts。
import type { Db } from "../db";
import { listDraftSentences } from "./repo";
import type { DraftSentence } from "./repo";

export type SentenceEditErrorCode =
  | "SENTENCE_NOT_FOUND"
  | "SENTENCE_INVALID"
  | "LAST_SENTENCE"
  | "NO_NEXT_SENTENCE";

export class SentenceEditError extends Error {
  constructor(
    readonly code: SentenceEditErrorCode,
    message: string
  ) {
    super(message);
  }
}

export interface SentenceUpdateInput {
  text?: unknown;
  startMs?: unknown;
  endMs?: unknown;
  confirm?: unknown;
}

function getSentence(
  db: Db,
  draftId: string,
  index: number
): DraftSentence | null {
  const row = db
    .prepare(
      `SELECT seq, text, start_ms, end_ms, proofread FROM draft_sentences
       WHERE draft_id = ? AND seq = ?`
    )
    .get(draftId, index) as
    | {
        seq: number;
        text: string;
        start_ms: number;
        end_ms: number;
        proofread: string;
      }
    | undefined;
  if (!row) return null;
  return {
    index: row.seq,
    text: row.text,
    startMs: row.start_ms,
    endMs: row.end_ms,
    proofread: row.proofread as DraftSentence["proofread"],
  };
}

function touchDraft(db: Db, draftId: string): void {
  db.prepare(
    `UPDATE content_drafts SET updated_at = datetime('now') WHERE id = ?`
  ).run(draftId);
}

/** seq >= from 的句子整体前移一位：按升序逐行挪，目标位总是先空出来，主键不冲突 */
function shiftSeqUpFrom(db: Db, draftId: string, from: number): void {
  const rows = db
    .prepare(
      "SELECT seq FROM draft_sentences WHERE draft_id = ? AND seq >= ? ORDER BY seq"
    )
    .all(draftId, from) as Array<{ seq: number }>;
  const move = db.prepare(
    "UPDATE draft_sentences SET seq = seq - 1 WHERE draft_id = ? AND seq = ?"
  );
  for (const row of rows) move.run(draftId, row.seq);
}

interface ResolvedPatch {
  text: string;
  startMs: number;
  endMs: number;
  confirm: boolean;
}

/** 校验并合成更新值：缺省字段取现值；endMs<=startMs 对合成后的值判断（08 号票
 * 单改起或止时同样走这条规则）。confirm:true → 已确认，否则手工改动 → 已改。 */
function resolveSentencePatch(
  input: unknown,
  current: DraftSentence
): ResolvedPatch {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new SentenceEditError("SENTENCE_INVALID", "请求体格式不正确");
  }
  const body = input as Record<string, unknown>;
  const hasText = body.text !== undefined;
  const hasStart = body.startMs !== undefined;
  const hasEnd = body.endMs !== undefined;
  if (!hasText && !hasStart && !hasEnd) {
    throw new SentenceEditError(
      "SENTENCE_INVALID",
      "至少要提供 text / startMs / endMs 之一"
    );
  }
  const text = hasText ? body.text : current.text;
  if (typeof text !== "string" || text.trim() === "") {
    throw new SentenceEditError("SENTENCE_INVALID", "句子文本不能为空");
  }
  const startMs = hasStart ? body.startMs : current.startMs;
  const endMs = hasEnd ? body.endMs : current.endMs;
  if (typeof startMs !== "number" || !Number.isInteger(startMs) || startMs < 0) {
    throw new SentenceEditError(
      "SENTENCE_INVALID",
      "startMs 必须是不小于 0 的整数毫秒"
    );
  }
  if (typeof endMs !== "number" || !Number.isInteger(endMs) || endMs < 0) {
    throw new SentenceEditError(
      "SENTENCE_INVALID",
      "endMs 必须是不小于 0 的整数毫秒"
    );
  }
  if (endMs <= startMs) {
    throw new SentenceEditError("SENTENCE_INVALID", "结束时间必须晚于开始时间");
  }
  const confirm = body.confirm === undefined ? false : body.confirm;
  if (typeof confirm !== "boolean") {
    throw new SentenceEditError("SENTENCE_INVALID", "confirm 必须是布尔值");
  }
  return { text, startMs, endMs, confirm };
}

/** 更新单句（文本/起止/确认），返回更新后的句子 */
export function updateSentence(
  db: Db,
  draftId: string,
  index: number,
  input: unknown
): DraftSentence {
  const current = getSentence(db, draftId, index);
  if (!current) throw new SentenceEditError("SENTENCE_NOT_FOUND", "句子不存在");
  const patch = resolveSentencePatch(input, current);
  const proofread = patch.confirm ? "confirmed" : "edited";
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE draft_sentences SET text = ?, start_ms = ?, end_ms = ?, proofread = ?
       WHERE draft_id = ? AND seq = ?`
    ).run(patch.text, patch.startMs, patch.endMs, proofread, draftId, index);
    touchDraft(db, draftId);
  });
  tx();
  return {
    index,
    text: patch.text,
    startMs: patch.startMs,
    endMs: patch.endMs,
    proofread,
  };
}

/** 删除单句，后续序号前移；返回删后的整个句子数组。草稿至少保留一句。 */
export function deleteSentence(
  db: Db,
  draftId: string,
  index: number
): DraftSentence[] {
  const current = getSentence(db, draftId, index);
  if (!current) throw new SentenceEditError("SENTENCE_NOT_FOUND", "句子不存在");
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM draft_sentences WHERE draft_id = ?")
    .get(draftId) as { n: number };
  if (n <= 1) {
    throw new SentenceEditError("LAST_SENTENCE", "草稿至少要保留一句");
  }
  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM draft_sentences WHERE draft_id = ? AND seq = ?"
    ).run(draftId, index);
    shiftSeqUpFrom(db, draftId, index + 1);
    touchDraft(db, draftId);
  });
  tx();
  return listDraftSentences(db, draftId);
}

/** 拼接两句文本：一侧已带边界空白就直接相接，否则补一个空格 */
export function mergeText(a: string, b: string): string {
  const glue = /\s$/.test(a) || /^\s/.test(b) ? "" : " ";
  return a + glue + b;
}

/** 本句与下一句合并：文本拼接，起止取并集，置 edited；后续序号前移，返回整个数组 */
export function mergeSentenceWithNext(
  db: Db,
  draftId: string,
  index: number
): DraftSentence[] {
  const current = getSentence(db, draftId, index);
  if (!current) throw new SentenceEditError("SENTENCE_NOT_FOUND", "句子不存在");
  const next = getSentence(db, draftId, index + 1);
  if (!next) {
    throw new SentenceEditError(
      "NO_NEXT_SENTENCE",
      "已经是最后一句，没有下一句可合并"
    );
  }
  const text = mergeText(current.text, next.text);
  const startMs = Math.min(current.startMs, next.startMs);
  const endMs = Math.max(current.endMs, next.endMs);
  const tx = db.transaction(() => {
    db.prepare(
      "DELETE FROM draft_sentences WHERE draft_id = ? AND seq = ?"
    ).run(draftId, index + 1);
    db.prepare(
      `UPDATE draft_sentences SET text = ?, start_ms = ?, end_ms = ?, proofread = 'edited'
       WHERE draft_id = ? AND seq = ?`
    ).run(text, startMs, endMs, draftId, index);
    shiftSeqUpFrom(db, draftId, index + 2);
    touchDraft(db, draftId);
  });
  tx();
  return listDraftSentences(db, draftId);
}
