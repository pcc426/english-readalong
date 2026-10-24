import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
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
  delete process.env.DB_PATH;
});

function setupDb() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "ra-me-"));
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  const db = openDb(process.env.DB_PATH);
  cleanups.push(() => {
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });
  return db;
}

function getWithCookie(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return GET(new Request("http://x/api/auth/me", { headers }));
}

describe("GET /api/auth/me", () => {
  it("有效会话：返回当前账号，管理员标志正确透出", async () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "boss@test.com",
      password: "secret123",
      isAdmin: true,
    });
    const sessionId = createSession(db, account.id);
    db.close();

    const res = getWithCookie(`session=${sessionId}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      account: { id: account.id, email: "boss@test.com", isAdmin: true },
    });
  });

  it("其余 cookie 不影响：混在多个 cookie 里也能找到 session", async () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    const sessionId = createSession(db, account.id);
    db.close();

    const res = getWithCookie(`other=1; session=${sessionId}; theme=dark`);
    expect(res.status).toBe(200);
  });

  it("未登录（无 cookie）401", async () => {
    setupDb();
    const res = getWithCookie();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("伪造的会话 id 401", async () => {
    setupDb();
    const res = getWithCookie("session=made-up-id");
    expect(res.status).toBe(401);
  });

  it("过期会话 401", async () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    const sessionId = createSession(db, account.id);
    db.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      sessionId
    );
    db.close();

    const res = getWithCookie(`session=${sessionId}`);
    expect(res.status).toBe(401);
  });
});
