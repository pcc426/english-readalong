// 媒体鉴权接口（票 05，spec：所有视频统一经鉴权接口提供，不静态公开）。
// /api/media/<accountId>/<file>：登录后仅放行自己账号目录下的视频；
// 未登录 401，他人/路径非法/文件缺失一律 404（不暴露存在性）。
// 例外（票 12）：已被公开标准内容引用的视频（管理员制作，data/content/standard/
// 里包的 video 字段）对任何登录账号放行——标准内容全账号可见可练，
// 视频必须能跟着播；引用关系来自内容缝，未被引用的文件（含他人的自定义视频）照旧 404。
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";
import { parseMediaRelPath, videoAbsPath } from "@/lib/drafts/storage";
import { listContent } from "@/lib/content/loader";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
};

/** 该相对路径是否被某个公开标准内容包引用（仅标准视图，不含任何自定义包） */
function isStandardPackVideo(relPath: string): boolean {
  return listContent().some((pack) => pack.video === relPath);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { path: segments } = await ctx.params;
  const relPath = parseMediaRelPath(segments ?? []);
  if (
    !relPath ||
    (!relPath.startsWith(`${auth.account.id}/`) && !isStandardPackVideo(relPath))
  ) {
    return notFound();
  }

  const abs = videoAbsPath(relPath);
  let size: number;
  try {
    size = statSync(abs).size;
  } catch {
    return notFound();
  }

  const ext = path.extname(abs).slice(1).toLowerCase();
  const headers = new Headers({
    "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    "accept-ranges": "bytes",
  });

  // iPad Safari 的 <video> 依赖 Range 请求：单段 range 回 206 切片
  const range = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get("range") ?? "").trim());
  if (range) {
    const start = range[1] ? Number.parseInt(range[1], 10) : 0;
    const end = range[2]
      ? Math.min(Number.parseInt(range[2], 10), size - 1)
      : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
    return new NextResponse(fileStream(abs, start, end), {
      status: 206,
      headers,
    });
  }

  headers.set("content-length", String(size));
  return new NextResponse(fileStream(abs, 0, size - 1), { status: 200, headers });
}

function notFound(): NextResponse {
  return errorResponse(404, "MEDIA_NOT_FOUND", "视频不存在");
}

function fileStream(abs: string, start: number, end: number): ReadableStream {
  return Readable.toWeb(
    createReadStream(abs, { start, end })
  ) as unknown as ReadableStream;
}
