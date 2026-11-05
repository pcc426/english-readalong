import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { growthSnapshot } from "@/lib/domain/growth";
import {
  beijingMonthOf,
  beijingToday,
  isValidMonth,
  monthRange,
} from "@/lib/domain/beijing-date";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;

  const current = beijingMonthOf(beijingToday());
  const raw = new URL(req.url).searchParams.get("month") ?? current;
  if (!isValidMonth(raw) || !monthRange(current, 11).includes(raw)) {
    return errorResponse(400, "INVALID_MONTH", "只能查看最近 12 个月");
  }

  const db = openDb(dbPath());
  try {
    return NextResponse.json(growthSnapshot(db, auth.account.id, raw));
  } finally {
    db.close();
  }
}
