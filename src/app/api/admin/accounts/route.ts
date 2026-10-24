// 管理员建家长账号（票 02，ADR-0003）：先过登录守卫再查 is_admin，
// 邮箱重复映射为 409；账号创建复用 01 号票的 auth 原语。
import { NextResponse } from "next/server";
import { z } from "zod";
import { openDb } from "@/lib/db";
import { dbPath } from "@/lib/units";
import { createAccount, DuplicateAccountError } from "@/lib/auth/accounts";
import { requireAccount } from "@/lib/auth/guard";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "@/lib/admin/validation";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string(),
  initialPassword: z.string(),
});

export async function POST(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  if (!auth.account.isAdmin) {
    return errorResponse(403, "FORBIDDEN", "仅管理员可执行此操作");
  }

  let input: { email: string; initialPassword: string };
  try {
    input = createSchema.parse(await req.json());
  } catch {
    return errorResponse(400, "BAD_REQUEST", "请求格式不对");
  }
  if (!isValidEmail(input.email)) {
    return errorResponse(400, "INVALID_EMAIL", "邮箱格式不对");
  }
  if (input.initialPassword.length < MIN_PASSWORD_LENGTH) {
    return errorResponse(
      400,
      "WEAK_PASSWORD",
      `密码至少 ${MIN_PASSWORD_LENGTH} 位`
    );
  }

  const db = openDb(dbPath());
  try {
    const account = createAccount(db, {
      email: input.email,
      password: input.initialPassword,
    });
    return NextResponse.json(
      { account: { id: account.id, email: account.email } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof DuplicateAccountError) {
      return errorResponse(409, "DUPLICATE_EMAIL", err.message);
    }
    throw err;
  } finally {
    db.close();
  }
}
