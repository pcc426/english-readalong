// 媒体鉴权接口（票 05，spec：所有视频统一经鉴权接口提供，不静态公开）。
// /api/media/<accountId>/<file>：登录后仅放行自己账号目录下的视频；
// 未登录 401，他人/路径非法/文件缺失一律 404（不暴露存在性）。
// /api/media/shipped/<file>：随代码部署的标准内容视频（content/media），
// 仅放行被公开标准内容包 video 字段引用的文件，任何登录账号可播。
// 例外（票 12）：已被公开标准内容引用的上传视频（data/content/standard/
// 里包的 video 字段）对任何登录账号放行——标准内容全账号可见可练，
// 视频必须能跟着播；未被引用的文件（含他人的自定义视频）照旧 404。
// 封面（票 01）：jpg 与视频同规则——本人目录放行；上传封面被公开标准包
// poster 字段引用时全账号放行；随代码封面（content/media/posters/）
// 与随代码视频同校验（被标准包 poster 字段引用才放行）。
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { errorResponse } from "@/lib/http";
import {
  parseMediaRelPath,
  POSTER_CONTENT_TYPES,
  videoAbsPath,
  VIDEO_CONTENT_TYPES,
} from "@/lib/drafts/storage";
import { listContent } from "@/lib/content/loader";
import {
  isShippedVideoName,
  shippedMediaAbsPath,
  shippedPosterAbsPath,
} from "@/lib/content/shipped-media";

export const dynamic = "force-dynamic";

/** 该相对路径是否被某个公开标准内容包引用（仅标准视图，不含任何自定义包） */
function isStandardPackVideo(relPath: string): boolean {
  return listContent().some((pack) => pack.video === relPath);
}

/** 被公开标准内容包 poster 字段引用的上传封面（票 01，与视频引用同规则） */
function isStandardPackPoster(relPath: string): boolean {
  return listContent().some((pack) => pack.poster === relPath);
}

/** 随代码标准内容包是否引用了该视频文件名（上传类包引用的是账号目录路径，不会命中） */
function isShippedPackVideo(name: string): boolean {
  return listContent().some((pack) => pack.video === name);
}

/** 随代码标准内容包是否引用了该封面文件名（poster 与 video 同形，裸文件名） */
function isShippedPackPoster(name: string): boolean {
  return listContent().some((pack) => pack.poster === name);
}

function contentTypeFor(name: string): string {
  const ext = path.extname(name).slice(1).toLowerCase();
  return VIDEO_CONTENT_TYPES[ext] ?? POSTER_CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;
  const { path: segments } = await ctx.params;

  let abs: string;
  if (segments?.[0] === "shipped") {
    const name = segments[1];
    if (segments.length !== 2 || !isShippedVideoName(name)) {
      return notFound();
    }
    const isPoster = path.extname(name).slice(1).toLowerCase() in POSTER_CONTENT_TYPES;
    // 封面只认 content/media/posters/ 子目录；引用校验与视频同规则
    if (isPoster ? !isShippedPackPoster(name) : !isShippedPackVideo(name)) {
      return notFound();
    }
    abs = isPoster ? shippedPosterAbsPath(name) : shippedMediaAbsPath(name);
  } else {
    const relPath = parseMediaRelPath(segments ?? []);
    if (
      !relPath ||
      (!relPath.startsWith(`${auth.account.id}/`) &&
        !isStandardPackVideo(relPath) &&
        !isStandardPackPoster(relPath))
    ) {
      return notFound();
    }
    abs = videoAbsPath(relPath);
  }
  let size: number;
  try {
    size = statSync(abs).size;
  } catch {
    return notFound();
  }

  const headers = new Headers({
    // ext→mime 单一来源在 storage.ts（与上传格式校验同一处维护）
    "content-type": contentTypeFor(path.basename(abs)),
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
