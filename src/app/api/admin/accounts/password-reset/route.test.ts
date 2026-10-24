import { describe, it, expect } from "vitest";
import { POST as resetPost } from "./route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { openDb } from "@/lib/db";
import { createAccount } from "@/lib/auth/accounts";
import { sessionCookieFor, setupDb } from "@/lib/testing/auth-test-utils";

function adminPost(body: unknown, actor?: { email: string; isAdmin: boolean }) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (actor) {
    headers.cookie = sessionCookieFor(actor.email, actor.isAdmin);
  }
  return resetPost(
    new Request("http://x/api/admin/accounts/password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

function login(email: string, password: string) {
  return loginPost(
    new Request("http://x/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
}

describe("POST /api/admin/accounts/password-reset（管理员重置密码）", () => {
  it("权限矩阵：未登录 401 / 家长 403 / 管理员 200", async () => {
    setupDb();
    createAccount(openDb(process.env.DB_PATH!), {
      email: "fam@test.com",
      password: "old-pass-1",
    }).id;
    const actor = { email: "admin@test.com", isAdmin: true };

    const anon = await adminPost({
      email: "fam@test.com",
      newPassword: "new-pass-99",
    });
    expect(anon.status).toBe(401);

    const parent = await adminPost(
      { email: "fam@test.com", newPassword: "new-pass-99" },
      { email: "parent@test.com", isAdmin: false }
    );
    expect(parent.status).toBe(403);

    const admin = await adminPost(
      { email: "fam@test.com", newPassword: "new-pass-99" },
      actor
    );
    expect(admin.status).toBe(200);
  });

  it("重置后旧密码登录 401、新密码登录 200", async () => {
    setupDb();
    const db = openDb(process.env.DB_PATH!);
    createAccount(db, { email: "fam@test.com", password: "old-pass-1" });
    db.close();
    const actor = { email: "admin@test.com", isAdmin: true };

    const reset = await adminPost(
      { email: "fam@test.com", newPassword: "new-pass-99" },
      actor
    );
    expect(reset.status).toBe(200);

    expect((await login("fam@test.com", "old-pass-1")).status).toBe(401);
    expect((await login("fam@test.com", "new-pass-99")).status).toBe(200);
  });

  it("未知邮箱 404", async () => {
    setupDb();
    const res = await adminPost(
      { email: "nobody@test.com", newPassword: "new-pass-99" },
      { email: "admin@test.com", isAdmin: true }
    );
    expect(res.status).toBe(404);
  });

  it("邮箱格式不对或新密码不足 8 位时 400", async () => {
    setupDb();
    const actor = { email: "admin@test.com", isAdmin: true };

    expect(
      (
        await adminPost(
          { email: "not-an-email", newPassword: "new-pass-99" },
          actor
        )
      ).status
    ).toBe(400);
    expect(
      (
        await adminPost({ email: "fam@test.com", newPassword: "short" }, actor)
      ).status
    ).toBe(400);
    expect(
      (await adminPost({ email: "fam@test.com" }, actor)).status
    ).toBe(400);
  });
});
