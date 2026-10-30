import { NextResponse } from "next/server";
import { ownedContentOverview } from "@/lib/owned-content";
import { registeredUnits } from "@/lib/textbook/textbook";
import { requireAccount } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  // 归属接线（票 10）：完成度按账号隔离；V0.2 整改：列表仅标准内容——
  // 「教材内容」页=平台公开的沪教版标准内容（spec 界面布局），
  // 本账号自定义内容走「自定义内容」页（/api/drafts）
  // textbookUnits（票 05）：注册教材全部单元（序号＋英文标题），首页单元下拉用；
  // 服务端拼好下发，客户端不 import 教材注册表（同 enum-subtitle 约定）
  return NextResponse.json({
    units: ownedContentOverview(auth.account.id, { onlyStandard: true }),
    textbookUnits: registeredUnits(),
  });
}
