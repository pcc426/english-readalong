// 管理员重置家长密码（票 02，ADR-0003）：无邮件找回，重置即改哈希；
// 未知邮箱 404（对管理员如实反馈，与登录接口的防探测口径不同——调用方是管理员）。
import { NextResponse } from "next/server";
import { z } from "zod";
import { openDb } from "@/lib/db";
import { dbPath } from "@/lib/units";
import { findAccountByEmail, updatePassword } from "@/lib/auth/accounts";
import { requireAccount } from "@/lib/auth/guard";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/admin/validation";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  email: z.string(),
  newPassword: z.string(),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  if (!auth.account.isAdmin) {
    return errorResponse(403, "FORBIDDEN", "仅管理员可执行此操作");
  }

  let input: { email: string; newPassword: string };
  try {
    input = resetSchema.parse(await req.json());
  } catch {
    return errorResponse(400, "BAD_REQUEST", "请求格式不对");
  }
  if (!isValidEmail(input.email)) {
    return errorResponse(400, "INVALID_EMAIL", "邮箱格式不对");
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      "WEAK_PASSWORD",
      `密码至少 ${MIN_PASSWORD_LENGTH} 位`
    );
  }

  const db = openDb(dbPath());
  try {
    const account = findAccountByEmail(db, input.email);
    if (!account) {
      return errorResponse(404, "ACCOUNT_NOT_FOUND", "该邮箱不存在");
    }
    updatePassword(db, account.id, input.newPassword);
    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}
