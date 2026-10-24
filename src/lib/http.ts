// HTTP 层共享小件：API 路由统一的错误 JSON 形状（{ error: { code, message } }）。
// 放在 auth 之外——这不是鉴权职责：login（鉴权之前）与管理/业务路由都复用。
import { NextResponse } from "next/server";

/** 响应体形状有路由测试按字段锁定，改动前先看对应 route.test.ts */
export function errorResponse(
  status: number,
  code: string,
  message: string
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
