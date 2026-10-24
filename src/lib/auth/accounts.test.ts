import { describe, it, expect } from "vitest";
import { setupDb } from "@/lib/testing/auth-test-utils";
import {
  authenticate,
  createAccount,
  findAccountByEmail,
  updatePassword,
  DuplicateAccountError,
} from "./accounts";
import { verifyPassword } from "./password";

describe("createAccount", () => {
  it("创建账号：密码只存 bcrypt 哈希，返回值不含密码", () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "Parent@Test.com",
      password: "secret123",
      isAdmin: true,
    });
    // 邮箱统一小写存储与返回
    expect(account.email).toBe("parent@test.com");
    expect(account.isAdmin).toBe(true);
    expect(account.id).toBeTruthy();
    expect(account.createdAt).toBeTruthy();
    expect(JSON.stringify(account)).not.toContain("secret123");

    const row = db
      .prepare("SELECT password_hash FROM accounts WHERE id = ?")
      .get(account.id) as { password_hash: string };
    expect(row.password_hash).not.toContain("secret123");
    expect(row.password_hash.startsWith("$2")).toBe(true);
  });

  it("不传 isAdmin 时默认为普通家长账号", () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    expect(account.isAdmin).toBe(false);
  });

  it("邮箱唯一：重复创建（含大小写变体）抛 DuplicateAccountError", () => {
    const db = setupDb();
    createAccount(db, { email: "a@test.com", password: "secret123" });
    expect(() =>
      createAccount(db, { email: "A@Test.com", password: "other456" })
    ).toThrow(DuplicateAccountError);
  });
});

describe("findAccountByEmail", () => {
  it("命中时大小写不敏感，未命中返回 undefined", () => {
    const db = setupDb();
    const created = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    expect(findAccountByEmail(db, "FAM@test.com")?.id).toBe(created.id);
    expect(findAccountByEmail(db, "nobody@test.com")).toBeUndefined();
  });
});

describe("updatePassword", () => {
  it("改密后旧密码失效、新密码可登录", () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "a@test.com",
      password: "old-secret-1",
    });
    updatePassword(db, account.id, "new-secret-2");

    const row = db
      .prepare("SELECT password_hash FROM accounts WHERE id = ?")
      .get(account.id) as { password_hash: string };
    expect(verifyPassword("old-secret-1", row.password_hash)).toBe(false);
    expect(verifyPassword("new-secret-2", row.password_hash)).toBe(true);
  });
});

describe("authenticate", () => {
  it("凭据正确返回账号；错误密码与未知邮箱一律 undefined", () => {
    const db = setupDb();
    const account = createAccount(db, {
      email: "fam@test.com",
      password: "secret123",
    });
    expect(authenticate(db, "fam@test.com", "secret123")?.id).toBe(account.id);
    expect(authenticate(db, "fam@test.com", "wrong")).toBeUndefined();
    expect(authenticate(db, "nobody@test.com", "whatever")).toBeUndefined();
  });

  // 防时序探测（ADR-0003）：未知邮箱也要对哑哈希跑一次 bcrypt 比对，
  // 否则"查无此邮箱"立即返回，响应耗时差异可被用来探测账号是否存在。
  // 用耗时下限证明比对真的执行了（cost 10 的 bcrypt 比对不可能快过 20ms）。
  it("未知邮箱也执行一次 bcrypt 比对（不因查无此账号而短路）", () => {
    const db = setupDb();
    const start = performance.now();
    const result = authenticate(db, "nobody@test.com", "guess-attempt");
    const elapsedMs = performance.now() - start;
    expect(result).toBeUndefined();
    expect(elapsedMs).toBeGreaterThanOrEqual(20);
  });
});
