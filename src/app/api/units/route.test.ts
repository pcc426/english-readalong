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
    path.join(contentDir, "u.json"),
    JSON.stringify({
      id: "u2-dragon-dance",
      title: "The dragon dance",
      source: "沪教版五上 Unit 2 · Story time",
      video: "五上_U2.mp4",
      sentences: [
        { text: "a", start: null, end: null },
        { text: "b", start: null, end: null },
        { text: "c", start: null, end: null },
      ],
    })
  );
  const dbPath = path.join(dbDir, "readalong.db");
  process.env.CONTENT_DIR = contentDir;
  process.env.CONTENT_DATA_DIR = dataDir;
  process.env.DB_PATH = dbPath;
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
  return { contentDir, dataDir, dbPath };
}

function accountIdOf(email: string): string {
  sessionCookieFor(email);
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

function insertAttempt(unitId: string, owner: string | null, sentenceIndex: number, score: number) {
  const db = openDb(process.env.DB_PATH!);
  try {
    // stars 列是落库快照（列表接口不读它），占位即可
    db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner) VALUES (?, ?, ?, ?, ?)"
    ).run(unitId, sentenceIndex, score, 1, owner);
  } finally {
    db.close();
  }
}

describe("GET /api/units", () => {
  it("未登录访问返回 401 JSON", async () => {
    setupEnv();
    const res = await GET(new Request("http://x/api/units"));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("返回单元列表，含句数、完成度与鼓励语", async () => {
    setupEnv();
    const res = await GET(authedGet("http://x/api/units"));
    const body = await res.json();
    expect(body.units).toHaveLength(1);
    const unit = body.units[0];
    expect(unit.id).toBe("u2-dragon-dance");
    expect(unit.title).toBe("The dragon dance");
    expect(unit.sentenceCount).toBe(3);
    expect(unit.percentages).toEqual({
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
      unpracticed: 100,
    });
    expect(typeof unit.encouragement).toBe("string");
  });

  it("有本人练习记录时完成度反映最好成绩", async () => {
    setupEnv();
    insertAttempt("u2-dragon-dance", accountIdOf("parent@test.com"), 0, 92);
    const res = await GET(authedGet("http://x/api/units"));
    const body = await res.json();
    expect(body.units[0].percentages.threeStar).toBe(33);
    expect(body.units[0].percentages.unpracticed).toBe(67);
    // 鼓励语随完成状态切换（部分进步 → 鼓励继续档）
    expect(body.units[0].encouragement).toContain("三星");
  });

  it("全部句子拿到三星时鼓励语切换为通关档", async () => {
    setupEnv();
    const owner = accountIdOf("parent@test.com");
    for (let i = 0; i < 3; i++) insertAttempt("u2-dragon-dance", owner, i, 95);
    const res = await GET(authedGet("http://x/api/units"));
    const body = await res.json();
    expect(body.units[0].percentages.threeStar).toBe(100);
    expect(body.units[0].encouragement).toContain("满星");
  });

  describe("账号隔离与自定义内容（票 10 接线）", () => {
    it("他人的练习记录不计入本账号的完成度", async () => {
      setupEnv();
      insertAttempt("u2-dragon-dance", "acct-other", 0, 92);
      const res = await GET(authedGet("http://x/api/units"));
      const body = await res.json();
      expect(body.units[0].percentages.unpracticed).toBe(100);
      expect(body.units[0].encouragement).not.toContain("三星");
    });

    it("教材内容页只显示标准内容：本账号已发布的自定义内容不在列表里（V0.2 整改）", async () => {
      setupEnv();
      const owner = accountIdOf("parent@test.com");
      const draft = seedPublishedCustom(owner);
      insertAttempt(draft.id, owner, 0, 95);

      const res = await GET(authedGet("http://x/api/units"));
      const body = await res.json();
      // 自定义内容走「自定义内容」页（/api/drafts），教材内容页仅标准内容
      expect(body.units.map((u: { id: string }) => u.id)).not.toContain(draft.id);
      expect(body.units.map((u: { id: string }) => u.id)).toContain("u2-dragon-dance");
    });

    it("他人的自定义内容不出现在列表里", async () => {
      setupEnv();
      const otherDraft = seedPublishedCustom(accountIdOf("other@test.com"));
      const res = await GET(authedGet("http://x/api/units")); // parent 的 cookie
      const body = await res.json();
      expect(body.units.map((u: { id: string }) => u.id)).not.toContain(otherDraft.id);
      // 标准内容照常返回
      expect(body.units.map((u: { id: string }) => u.id)).toContain("u2-dragon-dance");
    });
  });
});
