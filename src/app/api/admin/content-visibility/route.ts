// 教材内容可见性开关（v0.3.6）：管理员读写全局开关。
// 关闭 = 标准内容仅管理员可见（默认）；开启 = 恢复所有账号可见。
import { NextResponse } from "next/server";
import { z } from "zod";
import { dbPath, openDb } from "@/lib/db";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";
import {
  isStandardContentPublic,
  setStandardContentPublic,
} from "@/lib/settings/content-visibility";

export const dynamic = "force-dynamic";

const putSchema = z.object({ standardContentPublic: z.boolean() });

function forbidden(): NextResponse {
  return errorResponse(403, "FORBIDDEN", "仅管理员可执行此操作");
}

export function GET(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  if (!auth.account.isAdmin) return forbidden();

  const db = openDb(dbPath());
  try {
    return NextResponse.json({
      standardContentPublic: isStandardContentPublic(db),
    });
  } finally {
    db.close();
  }
}

export async function PUT(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  if (!auth.account.isAdmin) return forbidden();

  let input: { standardContentPublic: boolean };
  try {
    input = putSchema.parse(await req.json());
  } catch {
    return errorResponse(400, "BAD_REQUEST", "请求格式不对");
  }

  const db = openDb(dbPath());
  try {
    setStandardContentPublic(db, input.standardContentPublic);
    return NextResponse.json({
      standardContentPublic: isStandardContentPublic(db),
    });
  } finally {
    db.close();
  }
}
