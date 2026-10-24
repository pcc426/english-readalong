import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "./route";
import { openDb } from "@/lib/db";
import { createAccount } from "@/lib/auth/accounts";
import { getAccountBySession } from "@/lib/auth/sessions";
import { MAX_LOGIN_FAILURES, LOGIN_LOCK_MS } from "@/lib/auth/rate-limit";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  vi.useRealTimers();
});

function setupDb() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "ra-login-"));
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  cleanups.push(() => rmSync(dbDir, { recursive: true, force: true }));
  return openDb(process.env.DB_PATH);
}

// 限速计数是模块级内存态、跨测试用例共享——按邮箱的用例各自用独立邮箱；
// post 默认给每次请求发不同的 x-forwarded-for，避免 IP 维度累计串扰。
let ipSeq = 0;
const nextIp = () => `10.7.0.${++ipSeq}`;

/** ip 传 "" 表示不带 x-forwarded-for（测 unknown 回退） */
function post(email: unknown, password: unknown, ip: string = nextIp()) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (ip) headers["x-forwarded-for"] = ip;
  return POST(
    new Request("http://x/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    })
  );
}

describe("POST /api/auth/login", () => {
  it("正确凭据：200 + HttpOnly/SameSite=Lax/Secure 的 session cookie，会话可换回账号", async () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    db.close();

    const res = await post("fam@test.com", "secret123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.account).toEqual({
      id: account.id,
      email: "fam@test.com",
      isAdmin: false,
    });

    const setCookie = res.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/session=/);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie.toLowerCase()).toContain("secure");
    expect(setCookie.toLowerCase()).toContain("path=/");

    // cookie 里的会话 id 真的能换回账号（会话已落库）
    const sessionId = setCookie.match(/session=([^;]+)/)![1];
    const db2 = openDb(process.env.DB_PATH!);
    expect(getAccountBySession(db2, sessionId)?.id).toBe(account.id);
    db2.close();
  });

  it("登录邮箱大小写不敏感", async () => {
    const db = setupDb();
    createAccount(db, { email: "fam@test.com", password: "secret123" });
    db.close();
    const res = await post("FAM@Test.COM", "secret123");
    expect(res.status).toBe(200);
  });

  it("错误密码 401；未知邮箱同样 401 且错误码一致（不暴露账号是否存在）", async () => {
    const db = setupDb();
    createAccount(db, { email: "fam@test.com", password: "secret123" });
    db.close();

    const wrongPassword = await post("fam@test.com", "wrong-pass");
    expect(wrongPassword.status).toBe(401);
    const unknownEmail = await post("nobody@test.com", "whatever");
    expect(unknownEmail.status).toBe(401);
    expect((await wrongPassword.json()).error.code).toBe(
      (await unknownEmail.json()).error.code
    );
  });

  // 注意：限速计数是模块级内存态、跨测试用例共享——
  // 涉及锁定的用例各用独立邮箱，避免计数互相污染。
  it(`连续失败 ${MAX_LOGIN_FAILURES} 次后锁定：正确密码也 429`, async () => {
    const db = setupDb();
    createAccount(db, { email: "lock@test.com", password: "secret123" });
    db.close();

    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      const res = await post("lock@test.com", "wrong-pass");
      expect(res.status).toBe(401);
    }
    const locked = await post("lock@test.com", "secret123");
    expect(locked.status).toBe(429);
    expect((await locked.json()).error.code).toBe("RATE_LIMITED");
  });

  it("同邮箱从不同 IP（x-forwarded-for）失败也累计限速", async () => {
    const db = setupDb();
    createAccount(db, { email: "cross@test.com", password: "secret123" });
    db.close();

    // 每次失败来自不同 IP，邮箱维度仍累计到锁定
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      const res = await post("cross@test.com", "wrong-pass", `10.8.${i}.1`);
      expect(res.status).toBe(401);
    }
    const locked = await post("cross@test.com", "wrong-pass", "10.8.99.1");
    expect(locked.status).toBe(429);
  });

  it("缺失 x-forwarded-for 时回退 unknown 维度：同源无头请求的失败累计锁 IP", async () => {
    const db = setupDb();
    createAccount(db, { email: "headless@test.com", password: "secret123" });
    db.close();

    // 每次失败用不同邮箱、都不带转发头 → unknown IP 维度累计到锁定
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      const res = await post(`nomad-${i}@test.com`, "whatever", "");
      expect(res.status).toBe(401);
    }
    const locked = await post("headless@test.com", "secret123", "");
    expect(locked.status).toBe(429);
  });

  it(`锁定 ${LOGIN_LOCK_MS} 后自动解除，可以重新尝试登录`, async () => {
    vi.useFakeTimers();
    const db = setupDb();
    createAccount(db, { email: "expire@test.com", password: "secret123" });
    db.close();

    for (let i = 0; i < MAX_LOGIN_FAILURES; i++)
      await post("expire@test.com", "x");
    expect((await post("expire@test.com", "x")).status).toBe(429);

    vi.setSystemTime(Date.now() + LOGIN_LOCK_MS + 1);
    const res = await post("expire@test.com", "secret123");
    expect(res.status).toBe(200);
  });

  it("成功登录清除失败计数：不会把之前的失败累加进下一轮", async () => {
    const db = setupDb();
    createAccount(db, { email: "reset@test.com", password: "secret123" });
    db.close();

    // 失败到差一次锁定，然后成功登录
    for (let i = 0; i < MAX_LOGIN_FAILURES - 1; i++)
      await post("reset@test.com", "wrong-pass");
    expect((await post("reset@test.com", "secret123")).status).toBe(200);

    // 若计数未清，这次失败会凑满 5 次触发 429
    const res = await post("reset@test.com", "wrong-pass");
    expect(res.status).toBe(401);
  });

  it("请求体缺字段或类型不对时 400（登录不校验邮箱格式，交给账号查找判定）", async () => {
    setupDb();
    expect((await post(undefined, undefined)).status).toBe(400);
    expect((await post(123, "x")).status).toBe(400);
    expect((await post("fam@test.com", null)).status).toBe(400);

    const badJson = POST(
      new Request("http://x/api/auth/login", {
        method: "POST",
        body: "not json",
      })
    );
    expect((await badJson).status).toBe(400);
  });
});
