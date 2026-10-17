import { NextResponse } from "next/server";
import { getUnitsOverview } from "@/lib/units";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ units: getUnitsOverview() });
}
