import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { openDb, type Db } from "@/lib/db";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import {
  createDraft,
  getDraft,
  setDraftVideo,
  completeTranscription,
} from "@/lib/drafts/repo";
import { packPathFor } from "@/lib/drafts/finalize";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.CONTENT_DATA_DIR;
});

function setupEnv(): Db {
  const db = setupDb("ra-publish");
  const contentDataDir = mkdtempSync(path.join(tmpdir(), "ra-pack-"));
  process.env.CONTENT_DATA_DIR = contentDataDir;
  cleanups.push(() => rmSync(contentDataDir, { recursive: true, force: true }));
  return db;
}

/** sessionCookieFor 惰性建号；这里显式拿账号 id 供落草稿用 */
function accountIdOf(email: string): string {
  sessionCookieFor(email);
  const db = openDb(process.env.DB_PATH!);
  const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
    id: string;
  };
  db.close();
  return row.id;
}

function seedProofreading(
  db: Db,
  accountId: string,
  sentences: Array<{ text: string; startMs: number; endMs: number }>,
  title = "家里的英语"
) {
  const draft = createDraft(db, { accountId, title });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  completeTranscription(db, draft.id, sentences);
  return getDraft(db, draft.id)!;
}

function post(id: string, cookie: string): Promise<Response> {
  return POST(
    new Request(`http://x/api/drafts/${id}/publish`, {
      method: "POST",
      headers: { cookie },
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe("POST /api/drafts/[id]/publish", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await post("whatever", "session=forged-id");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("合法定稿：200 返回 content 概要，包文件落盘且内容正确，状态置 published", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 0, endMs: 900 },
      { text: "world", startMs: 1234, endMs: 2345 },
    ]);

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      content: {
        id: draft.id,
        title: "家里的英语",
        type: "custom",
        owner: accountId,
      },
    });

    // 包文件落盘：<customContentRoot>/<accountId>/<draftId>.json，秒换算正确
    const abs = packPathFor(accountId, draft.id);
    const onDisk = JSON.parse(readFileSync(abs, "utf8"));
    expect(onDisk).toMatchObject({
      id: draft.id,
      title: "家里的英语",
      type: "custom",
      owner: accountId,
    });
    expect(onDisk.sentences).toEqual([
      { text: "hello", start: 0, end: 0.9 },
      { text: "world", start: 1.2, end: 2.3 },
    ]);

    expect(getDraft(db, draft.id)?.status).toBe("published");
  });

  it("缺文本句：422 INVALID_DRAFT 带逐句问题，不写文件状态不变", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 0, endMs: 900 },
      { text: "  ", startMs: 1000, endMs: 1800 },
    ]);

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_DRAFT");
    expect(body.error.issues).toEqual([
      { index: 1, problem: expect.stringContaining("文本") },
    ]);
    expect(existsSync(packPathFor(accountId, draft.id))).toBe(false);
    expect(getDraft(db, draft.id)?.status).toBe("proofreading");
  });

  it("起止倒置句：422 指出具体句子，不产生半成品", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 900, endMs: 900 },
    ]);

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_DRAFT");
    expect(body.error.issues).toEqual([
      { index: 0, problem: expect.stringContaining("起止") },
    ]);
    expect(existsSync(packPathFor(accountId, draft.id))).toBe(false);
  });

  it("空草稿（转写没产出句子）：422 草稿级问题", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, []);

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.issues).toEqual([
      { index: null, problem: expect.stringContaining("句子") },
    ]);
  });

  it("还在转写中的草稿：409 NOT_PROOFREADING", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = createDraft(db, { accountId, title: "转写中" });

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_PROOFREADING");
  });

  it("已发布草稿重复定稿：409 ALREADY_PUBLISHED", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);
    const cookie = sessionCookieFor("parent@test.com");
    expect((await post(draft.id, cookie)).status).toBe(200);

    const res = await post(draft.id, cookie);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ALREADY_PUBLISHED");
  });

  it("他人与不存在的草稿一律 404，不暴露存在性", async () => {
    const db = setupEnv();
    accountIdOf("parent@test.com");
    const otherId = accountIdOf("other@test.com");
    const draft = seedProofreading(db, otherId, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");

    const res2 = await post("missing-id", sessionCookieFor("parent@test.com"));
    expect(res2.status).toBe(404);
    expect((await res2.json()).error.code).toBe("DRAFT_NOT_FOUND");
  });

  it("内容包写盘失败：500 且状态停在 proofreading，可修复后重试", async () => {
    const db = setupEnv();
    const accountId = accountIdOf("parent@test.com");
    const draft = seedProofreading(db, accountId, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);
    // 目标包路径被目录占用 → writeFileSync 抛错 → 整体失败
    mkdirSync(packPathFor(accountId, draft.id), { recursive: true });

    const res = await post(draft.id, sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("PACK_WRITE_FAILED");
    expect(getDraft(db, draft.id)?.status).toBe("proofreading");
  });
});
