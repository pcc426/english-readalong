// 测试共享工具：临时 SQLite 环境与会话 cookie 构造，供各 route/lib 测试复用。
// vitest 按测试文件隔离模块状态，本模块的 cleanups 队列与 afterEach
// 只作用于导入它的那个测试文件，不会跨文件串扰。
import { afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb } from "@/lib/db";
import { createAccount, findAccountByEmail } from "@/lib/auth/accounts";
import { createSession } from "@/lib/auth/sessions";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups.length = 0;
  delete process.env.DB_PATH;
  cookieCache = null;
});

/** 建临时目录 + DB_PATH 环境的空库；测试结束自动关库并删目录 */
export function setupDb(prefix = "ra-test"): ReturnType<typeof openDb> {
  const dbDir = mkdtempSync(path.join(tmpdir(), `${prefix}-`));
  process.env.DB_PATH = path.join(dbDir, "readalong.db");
  const db = openDb(process.env.DB_PATH);
  cleanups.push(() => {
    if (db.open) db.close();
    rmSync(dbDir, { recursive: true, force: true });
  });
  return db;
}

/** 草稿全部句子置 confirmed（V0.2.1 发布门槛）：走真实定稿链路的测试种子用 */
export function confirmDraftSentences(db: ReturnType<typeof openDb>, draftId: string): void {
  db.prepare(
    `UPDATE draft_sentences SET proofread = 'confirmed' WHERE draft_id = ?`
  ).run(draftId);
}

let cookieCache: { dbPath: string; email: string; cookie: string } | null = null;

/** 当前库中找该邮箱的账号，没有则以 secret123 密码创建（邀请制账号原语），
 * 返回其会话 cookie（session=<id>）；同一库同一邮箱复用同一会话 */
export function sessionCookieFor(email: string, isAdmin = false): string {
  const dbPath = process.env.DB_PATH!;
  if (cookieCache?.dbPath === dbPath && cookieCache.email === email) {
    return cookieCache.cookie;
  }
  const db = openDb(dbPath);
  const account =
    findAccountByEmail(db, email) ??
    createAccount(db, { email, password: "secret123", isAdmin });
  const cookie = `session=${createSession(db, account.id)}`;
  db.close();
  cookieCache = { dbPath, email, cookie };
  return cookie;
}

/** 建一个登录家长并返回带会话 cookie 的请求（受 ADR-0003 保护的接口用） */
export function authedGet(url = "http://x"): Request {
  return new Request(url, {
    headers: { cookie: sessionCookieFor("parent@test.com") },
  });
}
