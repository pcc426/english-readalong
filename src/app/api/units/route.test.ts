import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

function insertAttempt(
  unitId: string,
  owner: string | null,
  sentenceIndex: number,
  score: number,
  runId: string | null = null
) {
  const db = openDb(process.env.DB_PATH!);
  try {
    // stars 列是落库快照（列表接口不读它），占位即可
    db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(unitId, sentenceIndex, score, 1, owner, runId);
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
    // 鼓励语随完成状态切换（部分进步 → 鼓励继续档）；V0.3.1 起不再提星级
    expect(body.units[0].encouragement).toContain("继续");
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

  describe("最近一次练习总星数 latestRunStars（票 04）", () => {
    it("未练过为 null", async () => {
      setupEnv();
      const res = await GET(authedGet("http://x/api/units"));
      const body = await res.json();
      expect(body.units[0].latestRunStars).toBeNull();
    });

    it("只有老数据（run_id NULL）回退为每句最佳星之和；有 run 后按最近 run 口径", async () => {
      setupEnv();
      const owner = accountIdOf("parent@test.com");
      // 老数据两句各 3 星（95 分）→ 回退 3 + 3 = 6
      insertAttempt("u2-dragon-dance", owner, 0, 95);
      insertAttempt("u2-dragon-dance", owner, 1, 95);
      let res = await GET(authedGet("http://x/api/units"));
      let body = await res.json();
      expect(body.units[0].latestRunStars).toBe(6);

      // 之后一轮新 run 只练 1 句 1 星 → 最近 run 口径，不叠加老数据
      insertAttempt("u2-dragon-dance", owner, 2, 60, "run-new");
      res = await GET(authedGet("http://x/api/units"));
      body = await res.json();
      expect(body.units[0].latestRunStars).toBe(1);
    });

    it("按账号隔离：他人的 run 不计入本账号", async () => {
      setupEnv();
      insertAttempt("u2-dragon-dance", "acct-other", 0, 95, "run-other");
      const res = await GET(authedGet("http://x/api/units"));
      const body = await res.json();
      expect(body.units[0].latestRunStars).toBeNull();
    });
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

  describe("列表卡新字段（票 05：封面改写 + 单元下拉数据）", () => {
    it("随代码包带 poster：列表行同样改写为 shipped 鉴权媒体路由；无 poster 为 null", async () => {
      setupEnv();
      writeFileSync(
        path.join(process.env.CONTENT_DIR!, "u3.json"),
        JSON.stringify({
          id: "u3-poster",
          title: "Amazing plants",
          source: "沪教版五上 Unit 3 · Chant time",
          video: "五上_U3.mp4",
          poster: "五上_U3.jpg",
          sentences: [{ text: "x", start: 0, end: 1 }],
        }),
        "utf8"
      );

      const res = await GET(authedGet("http://x/api/units"));
      const body = await res.json();
      const byId = (id: string) =>
        body.units.find((u: { id: string }) => u.id === id);
      expect(byId("u3-poster").poster).toBe(
        `/api/media/shipped/${encodeURIComponent("五上_U3.jpg")}`
      );
      expect(byId("u2-dragon-dance").poster).toBeNull();
    });

    it("运行时标准上传包带 poster：改写为鉴权媒体路由", async () => {
      setupEnv();
      const owner = accountIdOf("parent@test.com");
      const stdDir = path.join(process.env.CONTENT_DATA_DIR!, "standard");
      mkdirSync(stdDir, { recursive: true });
      writeFileSync(
        path.join(stdDir, "up.json"),
        JSON.stringify({
          id: "up-pack",
          title: "Unit 5 Rhyme",
          source: "standard-upload",
          video: `${owner}/u5.mp4`,
          poster: `${owner}/u5.jpg`,
          sentences: [{ text: "hi", start: 0, end: 1 }],
        }),
        "utf8"
      );

      const res = await GET(authedGet("http://x/api/units"));
      const row = (await res.json()).units.find(
        (u: { id: string }) => u.id === "up-pack"
      );
      expect(row.poster).toBe(`/api/media/${owner}/u5.jpg`);
    });

    it("textbookUnits：注册教材全部单元（序号＋英文标题）随响应下发，供单元下拉", async () => {
      setupEnv();
      const res = await GET(authedGet("http://x/api/units"));
      const body = await res.json();
      expect(body.textbookUnits[0]).toEqual({ no: 1, title: "Clubs in our school" });
      expect(body.textbookUnits).toHaveLength(10);
    });
  });
});
