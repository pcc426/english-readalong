import { NextResponse } from "next/server";
import { ownedContentOverview } from "@/lib/owned-content";
import { registeredUnits } from "@/lib/textbook/textbook";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";
import { standardContentVisibleForAccount } from "@/lib/settings/content-visibility";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  // v0.3.6 可见性开关：关闭时非管理员拿不到教材列表（管理员不受影响）
  if (!standardContentVisibleForAccount(auth.account)) {
    return errorResponse(
      403,
      "STANDARD_CONTENT_DISABLED",
      "教材内容暂时未对家庭账号开放"
    );
  }
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
