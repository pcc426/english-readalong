import { execFile } from "node:child_process";
import { rmSync, statSync } from "node:fs";
import { dbPath, openDb, type Db } from "../db";
import { getDraft, setDraftPoster } from "./repo";
import { videoAbsPath } from "./storage";

/**
 * 视频封面（poster）生成缝（票 01）：
 * 素材全部 720×1280 竖屏，封面即 9:16，不裁剪。抽帧时点优先 1.0s（避开纯黑开场），
 * 失败（视频短于 1s）回退 0.2s；ffmpeg 缺失/抽帧失败一律 fail-open 返回 false，
 * poster 回退 null——与 probe.ts 同策略：测试与低配环境可无 ffmpeg，不阻断上传与转写。
 */

/** ffmpeg 执行器缝：单测注入假执行器；真实现走 child_process execFile（不加依赖）。参照 xunfei/payload.ts 同名缝 */
export type FfmpegRunner = (bin: string, args: string[]) => Promise<void>;

/** 封面抽取：输入视频绝对路径与产物绝对路径；产物写不写得出 true/false。失败不抛（吞错不炸主流程） */
export type PosterExtractor = (
  videoAbsPath: string,
  posterAbsPath: string
) => Promise<boolean>;

/** ffmpeg 抽帧参数（票面约定）：-ss 秒、单帧、宽 360（-2 保证偶数高）、JPEG 质量 4 */
function frameArgs(seconds: string, video: string, poster: string): string[] {
  return [
    "-y",
    "-ss",
    seconds,
    "-i",
    video,
    "-frames:v",
    "1",
    "-vf",
    "scale=360:-2",
    "-q:v",
    "4",
    poster,
  ];
}

/** 输出文件算不算抽帧成功：存在且非 0 字节（ffmpeg 空输出也可能 exit 0） */
function posterWritten(poster: string): boolean {
  try {
    return statSync(poster).size > 0;
  } catch {
    return false;
  }
}

function execFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 30_000 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * 由 ffmpeg 执行器组装封面抽取：1.0s 失败回退 0.2s；每次失败清掉半成品再重试；
 * ENOENT（没装 ffmpeg）不重试直接 false。所有错误吞掉返回 false，不向外抛。
 */
export function createPosterExtractor(
  run: FfmpegRunner,
  bin = "ffmpeg"
): PosterExtractor {
  return async (video, poster) => {
    for (const seconds of ["1.0", "0.2"]) {
      try {
        await run(bin, frameArgs(seconds, video, poster));
      } catch (err) {
        rmSync(poster, { force: true });
        if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return false;
        continue;
      }
      if (posterWritten(poster)) return true;
      rmSync(poster, { force: true });
    }
    return false;
  };
}

let override: PosterExtractor | null = null;

/** 测试注入点：置入假抽取后 getPosterExtractor 返回它；传 null 恢复默认。 */
export function setPosterExtractor(extractor: PosterExtractor | null) {
  override = extractor;
}

export function getPosterExtractor(): PosterExtractor {
  return override ?? createPosterExtractor(execFfmpeg);
}

/**
 * 封面相对引用派生：与视频同形（<accountId>/<file>），但与视频不同名——
 * <同名>.poster.jpg 落同一账号目录（uploads 根下）。
 */
export function posterRelPathFor(videoRelPath: string): string {
  const dot = videoRelPath.lastIndexOf(".");
  const slash = videoRelPath.lastIndexOf("/");
  const base =
    dot > slash ? videoRelPath.slice(0, dot) : videoRelPath;
  return `${base}.poster.jpg`;
}

/** 随代码视频文件名 → 封面文件名（content/media/posters/ 下同名 .jpg；包字段存裸文件名，与 video 同形） */
export function shippedPosterNameFor(videoName: string): string {
  const dot = videoName.lastIndexOf(".");
  const base = dot > 0 ? videoName.slice(0, dot) : videoName;
  return `${base}.jpg`;
}

/**
 * 上传后立即抽帧（票 01 触发点）：草稿视频 → 同目录 poster.jpg，成功则 poster_path 落库。
 * 自带连接、吞掉一切错误：调用方（uploads 路由）fire-and-forget，主流程不等它、也不因它失败。
 */
export async function generateDraftPoster(draftId: string): Promise<boolean> {
  const db = openDb(dbPath());
  try {
    return await generateDraftPosterWithDb(db, draftId);
  } finally {
    db.close();
  }
}

/** 同上，但复用调用方的连接（可注入 DB 的测试缝与补抽脚本复用） */
export async function generateDraftPosterWithDb(
  db: Db,
  draftId: string
): Promise<boolean> {
  try {
    const draft = getDraft(db, draftId);
    if (!draft?.videoPath) return false;
    const posterRel = posterRelPathFor(draft.videoPath);
    const ok = await getPosterExtractor()(
      videoAbsPath(draft.videoPath),
      videoAbsPath(posterRel)
    );
    if (ok) setDraftPoster(db, draftId, posterRel);
    return ok;
  } catch {
    return false;
  }
}
