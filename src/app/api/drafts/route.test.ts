import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "./route";
import { openDb, type Db } from "@/lib/db";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import { createDraft, setDraftVideo, completeTranscription } from "@/lib/drafts/repo";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
});

function setupEnv(): Db {
  const db = setupDb("ra-list");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
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

function seedDraft(
  db: Db,
  accountId: string,
  title: string,
  sentenceCount = 0
): string {
  const draft = createDraft(db, { accountId, title });
  setDraftVideo(db, draft.id, `${accountId}/${draft.id}.mp4`);
  if (sentenceCount > 0) {
    completeTranscription(
      db,
      draft.id,
      Array.from({ length: sentenceCount }, (_, i) => ({
        text: `句子 ${i}`,
        startMs: i * 1000,
        endMs: i * 1000 + 800,
      }))
    );
  }
  return draft.id;
}

function get(cookie: string): Promise<Response> {
  return GET(new Request("http://x/api/drafts", { headers: { cookie } }));
}

describe("GET /api/drafts", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await get("");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("只列本人草稿，含状态与句子数", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const other = accountIdOf("other@test.com");
    // seedDraft 经 completeTranscription 落句 → 状态为待校对
    seedDraft(db, mine, "我的草稿", 4);
    seedDraft(db, other, "别人家的草稿", 9);

    const res = await get(sessionCookieFor("parent@test.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drafts).toHaveLength(1);
    expect(body.drafts[0]).toMatchObject({
      title: "我的草稿",
      status: "proofreading",
      sentenceCount: 4,
    });
    expect(typeof body.drafts[0].id).toBe("string");
    expect(typeof body.drafts[0].createdAt).toBe("string");

    // 另一账号视角只看到自己的
    const res2 = await get(sessionCookieFor("other@test.com"));
    const body2 = await res2.json();
    expect(body2.drafts).toHaveLength(1);
    expect(body2.drafts[0].title).toBe("别人家的草稿");
    expect(body2.drafts[0].sentenceCount).toBe(9);
  });

  it("新草稿排在前（转写完成后句子数可见）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const first = seedDraft(db, mine, "第一个", 0);
    completeTranscription(db, first, [
      { text: "a", startMs: 0, endMs: 900 },
      { text: "b", startMs: 1000, endMs: 1800 },
    ]);
    seedDraft(db, mine, "第二个", 0);

    const res = await get(sessionCookieFor("parent@test.com"));
    const body = await res.json();
    expect(body.drafts.map((d: { title: string }) => d.title)).toEqual([
      "第二个",
      "第一个",
    ]);
    expect(body.drafts[1].status).toBe("proofreading");
    expect(body.drafts[1].sentenceCount).toBe(2);
  });
});
