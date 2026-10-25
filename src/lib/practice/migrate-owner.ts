// 练习记录归属迁移（票 10 一次性）：V0.1 的记录 owner 恒为 NULL（ADR-0002 预留列），
// 公网化后统一归到管理员账号名下（spec：既有 NULL 归属记录一次性迁移到管理员）。
// 核心逻辑与 CLI 分离：本模块可测，scripts/migrate-practice-owner.ts 只做入口。
import type { Db } from "../db";
import { toAccount, type Account } from "../auth/accounts";

/** 库里没有任何管理员账号：无法确定归属目标，宁可报错也不猜 */
export class NoAdminAccountError extends Error {
  constructor() {
    super("库中没有 is_admin=1 的账号，请先用 scripts/create-admin.ts 创建管理员");
    this.name = "NoAdminAccountError";
  }
}

/** 首个管理员：最早创建（created_at 同秒内按插入序，bootstrap 即 create-admin 的产物） */
export function firstAdminAccount(db: Db): Account {
  const row = db
    .prepare(
      `SELECT id, email, is_admin, created_at FROM accounts
       WHERE is_admin = 1 ORDER BY created_at, rowid LIMIT 1`
    )
    .get() as Parameters<typeof toAccount>[0] | undefined;
  if (!row) throw new NoAdminAccountError();
  return toAccount(row);
}

/**
 * 把 owner 为 NULL 的练习记录一次性归到首个管理员名下，返回迁移条数与管理员。
 * 只动 owner IS NULL 的行（已有归属不覆盖）；重复执行幂等（二次返回 0）。
 */
export function migrateNullOwnersToAdmin(db: Db): {
  admin: Account;
  migrated: number;
} {
  const admin = firstAdminAccount(db);
  const result = db
    .prepare("UPDATE practice_attempts SET owner = ? WHERE owner IS NULL")
    .run(admin.id);
  return { admin, migrated: result.changes };
}
