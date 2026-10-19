import { spawn } from "node:child_process";

/**
 * 把浏览器录音（Safari MediaRecorder 的 AAC/M4A）转成讯飞要求的
 * 16kHz/16bit 单声道 WAV（PCM）。所有候选评测引擎都不收 AAC（ADR-0001）。
 */
export function transcodeTo16kWav(
  input: Buffer,
  ffmpegPath = "ffmpeg"
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-sample_fmt",
      "s16",
      "-f",
      "wav",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => {
      if (stderr.length < 2000) stderr += c.toString();
    });
    proc.on("error", (err) =>
      reject(new Error(`ffmpeg 启动失败（${err.message}）：服务器需要安装 ffmpeg`))
    );
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg 转码失败（exit ${code}）：${stderr.trim()}`));
    });
    proc.stdin.end(input);
  });
}
