import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DELETE, GET } from "./route";
import { openDb, type Db } from "@/lib/db";
import {
  setupDb,
  sessionCookieFor,
} from "@/lib/testing/auth-test-utils";
import {
  createDraft,
  setDraftVideo,
  completeTranscription,
} from "@/lib/drafts/repo";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  delete process.env.UPLOADS_DIR;
});

function setupEnv(): Db {
  const db = setupDb("ra-draft");
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "ra-uploads-"));
  process.env.UPLOADS_DIR = uploadsDir;
  cleanups.push(() => rmSync(uploadsDir, { recursive: true, force: true }));
  return db;
}

function accountIdOf(email: string): string {
  sessionCookieFor(email);
  const db = openDb(process.env.DB_PATH!);
  const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
    id: string;
  };
  db.close();
  return row.id;
}

/** 建草稿 + 磁盘视频 + 句子，返回草稿 id */
function seedDraft(db: Db, accountId: string, title: string): string {
  const draft = createDraft(db, { accountId, title });
  const relPath = `${accountId}/${draft.id}.mp4`;
  setDraftVideo(db, draft.id, relPath);
  const dir = path.join(process.env.UPLOADS_DIR!, accountId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${draft.id}.mp4`), Buffer.from([9, 8, 7]));
  completeTranscription(db, draft.id, [
    { text: "Hello!", startMs: 0, endMs: 3200 },
    { text: "My name is Danny.", startMs: 3400, endMs: 6100 },
  ]);
  return draft.id;
}

function reqWith(method: string, email: string, id: string): Request {
  return new Request(`http://x/api/drafts/${id}`, {
    method,
    headers: { cookie: sessionCookieFor(email) },
  });
}

describe("GET /api/drafts/[id]", () => {
  it("未登录 401", async () => {
    setupEnv();
    const res = await GET(
      new Request("http://x/api/drafts/nope"),
      { params: Promise.resolve({ id: "nope" }) }
    );
    expect(res.status).toBe(401);
  });

  it("本人可见详情：句子带 index/text/毫秒起止/校对状态，视频 URL 指向鉴权媒体接口", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedDraft(db, mine, "句子详情");

    const res = await GET(reqWith("GET", "parent@test.com", id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft).toMatchObject({
      id,
      title: "句子详情",
      status: "proofreading",
      videoPath: `${mine}/${id}.mp4`,
      videoUrl: `/api/media/${mine}/${id}.mp4`,
      transcribeError: null,
    });
    expect(body.draft.sentences).toEqual([
      { index: 0, text: "Hello!", startMs: 0, endMs: 3200, proofread: "auto" },
      {
        index: 1,
        text: "My name is Danny.",
        startMs: 3400,
        endMs: 6100,
        proofread: "auto",
      },
    ]);
  });

  it("他人与不存在的草稿一律 404（不暴露存在性）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedDraft(db, mine, "我的");

    const others = await GET(reqWith("GET", "other@test.com", id), {
      params: Promise.resolve({ id }),
    });
    expect(others.status).toBe(404);
    expect((await others.json()).error.code).toBe("DRAFT_NOT_FOUND");

    const missing = await GET(reqWith("GET", "parent@test.com", "no-such-id"), {
      params: Promise.resolve({ id: "no-such-id" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("DELETE /api/drafts/[id]", () => {
  it("本人删除：库中草稿与句子清掉，磁盘视频一并清理", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedDraft(db, mine, "要删的");

    const res = await DELETE(reqWith("DELETE", "parent@test.com", id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const after = openDb(process.env.DB_PATH!);
    expect(
      (after.prepare("SELECT COUNT(*) AS n FROM content_drafts").get() as { n: number }).n
    ).toBe(0);
    expect(
      (after.prepare("SELECT COUNT(*) AS n FROM draft_sentences").get() as { n: number }).n
    ).toBe(0);
    after.close();
    const dir = path.join(process.env.UPLOADS_DIR!, mine);
    expect(existsSync(path.join(dir, `${id}.mp4`))).toBe(false);
  });

  it("他人删除 404：草稿、句子、磁盘文件原样保留", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedDraft(db, mine, "删不掉别人的");

    const res = await DELETE(reqWith("DELETE", "other@test.com", id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("DRAFT_NOT_FOUND");

    expect(
      (db.prepare("SELECT COUNT(*) AS n FROM content_drafts").get() as { n: number }).n
    ).toBe(1);
    expect(
      existsSync(
        path.join(process.env.UPLOADS_DIR!, mine, `${id}.mp4`)
      )
    ).toBe(true);
  });

  it("文件已不在磁盘时删除仍成功（清理到底，不二次报错）", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    const id = seedDraft(db, mine, "文件先丢");
    rmSync(path.join(process.env.UPLOADS_DIR!, mine, `${id}.mp4`));

    const res = await DELETE(reqWith("DELETE", "parent@test.com", id), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    expect(readdirSync(path.join(process.env.UPLOADS_DIR!, mine))).toEqual([]);
  });

  it("不存在的草稿 404", async () => {
    setupEnv();
    accountIdOf("parent@test.com");
    const res = await DELETE(reqWith("DELETE", "parent@test.com", "no-such-id"), {
      params: Promise.resolve({ id: "no-such-id" }),
    });
    expect(res.status).toBe(404);
  });

  it("删除只影响目标草稿，本账号其他草稿无恙", async () => {
    const db = setupEnv();
    const mine = accountIdOf("parent@test.com");
    seedDraft(db, mine, "保留");
    const b = seedDraft(db, mine, "删除");

    await DELETE(reqWith("DELETE", "parent@test.com", b), {
      params: Promise.resolve({ id: b }),
    });
    const left = openDb(process.env.DB_PATH!)
      .prepare("SELECT title FROM content_drafts ORDER BY rowid")
      .all() as Array<{ title: string }>;
    expect(left).toEqual([{ title: "保留" }]);
  });
});
