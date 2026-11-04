// 标准内容可见性（v0.3.6）：全局开关与唯一判定入口。
// 监管/版权原因：标准内容素材可能来自其他创作者，默认只对管理员可见；
// 版权问题解决后由管理员在站内打开，恢复所有账号可见。
import { dbPath, openDb } from "@/lib/db";
import type { Account } from "@/lib/auth/accounts";

const STANDARD_CONTENT_PUBLIC_KEY = "standard_content_public";

/** 开关是否开启；键缺失（新库/旧库/异常库）一律视为关闭。 */
export function isStandardContentPublic(db: ReturnType<typeof openDb>): boolean {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(STANDARD_CONTENT_PUBLIC_KEY) as { value: string } | undefined;
  return row?.value === "1";
}

/** 管理员设置开关；只存 "1"/"0"，读取端不解析其他值。 */
export function setStandardContentPublic(
  db: ReturnType<typeof openDb>,
  enabled: boolean
): void {
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(STANDARD_CONTENT_PUBLIC_KEY, enabled ? "1" : "0");
}

/** 账号能否看标准内容：管理员恒可；其余账号取决于全局开关。 */
export function canViewStandardContent(
  db: ReturnType<typeof openDb>,
  account: Pick<Account, "isAdmin">
): boolean {
  return account.isAdmin || isStandardContentPublic(db);
}

/** 路由/页面便捷入口：自带数据库连接，避免每个调用点重复开库。 */
export function standardContentVisibleForAccount(
  account: Pick<Account, "isAdmin">
): boolean {
  const db = openDb(dbPath());
  try {
    return canViewStandardContent(db, account);
  } finally {
    db.close();
  }
}
