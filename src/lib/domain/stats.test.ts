import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "../db";
import { bestAttemptsBySentence, completionDistribution } from "./stats";
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
  owner: string | null = null
) {
  db.prepare(
    "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, owner) VALUES (?, ?, ?, ?, ?)"
  ).run(unitId, sentenceIndex, score, stars, owner);
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
