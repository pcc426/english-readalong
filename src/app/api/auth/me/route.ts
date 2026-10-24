// 当前登录账号（ADR-0003）：顶部导航与页面初始化用。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id, email, isAdmin } = auth.account;
  return NextResponse.json({ account: { id, email, isAdmin } });
}
