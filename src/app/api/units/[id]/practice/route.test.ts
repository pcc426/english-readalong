import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { openDb } from "@/lib/db";
import { setScoringService } from "@/lib/scoring/current";
import { FakeScoringService } from "@/lib/scoring/fake";
import { getContentDetail, getContentOverview } from "@/lib/content/view";
import { sessionCookieFor } from "@/lib/testing/auth-test-utils";
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
  setScoringService(null);
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
      source: "test",
      video: "v.mp4",
      sentences: [
        { text: "sentence one", start: 0, end: 2 },
        { text: "sentence two", start: 2, end: 4 },
      ],
    })
  );
  process.env.CONTENT_DIR = contentDir;
  // 自定义内容根（票 04 seam）：定稿包与归属查询都落在这里
  process.env.CONTENT_DATA_DIR = dataDir;
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
}

/** 最小 RIFF 头缓冲：路由按 WAV 直通（测试不触发 ffmpeg） */
function fakeWav(): Blob {
  const buf = Buffer.alloc(1000, "RIFFxxxxWAVEdata");
  return new Blob([buf], { type: "audio/wav" });
}

async function post(
  sentenceIndex: number,
  audio: Blob | null,
  cookie?: string,
  contentId = "u2-dragon-dance"
) {
  const form = new FormData();
  if (audio) form.append("audio", audio, "rec.wav");
  form.append("sentenceIndex", String(sentenceIndex));
  const req = new Request(`http://x/api/units/${contentId}/practice`, {
    method: "POST",
    headers: { cookie: cookie ?? sessionCookieFor("parent@test.com") },
    body: form,
  });
  return POST(req, { params: Promise.resolve({ id: contentId }) });
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

/** 走真实的 09 号票定稿链路：草稿 → 转写 → 定稿（内容包写入账号自定义目录） */
function seedPublishedCustom(accountId: string) {
  const db = openDb(process.env.DB_PATH!);
  try {
    const draft = createDraft(db, { accountId, title: "家里的英语" });
    setDraftVideo(db, draft.id, `${accountId}/demo.mp4`);
    completeTranscription(db, draft.id, [
      { text: "hello", startMs: 0, endMs: 900 },
    ]);
    finalizeDraft(db, getDraft(db, draft.id)!);
    return getDraft(db, draft.id)!;
  } finally {
    db.close();
  }
}

function attemptRows() {
  const db = openDb(process.env.DB_PATH!);
  try {
    return db
      .prepare("SELECT owner, score FROM practice_attempts")
      .all() as Array<{ owner: string | null; score: number }>;
  } finally {
    db.close();
  }
}

describe("POST /api/units/[id]/practice", () => {
  it("未登录提交返回 401，不触发评分也不落库", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(92));
    const res = await post(0, fakeWav(), "session=forged-id");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
    expect(getContentDetail("u2-dragon-dance")?.sentences[0].bestScore).toBeNull();
  });

  it("正常提交：分数取整、返回星级与新纪录，数据落库并反映到详情与完成度", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(92.6)); // 讯飞返回小数 → 取整为 93
    const res = await post(0, fakeWav());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ score: 93, stars: 3, isNewBest: true, bestScore: 93 });

    // 句卡最好成绩反映新数据
    const detail = getContentDetail("u2-dragon-dance");
    expect(detail?.sentences[0].bestScore).toBe(93);
    expect(detail?.sentences[0].bestAt).not.toBeNull();

    // 单元完成度分布反映新数据（2 句中 1 句三星 → 50%）
    const overview = getContentOverview().find((u) => u.id === "u2-dragon-dance");
    expect(overview?.percentages.threeStar).toBe(50);
  });

  it("星级边界：89/90/74/75 → 两星/三星/一星/两星，且每次练习都落库", async () => {
    setupEnv();
    setScoringService(new FakeScoringService([89, 90, 74, 75]));
    const stars: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await post(0, fakeWav());
      stars.push((await res.json()).stars);
    }
    expect(stars).toEqual([2, 3, 1, 2]);
    // 低分重练也落库，最好成绩取最高的 90
    expect(getContentDetail("u2-dragon-dance")?.sentences[0].bestScore).toBe(90);
    // 区分性断言：4 次提交 = 4 行记录（若只在新纪录时落库会是 2 行）
    const { openDb } = await import("@/lib/db");
    const db = openDb(process.env.DB_PATH!);
    const count = db.prepare("SELECT COUNT(*) AS n FROM practice_attempts").get() as { n: number };
    db.close();
    expect(count.n).toBe(4);
  });

  it("刷新纪录：更高分 isNewBest=true，更低分 false 且最好成绩保持", async () => {
    setupEnv();
    setScoringService(new FakeScoringService([92, 85]));
    const first = await (await post(0, fakeWav())).json();
    expect(first).toMatchObject({ score: 92, stars: 3, isNewBest: true });
    const second = await (await post(0, fakeWav())).json();
    expect(second).toMatchObject({ score: 85, stars: 2, isNewBest: false, bestScore: 92 });
    expect(getContentDetail("u2-dragon-dance")?.sentences[0].bestScore).toBe(92);
  });

  it("空录音返回 EMPTY_AUDIO 且不落库", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(88));
    const res = await post(0, new Blob([Buffer.alloc(10)]));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("EMPTY_AUDIO");
    expect(getContentDetail("u2-dragon-dance")?.sentences[0].bestScore).toBeNull();
  });

  it("评分失败返回 502 可重试且不落库", async () => {
    setupEnv();
    setScoringService(new FakeScoringService([])); // 空队列 → 调用即拒绝
    const res = await post(0, fakeWav());
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("SCORING_FAILED");
    expect(getContentDetail("u2-dragon-dance")?.sentences[0].bestScore).toBeNull();
  });

  it("句子序号越界返回 404", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(88));
    const res = await post(5, fakeWav());
    expect(res.status).toBe(404);
  });

  it("练习记录写入当前账号归属（owner）", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(90));
    await post(0, fakeWav());
    const rows = attemptRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].owner).toBe(accountIdOf("parent@test.com"));
  });

  describe("账号隔离（票 10）", () => {
    it("两个账号在同一标准内容上互不干扰：新纪录与最好成绩各自独立", async () => {
      setupEnv();
      setScoringService(new FakeScoringService([90, 85, 80]));
      // 家长 A 练出 90
      const first = await (await post(0, fakeWav())).json();
      expect(first).toMatchObject({ isNewBest: true, bestScore: 90 });
      // 家长 B 首练 85：不受 A 的 90 压制， isNewBest
      const otherCookie = sessionCookieFor("other@test.com");
      const second = await (await post(0, fakeWav(), otherCookie)).json();
      expect(second).toMatchObject({ isNewBest: true, bestScore: 85 });
      // 家长 B 再练 80：低于自己的最好成绩
      const third = await (await post(0, fakeWav(), otherCookie)).json();
      expect(third).toMatchObject({ isNewBest: false, bestScore: 85 });
      // 两账号的记录都在库里，且各带归属
      const rows = attemptRows();
      expect(rows).toHaveLength(3);
      expect(rows.filter((r) => r.owner === accountIdOf("parent@test.com"))).toEqual([
        { owner: accountIdOf("parent@test.com"), score: 90 },
      ]);
      expect(
        rows.filter((r) => r.owner === accountIdOf("other@test.com")).map((r) => r.score)
      ).toEqual([85, 80]);
    });
  });

  describe("自定义内容练习（票 10 接线）", () => {
    it("归属账号练习已发布的自定义内容：门禁放行、取到内容、落库带归属", async () => {
      setupEnv();
      setScoringService(new FakeScoringService(93));
      const accountId = accountIdOf("parent@test.com");
      const draft = seedPublishedCustom(accountId);
      const res = await post(0, fakeWav(), undefined, draft.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ score: 93, stars: 3, isNewBest: true });
      const rows = attemptRows();
      expect(rows).toEqual([{ owner: accountId, score: 93 }]);
    });

    it("他人的自定义内容（已发布）404：练习接口不暴露其存在", async () => {
      setupEnv();
      setScoringService(new FakeScoringService(90));
      const otherId = accountIdOf("other@test.com");
      const draft = seedPublishedCustom(otherId);
      const res = await post(0, fakeWav(), undefined, draft.id); // 默认 parent 的 cookie
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("UNIT_NOT_FOUND");
    });
  });

  describe("未发布门禁（票 09）", () => {
    function seedLocalDraft(status: "proofreading" | "published") {
      const accountId = accountIdOf("parent@test.com");
      const db = openDb(process.env.DB_PATH!);
      try {
        const draft = createDraft(db, { accountId, title: "家里的英语" });
        setDraftVideo(db, draft.id, `${accountId}/demo.mp4`);
        completeTranscription(db, draft.id, [
          { text: "hello", startMs: 0, endMs: 900 },
        ]);
        if (status === "published") finalizeDraft(db, getDraft(db, draft.id)!);
        return getDraft(db, draft.id)!;
      } finally {
        db.close();
      }
    }

    function attemptCount(): number {
      const db = openDb(process.env.DB_PATH!);
      try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM practice_attempts").get() as {
          n: number;
        };
        return row.n;
      } finally {
        db.close();
      }
    }

    it("本人存在同 id 且未发布的草稿：409 CONTENT_NOT_PUBLISHED，不触发评分不落库", async () => {
      setupEnv();
      setScoringService(new FakeScoringService(88));
      const draft = seedLocalDraft("proofreading");
      const res = await post(0, fakeWav(), undefined, draft.id);
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("CONTENT_NOT_PUBLISHED");
      expect(attemptCount()).toBe(0);
    });

    it("发布后同 id 不再被门禁拦截：归属账号按定稿包照常练习", async () => {
      setupEnv();
      setScoringService(new FakeScoringService(91));
      const draft = seedLocalDraft("published");
      const res = await post(0, fakeWav(), undefined, draft.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ score: 91, stars: 3 });
      expect(getContentDetail(draft.id, {
        accountId: accountIdOf("parent@test.com"),
      })?.sentences[0].bestScore).toBe(91);
    });

    it("他人未发布的草稿 id：404（不暴露存在性，与归属隔离语义一致）", async () => {
      setupEnv();
      setScoringService(new FakeScoringService(88));
      const otherId = accountIdOf("other@test.com");
      let otherDraftId = "";
      const db = openDb(process.env.DB_PATH!);
      try {
        const draft = createDraft(db, { accountId: otherId, title: "别人家的" });
        completeTranscription(db, draft.id, [
          { text: "hello", startMs: 0, endMs: 900 },
        ]);
        otherDraftId = draft.id;
      } finally {
        db.close();
      }
      const res = await post(0, fakeWav(), undefined, otherDraftId);
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("UNIT_NOT_FOUND");
    });
  });
});
