// API 守卫（ADR-0003）：受保护路由统一从这里拿当前登录账号，
// 未登录/会话失效一律 401 JSON；会话 cookie 的设置与清除也收敛在这里。
import { NextResponse } from "next/server";
import { openDb } from "@/lib/db";
import { dbPath } from "@/lib/units";
import { getAccountBySession, SESSION_COOKIE, SESSION_TTL_MS } from "./sessions";
import type { Account } from "./accounts";

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; response: NextResponse };

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: { code: "UNAUTHORIZED", message: "未登录" } },
    { status: 401 }
  );
}

/** 从请求头解析会话 id（cookie 里可能混着其他键） */
export function readSessionId(req: Request): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

/** 客户端 IP（登录限速的 IP 维度用）：生产在 Caddy 后，取 x-forwarded-for 首段；
 * 缺失回退 "unknown"（dev 直连场景共用一个计数桶，可接受）。 */
export function clientIp(req: Request): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/** 受保护 API 的统一入口：未登录返回 401 响应（route 直接透传），已登录带账号 */
export function requireAccount(req: Request): AuthResult {
  const sessionId = readSessionId(req);
  if (!sessionId) return { ok: false, response: unauthorized() };
  const db = openDb(dbPath());
  try {
    const account = getAccountBySession(db, sessionId);
    if (!account) return { ok: false, response: unauthorized() };
    return { ok: true, account };
  } finally {
    db.close();
  }
}

// Secure 恒开：生产走 Caddy HTTPS（iPad 麦克风本来就要求），dev 的 localhost
// 是安全上下文可正常携带。若未来出现纯 http 的非 localhost 环境，登录会显式
// 失效（浏览器拒收 Secure cookie）——比静默关闭 Secure 更安全（ADR-0003）。
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
} as const;

export function setSessionCookie(res: NextResponse, sessionId: string): void {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    ...COOKIE_OPTIONS,
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}
