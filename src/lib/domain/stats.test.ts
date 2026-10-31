import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "../db";
import {
  bestAttemptsBySentence,
  completionDistribution,
  latestRunStars,
} from "./stats";
import type { ContentPack } from "../content/schema";

const tmpDirs: string[] = [];
function makeDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "readalong-db-"));
  tmpDirs.push(dir);
  return openDb(path.join(dir, "test.db"));
}
afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function makeUnit(sentenceCount: number): ContentPack {
  return {
    id: "u-test",
    title: "Test unit",
    source: "test",
    video: "test.mp4",
    sentences: Array.from({ length: sentenceCount }, () => ({
      text: "a sentence",
      start: null,
      end: null,
    })),
  };
}

function attempt(
  db: Db,
  unitId: string,
  sentenceIndex: number,
  score: number,
  stars: number,
  owner: string | null = null,
  runId: string | null = null
) {
  db.prepare(
    "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner, run_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(unitId, sentenceIndex, score, stars, owner, runId);
}
type Db = ReturnType<typeof openDb>;

describe("单元完成度分布", () => {
  it("没有任何练习时分布全零、未练 100%", () => {
    const db = makeDb();
    const dist = completionDistribution(db, makeUnit(4));
    expect(dist.totalSentences).toBe(4);
    expect(dist.percentages).toEqual({
      threeStar: 0,
      twoStar: 0,
      oneStar: 0,
      unpracticed: 100,
    });
  });

  it("按每句最好成绩统计星级并四舍五入", () => {
    const db = makeDb();
    const unit = makeUnit(4);
    attempt(db, unit.id, 0, 92, 3);
    // 第 2 句先两星后练到三星，取最好成绩
    attempt(db, unit.id, 1, 80, 2);
    attempt(db, unit.id, 1, 91, 3);
    attempt(db, unit.id, 2, 60, 1);
    const dist = completionDistribution(db, unit);
    expect(dist.bestStars).toEqual([3, 3, 1, 0]);
    expect(dist.percentages).toEqual({
      threeStar: 50,
      twoStar: 0,
      oneStar: 25,
      unpracticed: 25,
    });
  });

  it("比例四舍五入（1/3 → 33）", () => {
    const db = makeDb();
    const unit = makeUnit(3);
    attempt(db, unit.id, 0, 95, 3);
    const dist = completionDistribution(db, unit);
    expect(dist.percentages.threeStar).toBe(33);
    expect(dist.percentages.unpracticed).toBe(67);
  });

  it("最好成绩平手时取最新一次的达成时间", () => {
    const db = makeDb();
    const unit = makeUnit(1);
    // 先插入一条旧的 90 分，再插入新的 90 分（id 更大），平手应取 id 最新的
    db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(unit.id, 0, 90, 3, "2000-01-01 00:00:00");
    attempt(db, unit.id, 0, 90, 3);
    const best = bestAttemptsBySentence(db, unit.id).get(0);
    expect(best?.score).toBe(90);
    expect(best?.createdAt).not.toBe("2000-01-01 00:00:00");
  });
});

describe("最近一次练习的总星数（票 04 latestRunStars）", () => {
  it("多个 run 只算最近一个：第二轮只练 1 句，返回第二轮的星数", () => {
    const db = makeDb();
    // 第一轮：完整练 2 句，共 3+2 = 5 星
    attempt(db, "u-test", 0, 92, 3, "acct-a", "run-1");
    attempt(db, "u-test", 1, 80, 2, "acct-a", "run-1");
    // 第二轮（最近）：只练第 1 句（中途退出），2 星
    attempt(db, "u-test", 0, 78, 1, "acct-a", "run-2");
    attempt(db, "u-test", 0, 88, 2, "acct-a", "run-2");

    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBe(2);
  });

  it("同一 run 内同句重复提交只计最高星级一次", () => {
    const db = makeDb();
    // 一轮内第 1 句练 3 次：2星、3星、1星 → 只计 3 星
    attempt(db, "u-test", 0, 80, 2, "acct-a", "run-1");
    attempt(db, "u-test", 0, 92, 3, "acct-a", "run-1");
    attempt(db, "u-test", 0, 60, 1, "acct-a", "run-1");

    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBe(3);
  });

  it("只有老数据（run_id NULL）时回退为每句最佳星之和", () => {
    const db = makeDb();
    // 老数据：第 1 句最好 3 星，第 2 句先 1 星后练到 2 星 → 回退 3 + 2 = 5
    attempt(db, "u-test", 0, 92, 3, "acct-a");
    attempt(db, "u-test", 1, 60, 1, "acct-a");
    attempt(db, "u-test", 1, 82, 2, "acct-a");

    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBe(5);
  });

  it("有 run 记录后 NULL 老数据不参与：只算最近 run 的和", () => {
    const db = makeDb();
    // 老数据 5 星 + 最近 run 只练 1 句 2 星 → 最近 run 口径返回 2，不叠加老数据
    attempt(db, "u-test", 0, 92, 3, "acct-a");
    attempt(db, "u-test", 1, 82, 2, "acct-a");
    attempt(db, "u-test", 0, 80, 2, "acct-a", "run-new");

    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBe(2);
  });

  it("完全没有任何练习记录返回 null（卡片显示「还没练过」）", () => {
    const db = makeDb();
    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBeNull();
  });

  it("最近 run 按账号隔离：他人更晚的 run 不影响本人的最近一次", () => {
    const db = makeDb();
    // acct-a 的 run 先写；acct-b 之后写了更晚的 run
    attempt(db, "u-test", 0, 92, 3, "acct-a", "run-a1");
    attempt(db, "u-test", 1, 88, 2, "acct-a", "run-a1");
    attempt(db, "u-test", 0, 60, 1, "acct-b", "run-b1");

    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBe(5);
    expect(latestRunStars(db, "u-test", { owner: "acct-b" })).toBe(1);
  });

  it("同一内容互不串台：另一内容的 run 不算本内容的最近一次", () => {
    const db = makeDb();
    attempt(db, "u-test", 0, 92, 3, "acct-a", "run-u1");
    attempt(db, "u-other", 0, 80, 2, "acct-a", "run-u2");

    expect(latestRunStars(db, "u-test", { owner: "acct-a" })).toBe(3);
    expect(latestRunStars(db, "u-other", { owner: "acct-a" })).toBe(2);
  });
});

describe("按账号统计（票 10 归属隔离）", () => {
  it("传 owner 时只统计该账号的练习记录，NULL 归属记录不计入", () => {
    const db = makeDb();
    const unit = makeUnit(2);
    attempt(db, unit.id, 0, 92, 3, "acct-a");
    attempt(db, unit.id, 1, 75, 1, "acct-a");
    attempt(db, unit.id, 0, 60, 1, "acct-b");
    attempt(db, unit.id, 1, 88, 2, null); // 迁移前的历史遗留行

    const a = bestAttemptsBySentence(db, unit.id, { owner: "acct-a" });
    expect(a.get(0)?.score).toBe(92);
    expect(a.get(1)?.score).toBe(75);
    expect(a.size).toBe(2);

    const b = bestAttemptsBySentence(db, unit.id, { owner: "acct-b" });
    expect(b.get(0)?.score).toBe(60);
    expect(b.size).toBe(1);
  });

  it("同一句各账号最好成绩互不干扰", () => {
    const db = makeDb();
    const unit = makeUnit(1);
    attempt(db, unit.id, 0, 95, 3, "acct-a");
    attempt(db, unit.id, 0, 70, 1, "acct-b");
    expect(bestAttemptsBySentence(db, unit.id, { owner: "acct-a" }).get(0)?.score).toBe(95);
    expect(bestAttemptsBySentence(db, unit.id, { owner: "acct-b" }).get(0)?.score).toBe(70);
  });

  it("完成度分布按账号隔离：各自百分比独立计算", () => {
    const db = makeDb();
    const unit = makeUnit(2);
    attempt(db, unit.id, 0, 95, 3, "acct-a");
    attempt(db, unit.id, 1, 92, 3, "acct-a");
    attempt(db, unit.id, 0, 65, 1, "acct-b");

    const distA = completionDistribution(db, unit, { owner: "acct-a" });
    expect(distA.percentages).toEqual({
      threeStar: 100,
      twoStar: 0,
      oneStar: 0,
      unpracticed: 0,
    });
    const distB = completionDistribution(db, unit, { owner: "acct-b" });
    expect(distB.percentages).toEqual({
      threeStar: 0,
      twoStar: 0,
      oneStar: 50,
      unpracticed: 50,
    });
  });
});
