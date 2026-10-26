import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { videoAbsPath } from "../../storage";
import { getDurationProbe, type DurationProbe } from "../../probe";

/** 上传负载：文件字节 + 带扩展名的文件名 + 音频秒数（LFASR duration 必填） */
export interface UploadPayload {
  data: Buffer;
  fileName: string;
  durationSec: number;
}

export type UploadPayloadBuilder = (videoPath: string) => Promise<UploadPayload>;

/** ffmpeg 执行器缝：单测注入假执行器；真实现走 child_process（不加依赖） */
export type FfmpegRunner = (bin: string, args: string[]) => Promise<void>;

export interface PayloadOptions {
  /** 抽音轨开关（LFASR_EXTRACT_AUDIO）：默认关，mp4 直接提交待真机冒烟确认 */
  extractAudio?: boolean;
  ffmpegBin?: string;
  /** 时长探测（默认复用 05 号票的 ffprobe 缝）；null → duration 给保底值 1 */
  probeDurationMs?: DurationProbe;
  /** ffmpeg 执行器（默认 child_process execFile；单测注入假执行器） */
  runFfmpeg?: FfmpegRunner;
}

/**
 * 组装上传负载：
 * - 默认直接读原视频（LFASR 格式表列有 mp4，是否真收视频由冒烟实机确认）；
 * - extractAudio 开启则先 ffmpeg 抽 16kHz 单声道 wav 再提交——ffmpeg 缺失
 *   或抽轨失败都抛带明确指引的错，不静默降级。
 */
export function createUploadPayloadBuilder(
  options: PayloadOptions = {}
): UploadPayloadBuilder {
  const probe = options.probeDurationMs ?? getDurationProbe();
  return async (videoPath: string): Promise<UploadPayload> => {
    const absPath = videoAbsPath(videoPath);
    const durationSec = await payloadDurationSec(probe, absPath);
    if (!options.extractAudio) {
      return {
        data: readFileSync(absPath),
        fileName: path.basename(videoPath),
        durationSec,
      };
    }
    return extractAudioPayload(absPath, path.basename(videoPath), durationSec, options);
  };
}

/** LFASR duration 必填（官方说明当前不校验），探测不到给保底 1 秒 */
async function payloadDurationSec(
  probe: DurationProbe,
  absPath: string
): Promise<number> {
  const ms = await probe(absPath);
  const sec = ms == null ? 0 : Math.round(ms / 1000);
  return sec > 0 ? sec : 1;
}

async function extractAudioPayload(
  absPath: string,
  originalName: string,
  durationSec: number,
  options: PayloadOptions
): Promise<UploadPayload> {
  const bin = options.ffmpegBin ?? "ffmpeg";
  const run = options.runFfmpeg ?? execFfmpeg;
  const outDir = mkdtempSync(path.join(tmpdir(), "lfasr-audio-"));
  const wavPath = path.join(outDir, "audio.wav");
  try {
    try {
      await run(bin, [
        "-y",
        "-i",
        absPath,
        "-vn", // 去画面只留音轨
        "-ac",
        "1",
        "-ar",
        "16000",
        wavPath,
      ]);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        throw new Error(
          `LFASR_EXTRACT_AUDIO=1 需要 ffmpeg 先抽音轨，但系统找不到 ffmpeg 可执行文件（${bin}）；请安装 ffmpeg 或关掉该开关`
        );
      }
      throw new Error(
        `ffmpeg 抽音轨失败（${originalName}）：${(err as Error).message}`
      );
    }
    return {
      data: readFileSync(wavPath),
      fileName: `${path.basename(originalName, path.extname(originalName))}.wav`,
      durationSec,
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function execFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 120_000 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
