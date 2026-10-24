import { describe, it, expect } from "vitest";
import { POST } from "./route";
import { openDb } from "@/lib/db";
import { createAccount } from "@/lib/auth/accounts";
import { createSession, getAccountBySession } from "@/lib/auth/sessions";
import { setupDb } from "@/lib/testing/auth-test-utils";

function postWithCookie(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return POST(new Request("http://x/api/auth/logout", { method: "POST", headers }));
}

describe("POST /api/auth/logout", () => {
  it("退出后会话记录被删除并失效，cookie 被清除", async () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    const sessionId = createSession(db, account.id);
    db.close();

    const res = postWithCookie(`session=${sessionId}`);
    expect(res.status).toBe(200);

    // 会话记录已删：同一 id 再也换不回账号
    const db2 = openDb(process.env.DB_PATH!);
    expect(getAccountBySession(db2, sessionId)).toBeUndefined();
    db2.close();

    // 响应显式清除 cookie（Max-Age=0）
    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("max-age=0");
  });

  it("未登录退出也 200（幂等，不清数据库）", async () => {
    setupDb();
    const res = postWithCookie();
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    expect(setCookie).toContain("max-age=0");
  });
});
