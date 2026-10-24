// 登录限速（ADR-0003）：按邮箱记连续失败次数，达到阈值临时锁定。
// 内存态：单进程部署下进程内 Map 即可，重启清零可接受——
// 限速是挡在线爆破的第一道闸，防火墙白名单降级后仍是辅助防线。
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

export { MAX_LOGIN_FAILURES, LOGIN_LOCK_MS };

interface Attempt {
  count: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, Attempt>();

function keyOf(email: string): string {
  return email.trim().toLowerCase();
}

/** 记一次登录失败；锁定期间不累计、不延长 */
export function recordLoginFailure(email: string): void {
  const key = keyOf(email);
  const now = Date.now();
  const prev = attempts.get(key);
  if (prev?.lockedUntil && prev.lockedUntil > now) return; // 已锁定，不动
  // 上一次锁定已过期 → 从零重新计数
  const count = prev?.lockedUntil ? 1 : (prev?.count ?? 0) + 1;
  const lockedUntil = count >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : null;
  attempts.set(key, { count, lockedUntil });
}

/** 登录成功（或测试清理）后清除计数 */
export function clearLoginFailures(email: string): void {
  attempts.delete(keyOf(email));
}

/** 当前剩余锁定毫秒数；未锁定为 0 */
export function getLoginLockRemainingMs(email: string): number {
  const rec = attempts.get(keyOf(email));
  if (!rec?.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}
