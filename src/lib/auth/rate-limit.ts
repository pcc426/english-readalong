// 登录限速（ADR-0003）：按邮箱与来源 IP 各记一份连续失败计数，
// 任一维度达到阈值即临时锁定——同邮箱爆破、同 IP 撞库都挡。
// 内存态：单进程部署下进程内 Map 即可，重启清零可接受——
// 限速是挡在线爆破的第一道闸，防火墙白名单降级后仍是辅助防线。
import { normalizeEmail } from "./accounts";

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

export { MAX_LOGIN_FAILURES, LOGIN_LOCK_MS };

interface Attempt {
  count: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, Attempt>();

const emailKeyOf = (email: string) => `email:${normalizeEmail(email)}`;
const ipKeyOf = (ip: string) => `ip:${ip}`;

/** 记一次登录失败；锁定期间不累计、不延长（对邮箱与 IP 两个维度分别记） */
export function recordLoginFailure(email: string, ip: string): void {
  const now = Date.now();
  bump(emailKeyOf(email), now);
  bump(ipKeyOf(ip), now);
}

/** 登录成功（或测试清理）后清除两份计数 */
export function clearLoginFailures(email: string, ip: string): void {
  attempts.delete(emailKeyOf(email));
  attempts.delete(ipKeyOf(ip));
}

/** 当前剩余锁定毫秒数（两维度取较大者）；未锁定为 0 */
export function getLoginLockRemainingMs(email: string, ip: string): number {
  return Math.max(
    remainingOf(attempts.get(emailKeyOf(email))),
    remainingOf(attempts.get(ipKeyOf(ip)))
  );
}

function bump(key: string, now: number): void {
  const prev = attempts.get(key);
  if (prev?.lockedUntil && prev.lockedUntil > now) return; // 已锁定，不动
  // 上一次锁定已过期 → 从零重新计数
  const count = prev?.lockedUntil ? 1 : (prev?.count ?? 0) + 1;
  const lockedUntil = count >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : null;
  attempts.set(key, { count, lockedUntil });
}

function remainingOf(rec: Attempt | undefined): number {
  if (!rec?.lockedUntil) return 0;
  return Math.max(0, rec.lockedUntil - Date.now());
}
