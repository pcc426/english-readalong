import { createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

/** 上传上限（spec）：≤200MB、≤5 分钟，mp4/m4v/mov */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_DURATION_MS = 5 * 60 * 1000;

/** 扩展名 → 允许的 content-type（格式校验按扩展名 + content-type 双查） */
const SUPPORTED_VIDEO_TYPES: Record<string, readonly string[]> = {
  mp4: ["video/mp4"],
  m4v: ["video/x-m4v", "video/mp4"],
  mov: ["video/quicktime"],
};

export function supportedExtensions(): string[] {
  return Object.keys(SUPPORTED_VIDEO_TYPES);
}

export type UploadFormatCheck =
  | { ok: true; ext: string }
  | { ok: false; reason: "extension" | "contentType" };

/**
 * 格式双查：扩展名必须受支持，且 content-type 与扩展名匹配
 * （浏览器可能带参数，如 "video/mp4; codecs=..."，取分号前的主类型）。
 */
export function checkUploadFormat(
  fileName: string,
  contentType: string | null
): UploadFormatCheck {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const allowed = SUPPORTED_VIDEO_TYPES[ext];
  if (!allowed) return { ok: false, reason: "extension" };
  const mainType = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (!allowed.includes(mainType)) return { ok: false, reason: "contentType" };
  return { ok: true, ext };
}

/** 上传视频根目录（运行时数据目录，部署不覆盖）：UPLOADS_DIR 覆盖，默认 data/uploads */
export function uploadsRoot(): string {
  return (
    process.env.UPLOADS_DIR || path.join(process.cwd(), "data", "uploads")
  );
}

/** 草稿存的视频引用：<accountId>/<uuid>.<ext>（相对 uploads 根，恒为正斜杠） */
export function videoRelPath(accountId: string, fileName: string): string {
  return `${accountId}/${fileName}`;
}

/** 视频在磁盘上的绝对路径（仅用于服务端读写，不出现在任何 URL 里） */
export function videoAbsPath(relPath: string): string {
  return path.join(uploadsRoot(), relPath);
}

/** 流式写盘：File 流直接落到 uploads/<accountId>/，不整块进 Buffer */
export async function saveUploadVideo(
  relPath: string,
  file: File
): Promise<void> {
  const abs = videoAbsPath(relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  const webStream = file.stream() as unknown as NodeWebReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(webStream), createWriteStream(abs));
}

/** 删除视频文件（一致性清理的一半）；文件已不在（清理过/写盘失败）不算错 */
export function deleteUploadVideo(relPath: string): void {
  rmSync(videoAbsPath(relPath), { force: true });
}

export function uploadVideoExists(relPath: string): boolean {
  try {
    statSync(videoAbsPath(relPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * 媒体接口的路径校验：只接受 <accountId>/<fileName> 两段，每段只允许
 * 字母数字与 . _ -（首字符必须是字母数字，".."、"/"、"\" 天然被拒）。
 * 合法返回相对路径，否则 null。
 */
export function parseMediaRelPath(segments: readonly string[]): string | null {
  if (segments.length !== 2) return null;
  const [accountId, fileName] = segments;
  const safeSegment = (s: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s);
  if (!accountId || !fileName || !safeSegment(accountId) || !safeSegment(fileName)) {
    return null;
  }
  return `${accountId}/${fileName}`;
}
