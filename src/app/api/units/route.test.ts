import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET } from "./route";
import { openDb } from "@/lib/db";
import { createAccount } from "@/lib/auth/accounts";
import { createSession } from "@/lib/auth/sessions";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.CONTENT_DIR;
  delete process.env.DB_PATH;
});

function setupEnv() {
  const contentDir = mkdtempSync(path.join(tmpdir(), "ra-content-"));
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
  process.env.DB_PATH = dbPath;
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
  return { contentDir, dbPath };
}

/** 建一个登录家长并返回带会话 cookie 的请求（单元接口受 ADR-0003 鉴权保护） */
function authedGet() {
  const db = openDb(process.env.DB_PATH!);
  const account = createAccount(db, {
    email: "parent@test.com",
    password: "secret123",
  });
  const sessionId = createSession(db, account.id);
  db.close();
  return new Request("http://x/api/units", {
    headers: { cookie: `session=${sessionId}` },
  });
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
    const res = await GET(authedGet());
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

  it("有练习记录时完成度反映最好成绩", async () => {
    const { dbPath } = setupEnv();
    const db = openDb(dbPath);
    db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars) VALUES (?, ?, ?, ?)"
    ).run("u2-dragon-dance", 0, 92, 3);
    db.close();
    const res = await GET(authedGet());
    const body = await res.json();
    expect(body.units[0].percentages.threeStar).toBe(33);
    expect(body.units[0].percentages.unpracticed).toBe(67);
    // 鼓励语随完成状态切换（部分进步 → 鼓励继续档）
    expect(body.units[0].encouragement).toContain("三星");
  });

  it("全部句子拿到三星时鼓励语切换为通关档", async () => {
    const { dbPath } = setupEnv();
    const db = openDb(dbPath);
    const insert = db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars) VALUES (?, ?, ?, ?)"
    );
    for (let i = 0; i < 3; i++) insert.run("u2-dragon-dance", i, 95, 3);
    db.close();
    const res = await GET(authedGet());
    const body = await res.json();
    expect(body.units[0].percentages.threeStar).toBe(100);
    expect(body.units[0].encouragement).toContain("满星");
  });
});
