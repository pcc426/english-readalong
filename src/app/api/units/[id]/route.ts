import { NextResponse } from "next/server";
import { getUnitDetail } from "@/lib/units";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
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
