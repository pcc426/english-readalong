import { NextResponse } from "next/server";
import { getContentOverview } from "@/lib/content/view";
import { requireAccount } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ units: getContentOverview() });
}
