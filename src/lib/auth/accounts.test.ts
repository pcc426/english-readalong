import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@/lib/db";
import {
  createAccount,
  findAccountByEmail,
  updatePassword,
  DuplicateAccountError,
} from "./accounts";
import { verifyPassword } from "./password";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
});

function setupDb() {
  const dbDir = mkdtempSync(path.join(tmpdir(), "ra-accounts-"));
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  const db = openDb(process.env.DB_PATH);
  cleanups.push(() => {
    db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });
  return db;
}

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
