import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { createAccount } from "@/lib/auth/accounts";
import { createSession } from "@/lib/auth/sessions";
import { openDb } from "@/lib/db";
import { setupDb } from "@/lib/testing/auth-test-utils";
import { setStandardContentPublic } from "@/lib/settings/content-visibility";

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
      account: {
        id: account.id,
        email: "boss@test.com",
        isAdmin: true,
        // 管理员即使开关关闭也能看标准内容（v0.3.6）
        standardContentVisible: true,
      },
    });
  });

  it("普通账号默认看不到标准内容；开关开启后可见（v0.3.6）", async () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    const sessionId = createSession(db, account.id);
    db.close();

    const before = await getWithCookie(`session=${sessionId}`);
    expect((await before.json()).account.standardContentVisible).toBe(false);

    const writeDb = openDb(process.env.DB_PATH!);
    setStandardContentPublic(writeDb, true);
    writeDb.close();

    const after = await getWithCookie(`session=${sessionId}`);
    expect((await after.json()).account.standardContentVisible).toBe(true);
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
