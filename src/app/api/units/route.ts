import { NextResponse } from "next/server";
import { ownedContentOverview } from "@/lib/owned-content";
import { requireAccount } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  // 归属接线（票 10）：标准内容（全部）+ 本账号自定义内容，统计按账号隔离
  return NextResponse.json({ units: ownedContentOverview(auth.account.id) });
}
