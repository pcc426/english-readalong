// 句子变更端点测试的共享夹具：临时库、种子草稿/句子、带会话的请求构造。
// 只服务 07 号票的 route.test.ts，与 auth-test-utils 的全局清理共用一套 afterEach。
import type { Db } from "@/lib/db";
import { setupDb, sessionCookieFor } from "@/lib/testing/auth-test-utils";
import { createDraft, completeTranscription } from "@/lib/drafts/repo";

/** 三句种子：覆盖「首句 0 毫秒起」「中间句」「末句」，方便翻页/合并/删除断言 */
export const SEED_SENTENCES = [
  { text: "Hello!", startMs: 0, endMs: 3200 },
  { text: "My name is Danny.", startMs: 3400, endMs: 6100 },
  { text: "What is your name?", startMs: 6300, endMs: 8900 },
];

/** 临时库 + 一个已登录家长（parent@test.com），返回库与其账号 id */
export function setupEnv(prefix: string): { db: Db; mine: string } {
  const db = setupDb(prefix);
  sessionCookieFor("parent@test.com");
  const mine = (
    db.prepare("SELECT id FROM accounts LIMIT 1").get() as { id: string }
  ).id;
  return { db, mine };
}

/** 转写已完成的草稿（proofreading，三句种子），返回草稿 id */
export function seedProofreadingDraft(db: Db, accountId: string): string {
  const draft = createDraft(db, { accountId, title: "校对中的草稿" });
  completeTranscription(db, draft.id, SEED_SENTENCES);
  return draft.id;
}

/** 非 proofreading 状态的草稿：transcribing 无句子；published 带种子句子 */
export function seedDraftWithStatus(
  db: Db,
  accountId: string,
  status: "transcribing" | "published"
): string {
  const draft = createDraft(db, { accountId, title: status });
  if (status === "published") {
    completeTranscription(db, draft.id, SEED_SENTENCES);
    db.prepare("UPDATE content_drafts SET status = 'published' WHERE id = ?").run(
      draft.id
    );
  }
  return draft.id;
}

/** 构造句子端点请求：带会话 cookie，body 可选 */
export function sentencesReq(
  method: string,
  draftId: string,
  index: number | string,
  body?: unknown,
  email = "parent@test.com"
): Request {
  const headers: Record<string, string> = { cookie: sessionCookieFor(email) };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://x/api/drafts/${draftId}/sentences/${index}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 路由第二参数（Next 15 风格：params 是 Promise） */
export function ctxOf(id: string, index: number | string) {
  return { params: Promise.resolve({ id, index: String(index) }) };
}

/** 库中该草稿的 seq 序列（断言删/并后无空洞） */
export function rowSeqs(db: Db, draftId: string): number[] {
  return (
    db
      .prepare(
        "SELECT seq FROM draft_sentences WHERE draft_id = ? ORDER BY seq"
      )
      .all(draftId) as Array<{ seq: number }>
  ).map((r) => r.seq);
}
