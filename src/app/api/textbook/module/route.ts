// 教材原文查询（票 12）：校对页预填用。登录即可读（教材原文对全部账号可见，
// 非管理员也可对照查看）；数据来自构建期一次性提取的 content/textbook 产物，
// 运行时不解析 PDF（票面验收项）。未命中的单元/栏目一律 404。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";
import { getTextbookModule } from "@/lib/textbook/textbook";
import { standardContentVisibleForAccount } from "@/lib/settings/content-visibility";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  // v0.3.6：关闭态下教材内容整体不对家庭账号开放，教材原文同样拒绝
  if (!standardContentVisibleForAccount(auth.account)) {
    return errorResponse(
      403,
      "STANDARD_CONTENT_DISABLED",
      "教材内容暂时未对家庭账号开放"
    );
  }

  const params = new URL(req.url).searchParams;
  const unitId = params.get("unitId")?.trim() ?? "";
  const moduleKind = params.get("moduleKind")?.trim() ?? "";
  if (!unitId || !moduleKind) {
    return errorResponse(400, "INVALID_PARAMS", "缺少 unitId 或 moduleKind 参数");
  }

  const module = getTextbookModule(unitId, moduleKind);
  if (!module) {
    return errorResponse(404, "UNKNOWN_MODULE", "教材单元或模块不存在");
  }
  return NextResponse.json(module);
}
