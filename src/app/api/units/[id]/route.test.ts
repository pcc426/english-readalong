import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "./route";
import { openDb } from "@/lib/db";
import { authedGet, confirmDraftSentences, sessionCookieFor } from "@/lib/testing/auth-test-utils";
import {
  createDraft,
  completeTranscription,
  getDraft,
  setDraftVideo,
} from "@/lib/drafts/repo";
import { createStandardDraft } from "@/lib/drafts/standard-drafts";
import { finalizeDraft } from "@/lib/drafts/finalize";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.CONTENT_DIR;
  delete process.env.CONTENT_DATA_DIR;
  delete process.env.DB_PATH;
});

function setupEnv() {
  const contentDir = mkdtempSync(path.join(tmpdir(), "ra-content-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "ra-data-"));
  const dbDir = mkdtempSync(path.join(tmpdir(), "ra-db-"));
  writeFileSync(
    path.join(contentDir, "u2.json"),
    JSON.stringify({
      id: "u2-dragon-dance",
      title: "The dragon dance",
      source: "沪教版五上 Unit 2 · Story time",
      video: "五上_U2.mp4",
      sentences: [
        { text: "a", start: 0, end: 2 },
        { text: "b", start: 2, end: 4 },
        { text: "c", start: 4, end: 6 },
      ],
    })
  );
  process.env.CONTENT_DIR = contentDir;
  process.env.CONTENT_DATA_DIR = dataDir;
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
  return { dbPath: path.join(dbDir, "readalong.db") };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function accountIdOf(email: string, isAdmin = false): string {
  sessionCookieFor(email, isAdmin);
  const db = openDb(process.env.DB_PATH!);
  try {
    const row = db.prepare("SELECT id FROM accounts WHERE email = ?").get(email) as {
      id: string;
    };
    return row.id;
  } finally {
    db.close();
  }
}

/** 走真实定稿链路（票 09）：内容包写入账号自定义目录 */
function seedPublishedCustom(accountId: string) {
  const db = openDb(process.env.DB_PATH!);
  try {
    const draft = createDraft(db, { accountId, title: "家里的英语" });
    setDraftVideo(db, draft.id, `${accountId}/demo.mp4`);
    completeTranscription(db, draft.id, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);
    confirmDraftSentences(db, draft.id);
    finalizeDraft(db, getDraft(db, draft.id)!);
    return getDraft(db, draft.id)!;
  } finally {
    db.close();
  }
}

function insertAttempt(
  unitId: string,
  owner: string | null,
  sentenceIndex: number,
  score: number,
  createdAt = "2026-10-19 09:00:00"
) {
  const db = openDb(process.env.DB_PATH!);
  try {
    // stars 列是落库快照（详情接口不读它），占位即可
    db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(unitId, sentenceIndex, score, 1, owner, createdAt);
  } finally {
    db.close();
  }
}

describe("GET /api/units/[id]", () => {
  it("未登录访问返回 401 JSON", async () => {
    setupEnv();
    const res = await GET(new Request("http://x"), ctx("u2-dragon-dance"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("空库时返回句子列表与视频地址，最好成绩为空态", async () => {
    setupEnv();
    const res = await GET(authedGet(), ctx("u2-dragon-dance"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unit.id).toBe("u2-dragon-dance");
    expect(body.unit.video).toBe(
      `/api/media/shipped/${encodeURIComponent("五上_U2.mp4")}`
    );
    expect(body.unit.sentences).toHaveLength(3);
    expect(body.unit.sentences[0]).toMatchObject({
      index: 0,
      text: "a",
      start: 0,
      end: 2,
      bestScore: null,
      bestAt: null,
    });
  });

  it("有本人练习记录时返回每句最好成绩及其达成时间", async () => {
    setupEnv();
    const owner = accountIdOf("parent@test.com");
    insertAttempt("u2-dragon-dance", owner, 0, 80, "2026-10-19 08:00:00");
    insertAttempt("u2-dragon-dance", owner, 0, 92, "2026-10-19 09:00:00"); // 最好成绩
    insertAttempt("u2-dragon-dance", owner, 1, 70, "2026-10-19 10:00:00");
    const res = await GET(authedGet(), ctx("u2-dragon-dance"));
    const body = await res.json();
    expect(body.unit.sentences[0].bestScore).toBe(92);
    expect(body.unit.sentences[0].bestAt).toBe("2026-10-19 09:00:00");
    expect(body.unit.sentences[1].bestScore).toBe(70);
    expect(body.unit.sentences[2].bestScore).toBeNull();
  });

  it("他人的练习记录不出现：句子最好成绩按账号隔离（票 10）", async () => {
    setupEnv();
    insertAttempt("u2-dragon-dance", "acct-other", 0, 92);
    const res = await GET(authedGet(), ctx("u2-dragon-dance"));
    const body = await res.json();
    expect(body.unit.sentences[0].bestScore).toBeNull();
    expect(body.unit.sentences[0].bestAt).toBeNull();
  });

  it("已登录时未知单元返回 404", async () => {
    setupEnv();
    const res = await GET(authedGet(), ctx("nope"));
    expect(res.status).toBe(404);
  });

  describe("自定义内容（票 10 接线）", () => {
    it("归属账号可取已发布自定义内容：视频走鉴权媒体路由，成绩只含本人", async () => {
      setupEnv();
      const owner = accountIdOf("parent@test.com");
      const draft = seedPublishedCustom(owner);
      insertAttempt(draft.id, owner, 0, 88);

      const res = await GET(authedGet(), ctx(draft.id));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unit.id).toBe(draft.id);
      expect(body.unit.source).toBe("custom-upload");
      expect(body.unit.video).toBe(`/api/media/${owner}/demo.mp4`);
      expect(body.unit.sentences[0]).toMatchObject({
        text: "hello",
        bestScore: 88,
        bestAt: "2026-10-19 09:00:00",
      });
    });

    it("他人的自定义内容 404：详情接口不暴露其存在", async () => {
      setupEnv();
      const otherDraft = seedPublishedCustom(accountIdOf("other@test.com"));
      const res = await GET(authedGet(), ctx(otherDraft.id)); // parent 的 cookie
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("UNIT_NOT_FOUND");
    });
  });

  describe("标准内容（票 12 接线）", () => {
    /** 管理员经真实链路发布一个标准内容包（含练习记录用的多句） */
    function seedPublishedStandard(adminId: string): string {
      const db = openDb(process.env.DB_PATH!);
      try {
        const draft = createStandardDraft(db, {
          accountId: adminId,
          title: "五上 U2 Story time",
          unitId: "五上-U2",
          moduleKind: "Story time",
        });
        setDraftVideo(db, draft.id, `${adminId}/demo.mp4`);
        completeTranscription(db, draft.id, [
          { text: "hello", startMs: 0, endMs: 900 },
          { text: "world", startMs: 1000, endMs: 1800 },
        ]);
        confirmDraftSentences(db, draft.id);
        finalizeDraft(db, getDraft(db, draft.id)!);
        return draft.id;
      } finally {
        db.close();
      }
    }

    it("已发布标准内容对任意家长账号可见可练：视频改写为鉴权媒体路由", async () => {
      setupEnv();
      const adminId = accountIdOf("admin@test.com", true);
      const contentId = seedPublishedStandard(adminId);
      insertAttempt(contentId, accountIdOf("parent@test.com"), 0, 90);

      const res = await GET(authedGet(), ctx(contentId)); // parent 的 cookie
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.unit.id).toBe(contentId);
      expect(body.unit.source).toBe("standard-upload");
      // standard-upload 视频同样走鉴权媒体路由（10 号票只认 custom-upload，12 号票补上）
      expect(body.unit.video).toBe(`/api/media/${adminId}/demo.mp4`);
      expect(body.unit.sentences[0]).toMatchObject({
        text: "hello",
        bestScore: 90,
      });
    });
  });
});
