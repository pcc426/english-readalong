// 账号（ADR-0003）：邀请制，管理员经管理入口/CLI 建号，无自助注册。
// Account 类型不含密码哈希，避免哈希顺着返回值泄到接口层。
import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";

export interface Account {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

/** 邮箱已被注册（不是裸 Error，调用方可精确区分并提示） */
export class DuplicateAccountError extends Error {
  constructor(email: string) {
    super(`邮箱已存在: ${email}`);
    this.name = "DuplicateAccountError";
  }
}

interface AccountRow {
  id: string;
  email: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

/** 邮箱统一小写存储，登录与查重随之大小写不敏感 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createAccount(
  db: Db,
  input: { email: string; password: string; isAdmin?: boolean }
): Account {
  const email = normalizeEmail(input.email);
  try {
    db.prepare(
      "INSERT INTO accounts (id, email, password_hash, is_admin) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), email, hashPassword(input.password), input.isAdmin ? 1 : 0);
  } catch (err) {
    // 唯一约束冲突 → 可识别的重复错误；其余原样上抛
    if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateAccountError(email);
    }
    throw err;
  }
  return findAccountByEmail(db, email)!;
}

export function findAccountByEmail(db: Db, email: string): Account | undefined {
  const row = db
    .prepare("SELECT * FROM accounts WHERE email = ?")
    .get(normalizeEmail(email)) as AccountRow | undefined;
  return row ? toAccount(row) : undefined;
}

// 防时序探测（ADR-0003）：未知邮箱也对固定哑哈希跑一次 bcrypt 比对，
// 让"查无此邮箱"与"密码不对"两条路径都恰好做一次 bcrypt，响应耗时不可区分，
// 公网探测者无法靠响应快慢推断邮箱是否已注册。惰性生成，避免不涉及登录的
// 模块加载（多数测试文件）也吃一次哈希开销。
let dummyHash: string | null = null;
function dummyHashForProbe(): string {
  if (!dummyHash) dummyHash = hashPassword("timing-probe-deflection");
  return dummyHash;
}

/** 登录校验：邮箱未知或密码不对一律返回 undefined（不区分，防探测账号是否存在） */
export function authenticate(
  db: Db,
  email: string,
  password: string
): Account | undefined {
  const row = db
    .prepare("SELECT * FROM accounts WHERE email = ?")
    .get(normalizeEmail(email)) as AccountRow | undefined;
  if (!row) {
    // 查无此邮箱：对哑哈希补一次等价开销的比对再返回（见上方注释）
    verifyPassword(password, dummyHashForProbe());
    return undefined;
  }
  if (!verifyPassword(password, row.password_hash)) return undefined;
  return toAccount(row);
}

/** 02 号票的管理员重置密码复用 */
export function updatePassword(
  db: Db,
  accountId: string,
  newPassword: string
): void {
  db.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(
    hashPassword(newPassword),
    accountId
  );
}
