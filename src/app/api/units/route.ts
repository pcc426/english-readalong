import { NextResponse } from "next/server";
import { ownedContentOverview } from "@/lib/owned-content";
import { requireAccount } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  // 归属接线（票 10）：完成度按账号隔离；V0.2 整改：列表仅标准内容——
  // 「教材内容」页=平台公开的沪教版标准内容（spec 界面布局），
  // 本账号自定义内容走「自定义内容」页（/api/drafts）
  return NextResponse.json({
    units: ownedContentOverview(auth.account.id, { onlyStandard: true }),
  });
}
