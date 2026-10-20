import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { setScoringService } from "@/lib/scoring/current";
import { FakeScoringService } from "@/lib/scoring/fake";
import { getUnitDetail, getUnitsOverview } from "@/lib/units";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.CONTENT_DIR;
  delete process.env.DB_PATH;
  setScoringService(null);
});

function setupEnv() {
  const contentDir = mkdtempSync(path.join(tmpdir(), "ra-content-"));
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
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
}

/** 最小 RIFF 头缓冲：路由按 WAV 直通（测试不触发 ffmpeg） */
function fakeWav(): Blob {
  const buf = Buffer.alloc(1000, "RIFFxxxxWAVEdata");
  return new Blob([buf], { type: "audio/wav" });
}

function post(sentenceIndex: number, audio: Blob | null) {
  const form = new FormData();
  if (audio) form.append("audio", audio, "rec.wav");
  form.append("sentenceIndex", String(sentenceIndex));
  const req = new Request("http://x/api/units/u2-dragon-dance/practice", {
    method: "POST",
    body: form,
  });
  return POST(req, { params: Promise.resolve({ id: "u2-dragon-dance" }) });
}

describe("POST /api/units/[id]/practice", () => {
  it("正常提交：分数取整、返回星级与新纪录，数据落库并反映到详情与完成度", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(92.6)); // 讯飞返回小数 → 取整为 93
    const res = await post(0, fakeWav());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ score: 93, stars: 3, isNewBest: true, bestScore: 93 });

    // 句卡最好成绩反映新数据
    const detail = getUnitDetail("u2-dragon-dance");
    expect(detail?.sentences[0].bestScore).toBe(93);
    expect(detail?.sentences[0].bestAt).not.toBeNull();

    // 单元完成度分布反映新数据（2 句中 1 句三星 → 50%）
    const overview = getUnitsOverview().find((u) => u.id === "u2-dragon-dance");
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
    expect(getUnitDetail("u2-dragon-dance")?.sentences[0].bestScore).toBe(90);
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
    expect(getUnitDetail("u2-dragon-dance")?.sentences[0].bestScore).toBe(92);
  });

  it("空录音返回 EMPTY_AUDIO 且不落库", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(88));
    const res = await post(0, new Blob([Buffer.alloc(10)]));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("EMPTY_AUDIO");
    expect(getUnitDetail("u2-dragon-dance")?.sentences[0].bestScore).toBeNull();
  });

  it("评分失败返回 502 可重试且不落库", async () => {
    setupEnv();
    setScoringService(new FakeScoringService([])); // 空队列 → 调用即拒绝
    const res = await post(0, fakeWav());
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("SCORING_FAILED");
    expect(getUnitDetail("u2-dragon-dance")?.sentences[0].bestScore).toBeNull();
  });

  it("句子序号越界返回 404", async () => {
    setupEnv();
    setScoringService(new FakeScoringService(88));
    const res = await post(5, fakeWav());
    expect(res.status).toBe(404);
  });
});
