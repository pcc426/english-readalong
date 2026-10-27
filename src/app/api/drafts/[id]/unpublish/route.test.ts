// 退回校对端点（V0.2.4 票 04）测试矩阵：
//   POST /api/drafts/[id]/unpublish
// 未登录 401；他人/不存在 404；非 published 409；
// 本人 published：200——练习记录（含他人家庭的）清空、内容包文件删除、状态回 proofreading。
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { POST } from "./route";
import { openDb } from "@/lib/db";
import {
  confirmDraftSentences,
  sessionCookieFor,
  setupDb,
} from "@/lib/testing/auth-test-utils";
import {
  createDraft,
  completeTranscription,
  getDraft,
  setDraftVideo,
} from "@/lib/drafts/repo";
import { finalizeDraft, packPathFor } from "@/lib/drafts/finalize";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.CONTENT_DATA_DIR;
});

function setupEnv() {
  const db = setupDb("ra-unpublish");
  mkdtempSyncForData();
  return db;
}

/** mkdtemp 供 CONTENT_DATA_DIR（finalize 写包落点） */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
function mkdtempSyncForData(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ra-unpublish-"));
  process.env.CONTENT_DATA_DIR = dir;
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function accountIdOf(email: string): string {
  sessionCookieFor(email);
  const db = openDb(process.env.DB_PATH!);
  try {
    return (
      db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
        id: string;
      }
    ).id;
  } finally {
    db.close();
  }
}

function seedPublished(accountId: string): string {
  const db = openDb(process.env.DB_PATH!);
  try {
    const draft = createDraft(db, { accountId, title: "家里的英语" });
    setDraftVideo(db, draft.id, `${accountId}/v.mp4`);
    completeTranscription(db, draft.id, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);
    confirmDraftSentences(db, draft.id);
    finalizeDraft(db, getDraft(db, draft.id)!);
    return draft.id;
  } finally {
    db.close();
  }
}

function post(id: string, email?: string) {
  const headers: Record<string, string> = {};
  if (email) headers.cookie = sessionCookieFor(email);
  return POST(
    new Request(`http://x/api/drafts/${id}/unpublish`, { method: "POST", headers }),
    { params: Promise.resolve({ id }) }
  );
}

describe("POST /api/drafts/[id]/unpublish（V0.2.4 票 04）", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await post("whatever");
    expect(res.status).toBe(401);
  });

  it("本人 published：200——两个家庭的练习记录清空、内容包删除、状态回 proofreading", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const other = accountIdOf("other@test.com");
    const id = seedPublished(mine);
    // 另一个家庭也练过这条内容
    db.prepare(
      `INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner)
       VALUES (?, 0, 90, 3, ?)`
    ).run(id, other);
    const packAbs = packPathFor(mine, id);
    expect(existsSync(packAbs)).toBe(true);

    const res = await post(id, "parent@test.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const attempts = db
      .prepare("SELECT COUNT(*) AS n FROM practice_attempts WHERE unit_id = ?")
      .get(id) as { n: number };
    expect(attempts.n).toBe(0); // 所有家庭的记录都清空
    expect(existsSync(packAbs)).toBe(false); // 内容包移除（练习/列表即不可达）
    expect(getDraft(db, id)?.status).toBe("proofreading"); // 回校对态
  });

  it("他人 published：404（不暴露存在性）", async () => {
    setupEnv();
    const other = accountIdOf("other@test.com");
    const id = seedPublished(other);
    const res = await post(id, "parent@test.com");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");
  });

  it("proofreading 草稿：409 NOT_PUBLISHED", async () => {
    setupEnv();
    const mine = accountIdOf("parent@test.com");
    const db = openDb(process.env.DB_PATH!);
    let id = "";
    try {
      const draft = createDraft(db, { accountId: mine, title: "校对中" });
      setDraftVideo(db, draft.id, `${mine}/v.mp4`);
      completeTranscription(db, draft.id, [
        { text: "hello", startMs: 0, endMs: 900 },
      ]);
      id = draft.id;
    } finally {
      db.close();
    }
    const res = await post(id, "parent@test.com");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_PUBLISHED");
  });
});
