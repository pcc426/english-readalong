import { NextResponse } from "next/server";
import { getUnitDetail } from "@/lib/units";
import { requireAccount } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const unit = getUnitDetail(id);
  if (!unit) {
    return NextResponse.json(
      { error: { code: "UNIT_NOT_FOUND", message: "单元不存在" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ unit });
}
