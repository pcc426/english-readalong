// 登录（ADR-0003）：邮箱 + 密码换会话 cookie；连续失败按邮箱限速锁定。
import { NextResponse } from "next/server";
import { z } from "zod";
import { openDb } from "@/lib/db";
import { dbPath } from "@/lib/units";
import { authenticate } from "@/lib/auth/accounts";
import {
  getLoginLockRemainingMs,
  recordLoginFailure,
  clearLoginFailures,
} from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/sessions";
import { setSessionCookie } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  let input: { email: string; password: string };
  try {
    input = loginSchema.parse(await req.json());
  } catch {
    return errorResponse(400, "BAD_REQUEST", "请求格式不对");
  }
  const email = input.email.trim();

  const lockMs = getLoginLockRemainingMs(email);
  if (lockMs > 0) {
    return errorResponse(
      429,
      "RATE_LIMITED",
      `失败次数过多，请约 ${Math.ceil(lockMs / 60000)} 分钟后再试`
    );
  }

  const db = openDb(dbPath());
  try {
    const account = authenticate(db, email, input.password);
    if (!account) {
      recordLoginFailure(email);
      return errorResponse(401, "INVALID_CREDENTIALS", "邮箱或密码不对");
    }
    clearLoginFailures(email);
    const res = NextResponse.json({
      account: { id: account.id, email: account.email, isAdmin: account.isAdmin },
    });
    setSessionCookie(res, createSession(db, account.id));
    return res;
  } finally {
    db.close();
  }
}
