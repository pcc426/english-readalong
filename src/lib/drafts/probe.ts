import { execFile } from "node:child_process";

/**
 * 视频时长探测缝：输入文件路径，返回毫秒；无法探测返回 null。
 * null = ffprobe 未安装或文件读不出来——时长未知时放行（fail-open）：
 * 部署前置依赖里有 ffmpeg（spec），而测试环境没有 ffprobe 也必须照常通过，
 * 严格拦截交给"确实装了且明确报出超长"这一条路径。
 */
export type DurationProbe = (filePath: string) => Promise<number | null>;

/**
 * ffprobe 执行器缝：返回 stdout；失败抛错。抽出来让解析逻辑可用假执行器测试，
 * 真实现走 child_process execFile（不加依赖）。
 */
export type FfprobeRunner = (filePath: string) => Promise<string>;

/** 真实 ffprobe 执行器：只取 format=duration，stdout 是裸数字 */
export function ffprobeRunner(bin = "ffprobe"): FfprobeRunner {
  return (filePath: string) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        bin,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          filePath,
        ],
        { timeout: 30_000 },
        (err, stdout) => {
          if (err) return reject(err);
          resolve(stdout);
        }
      );
    });
}

/** 由 ffprobe 执行器组装时长探测：秒 → 毫秒（四舍五入），非数字/负数视为无效 */
export function createDurationProbe(run: FfprobeRunner): DurationProbe {
  return async (filePath) => {
    let stdout: string;
    try {
      stdout = await run(filePath);
    } catch {
      return null;
    }
    const seconds = Number.parseFloat(stdout);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.round(seconds * 1000);
  };
}

let override: DurationProbe | null = null;

/** 测试注入点：置入假探测后 getDurationProbe 返回它；传 null 恢复默认。 */
export function setDurationProbe(probe: DurationProbe | null) {
  override = probe;
}

export function getDurationProbe(): DurationProbe {
  return override ?? createDurationProbe(ffprobeRunner());
}
