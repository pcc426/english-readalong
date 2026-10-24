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
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => {
    rmSync(contentDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });
  return { dbPath: path.join(dbDir, "readalong.db") };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
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
  return new Request("http://x", { headers: { cookie: `session=${sessionId}` } });
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
    expect(body.unit.video).toBe("/media/五上_U2.mp4");
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

  it("有练习记录时返回每句最好成绩及其达成时间", async () => {
    const { dbPath } = setupEnv();
    const db = openDb(dbPath);
    const insert = db.prepare(
      "INSERT INTO practice_attempts (unit_id, sentence_index, score, stars, created_at) VALUES (?, ?, ?, ?, ?)"
    );
    insert.run("u2-dragon-dance", 0, 80, 2, "2026-10-19 08:00:00");
    insert.run("u2-dragon-dance", 0, 92, 3, "2026-10-19 09:00:00"); // 最好成绩
    insert.run("u2-dragon-dance", 1, 70, 1, "2026-10-19 10:00:00");
    db.close();
    const res = await GET(authedGet(), ctx("u2-dragon-dance"));
    const body = await res.json();
    expect(body.unit.sentences[0].bestScore).toBe(92);
    expect(body.unit.sentences[0].bestAt).toBe("2026-10-19 09:00:00");
    expect(body.unit.sentences[1].bestScore).toBe(70);
    expect(body.unit.sentences[2].bestScore).toBeNull();
  });

  it("已登录时未知单元返回 404", async () => {
    setupEnv();
    const res = await GET(authedGet(), ctx("nope"));
    expect(res.status).toBe(404);
  });
});
