/**
 * LFASR 凭据与开关的 env 解析（纯函数，供工厂与 instrumentation 复用）。
 * 凭据三件套：讯飞开放平台「录音文件转写」服务的 APPID / APIKey / APISecret，
 * 与语音评测（XFYUN_*）是两套凭据，不混用。
 */
export const LFASR_CREDENTIAL_KEYS = [
  "LFASR_APP_ID",
  "LFASR_API_KEY",
  "LFASR_API_SECRET",
] as const;

/** 三件套齐全（非空字符串）才算配了真实凭据；留空的 .env 键不算 */
export function xunfeiTranscriptionConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(
    env.LFASR_APP_ID && env.LFASR_API_KEY && env.LFASR_API_SECRET
  );
}

/**
 * 抽音轨开关：LFASR_EXTRACT_AUDIO=1（或 true）时先 ffmpeg 抽音轨再提交。
 * 默认关——LFASR 标准版格式表列有 mp4，但 FAQ 未列，是否真收视频文件
 * 由 scripts/smoke-lfasr.ts 实机确认后再决定要不要开。
 */
export function extractAudioFromEnv(
  env: Record<string, string | undefined> = process.env
): boolean {
  const v = env.LFASR_EXTRACT_AUDIO;
  return v === "1" || v === "true";
}
