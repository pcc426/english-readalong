// 退出（ADR-0003）：删行即吊销 + 清 cookie；未登录也 200（幂等）。
import { NextResponse } from "next/server";
import { openDb } from "@/lib/db";
import { dbPath } from "@/lib/units";
import { deleteSession } from "@/lib/auth/sessions";
import { clearSessionCookie, readSessionId } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  const sessionId = readSessionId(req);
  if (sessionId) {
    const db = openDb(dbPath());
    try {
      deleteSession(db, sessionId);
    } finally {
      db.close();
    }
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
