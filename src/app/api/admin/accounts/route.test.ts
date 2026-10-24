import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { openDb } from "@/lib/db";
import { createAccount, authenticate, findAccountByEmail } from "@/lib/auth/accounts";
import { createSession } from "@/lib/auth/sessions";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
});

function setupDb() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "ra-admin-create-"));
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => rmSync(dbDir, { recursive: true, force: true }));
  return openDb(process.env.DB_PATH);
}

/** 以指定身份登录后发出创建请求；不传邮箱即"未登录" */
function post(body: unknown, actor?: { email: string; isAdmin: boolean }) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (actor) {
    // 同一测试里多次请求复用同一 actor 账号，避免重复建号报 DuplicateAccountError
    const db = openDb(process.env.DB_PATH!);
    const account =
      findAccountByEmail(db, actor.email) ??
      createAccount(db, {
        email: actor.email,
        password: "secret123",
        isAdmin: actor.isAdmin,
      });
    headers.cookie = `session=${createSession(db, account.id)}`;
    db.close();
  }
  return POST(
    new Request("http://x/api/admin/accounts", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/admin/accounts（管理员建家长账号）", () => {
  it("权限矩阵：未登录 401 / 家长 403 / 管理员 201", async () => {
    setupDb();

    const anon = await post({
      email: "fam@test.com",
      initialPassword: "secret123",
    });
    expect(anon.status).toBe(401);

    const parent = await post(
      { email: "fam@test.com", initialPassword: "secret123" },
      { email: "parent@test.com", isAdmin: false }
    );
    expect(parent.status).toBe(403);

    const admin = await post(
      { email: "fam@test.com", initialPassword: "secret123" },
      { email: "admin@test.com", isAdmin: true }
    );
    expect(admin.status).toBe(201);
  });

  it("201 返回 { account: { id, email } }，邮箱小写存储，账号可立即登录", async () => {
    setupDb();

    const res = await post(
      { email: "Fam@Test.COM", initialPassword: "secret123" },
      { email: "admin@test.com", isAdmin: true }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.account.id).toBeTruthy();
    expect(body.account.email).toBe("fam@test.com");

    // 不含密码哈希等多余字段
    expect(Object.keys(body.account).sort()).toEqual(["email", "id"]);

    // 票验收：新账号可立即登录
    const db = openDb(process.env.DB_PATH!);
    expect(authenticate(db, "fam@test.com", "secret123")?.id).toBe(
      body.account.id
    );
    db.close();
  });

  it("重复邮箱（含大小写变体）409 + 中文错误信息", async () => {
    setupDb();
    const actor = { email: "admin@test.com", isAdmin: true };

    const first = await post(
      { email: "fam@test.com", initialPassword: "secret123" },
      actor
    );
    expect(first.status).toBe(201);

    const dup = await post(
      { email: "fam@test.com", initialPassword: "other-pass" },
      actor
    );
    expect(dup.status).toBe(409);
    expect((await dup.json()).error.message).toContain("已存在");

    const caseVariant = await post(
      { email: "FAM@TEST.COM", initialPassword: "secret123" },
      actor
    );
    expect(caseVariant.status).toBe(409);
  });

  it("邮箱格式不对或密码不足 8 位时 400（规则对齐 CLI）", async () => {
    setupDb();
    const actor = { email: "admin@test.com", isAdmin: true };

    const badEmail = await post(
      { email: "not-an-email", initialPassword: "secret123" },
      actor
    );
    expect(badEmail.status).toBe(400);

    const shortPassword = await post(
      { email: "fam@test.com", initialPassword: "short" },
      actor
    );
    expect(shortPassword.status).toBe(400);

    expect((await post(undefined, actor)).status).toBe(400);
  });
});
