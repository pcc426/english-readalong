// 服务端会话（ADR-0003）：SQLite 存随机不透明 id，退出即删行吊销。
// 不用签名 cookie/JWT——单进程 + SQLite 部署下，吊销能力与简单性优于无状态方案。
import { randomBytes } from "node:crypto";
import type { Db } from "@/lib/db";
import type { Account } from "./accounts";

/** 浏览器侧承载会话 id 的 cookie 名 */
export const SESSION_COOKIE = "session";

/** 会话有效期 30 天 */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionAccountRow {
  id: string;
  email: string;
  is_admin: number;
  created_at: string;
}

/** 创建会话：返回 256-bit 随机不透明 id（cookie 安全字符集） */
export function createSession(db: Db, accountId: string): string {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO sessions (id, account_id, expires_at) VALUES (?, ?, ?)"
  ).run(id, accountId, expiresAt);
  return id;
}

/** 按会话 id 取账号；会话不存在或已过期返回 undefined（过期行顺手清掉） */
export function getAccountBySession(db: Db, sessionId: string): Account | undefined {
  const row = db
    .prepare(
      `SELECT a.id, a.email, a.is_admin, a.created_at, s.expires_at
       FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.id = ?`
    )
    .get(sessionId) as (SessionAccountRow & { expires_at: string }) | undefined;
  if (!row) return undefined;
  if (Date.parse(row.expires_at) <= Date.now()) {
    deleteSession(db, sessionId);
    return undefined;
  }
  return {
    id: row.id,
    email: row.email,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

/** 退出/吊销：删行即失效 */
export function deleteSession(db: Db, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}
