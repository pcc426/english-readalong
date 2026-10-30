import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import { uploadsRoot } from "./storage";
import { shippedMediaRoot } from "@/lib/content/shipped-media";
import {
  getPosterExtractor,
  posterRelPathFor,
  shippedPosterNameFor,
  type PosterExtractor,
} from "./poster";

/**
 * 一次性补抽编排（票 01）：对全部 shipped 视频（content/media/*.mp4）与上传视频
 * （uploads/<accountId>/*.mp4）补抽封面，产物落各自既定位置。
 * 幂等：封面已存在且比视频新则跳过（视频没换过）。失败逐条计 failed，不中断整轮。
 */

export interface PosterBackfillResult {
  /** 内容包 video 字段形态的引用（随代码 = 文件名；上传 = <accountId>/<file>） */
  video: string;
  /** 内容包 poster 字段形态的引用（票 03 包回填直接可用） */
  poster: string;
  status: "created" | "skipped" | "failed";
}

export interface PosterBackfillOptions {
  /** 缺省用全局缝 getPosterExtractor()；脚本/测试可注入 */
  extract?: PosterExtractor;
}

/**
 * 幂等判定：封面存在（mtime 已知）且比视频新 → 跳过。
 * 相等也算不新鲜：同刻 mtime 分不出先后，重抽无害、跳过有险。
 */
export function isPosterFresh(
  videoMtimeMs: number,
  posterMtimeMs: number | null
): boolean {
  return posterMtimeMs != null && posterMtimeMs > videoMtimeMs;
}

function mtimeMsOf(abs: string): number | null {
  try {
    return statSync(abs).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * shipped 视频补抽：content/media/*.mp4 → content/media/posters/<同名>.jpg。
 * 结果映射的 video/poster 都是随代码内容包的字段形态（裸文件名）。
 */
export async function backfillShippedPosters(
  options: PosterBackfillOptions = {}
): Promise<PosterBackfillResult[]> {
  const extract = options.extract ?? getPosterExtractor();
  const mediaRoot = shippedMediaRoot();
  const postersDir = path.join(mediaRoot, "posters");
  let videoNames: string[];
  try {
    videoNames = readdirSync(mediaRoot).filter((f) =>
      f.toLowerCase().endsWith(".mp4")
    );
  } catch {
    return [];
  }
  if (videoNames.length > 0) mkdirSync(postersDir, { recursive: true });
  const results: PosterBackfillResult[] = [];
  for (const name of videoNames) {
    const poster = shippedPosterNameFor(name);
    const videoAbs = path.join(mediaRoot, name);
    const posterAbs = path.join(postersDir, poster);
    const videoMtime = mtimeMsOf(videoAbs);
    if (videoMtime != null && isPosterFresh(videoMtime, mtimeMsOf(posterAbs))) {
      results.push({ video: name, poster, status: "skipped" });
      continue;
    }
    const ok = await extract(videoAbs, posterAbs).catch(() => false);
    results.push({ video: name, poster, status: ok ? "created" : "failed" });
  }
  return results;
}

export interface UploadBackfillOptions extends PosterBackfillOptions {
  /** 传入时把补抽结果回填草稿行：video_path 相符且 poster_path 为 NULL 才写（幂等） */
  db?: Db;
}

/**
 * 上传视频补抽：uploads 根下一层账号目录里的 *.mp4 → 同目录 <同名>.poster.jpg。
 * 结果映射的 video/poster 都是上传类内容包的字段形态（<accountId>/<file>）。
 */
export async function backfillUploadPosters(
  options: UploadBackfillOptions = {}
): Promise<PosterBackfillResult[]> {
  const extract = options.extract ?? getPosterExtractor();
  const root = uploadsRoot();
  const results: PosterBackfillResult[] = [];
  let accountIds: string[];
  try {
    accountIds = readdirSync(root);
  } catch {
    return [];
  }
  for (const accountId of accountIds) {
    let videoNames: string[];
    try {
      videoNames = readdirSync(path.join(root, accountId));
    } catch {
      continue; // 散文件/非常规目录不是 <accountId> 段，跳过
    }
    for (const name of videoNames) {
      if (!name.toLowerCase().endsWith(".mp4")) continue;
      const relVideo = `${accountId}/${name}`;
      const relPoster = posterRelPathFor(relVideo);
      const videoAbs = path.join(root, accountId, name);
      const posterAbs = path.join(root, accountId, relPoster.slice(accountId.length + 1));
      const videoMtime = mtimeMsOf(videoAbs);
      if (videoMtime != null && isPosterFresh(videoMtime, mtimeMsOf(posterAbs))) {
        results.push({ video: relVideo, poster: relPoster, status: "skipped" });
        continue;
      }
      const ok = await extract(videoAbs, posterAbs).catch(() => false);
      results.push({ video: relVideo, poster: relPoster, status: ok ? "created" : "failed" });
      if (ok) syncDraftPosterPath(options.db, relVideo, relPoster);
    }
  }
  return results;
}

/** 草稿行回填（老数据补抽后 Draft 列表/详情立即可用）：只补 NULL 行，不覆盖已有引用 */
function syncDraftPosterPath(
  db: Db | undefined,
  videoPath: string,
  posterPath: string
): void {
  if (!db) return;
  db.prepare(
    `UPDATE content_drafts SET poster_path = ?, updated_at = datetime('now')
     WHERE video_path = ? AND poster_path IS NULL`
  ).run(posterPath, videoPath);
}
