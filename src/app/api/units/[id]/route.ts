import { NextResponse } from "next/server";
import { ownedContentDetail } from "@/lib/owned-content";
import { requireAccount } from "@/lib/auth/guard";
import { standardContentVisibleForAccount } from "@/lib/settings/content-visibility";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  // 归属接线（票 10）：按当前账号取内容与最好成绩（自定义内容仅归属账号可见）
  // v0.3.6：关闭态下标准内容对非管理员按不存在处理（不暴露 id 是否存在）
  const unit = ownedContentDetail(id, auth.account.id, {
    allowStandard: standardContentVisibleForAccount(auth.account),
  });
  if (!unit) {
    return NextResponse.json(
      { error: { code: "UNIT_NOT_FOUND", message: "单元不存在" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ unit });
}
