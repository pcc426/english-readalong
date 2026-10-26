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
 * 生产环境缺凭据的报错（转写服务工厂的生产守卫，票 13 验收）：
 * 生产里静默回退假实现会产出假句子并落库，必须当场失败并指路 .env。
 * 报错文案从 LFASR_CREDENTIAL_KEYS 生成，键名改动时文案自动跟上。
 */
export function missingCredentialsError(): Error {
  return new Error(
    `生产环境未配置讯飞转写凭据：请在服务器 .env 填写 ${LFASR_CREDENTIAL_KEYS.join(
      " / "
    )}（讯飞开放平台「录音文件转写」服务，获取方式见 docs/deploy.md），改完 pm2 restart english-readalong 生效。`
  );
}

/**
 * 生产启动守卫的报错文案（V0.2 整改，instrumentation 启动即报）：
 * NODE_ENV=production 且 LFASR 凭据缺失时返回明确错误——列出缺失键名、
 * 指向服务器 .env 与 docs/deploy.md；非生产或凭据齐全返回 null（静默）。
 * 纯函数，注入 env 供测试。
 */
export function productionStartupCredentialError(
  env: Record<string, string | undefined> = process.env
): string | null {
  if (env.NODE_ENV !== "production") return null;
  const missing = LFASR_CREDENTIAL_KEYS.filter((key) => !env[key]);
  if (missing.length === 0) return null;
  return (
    `生产环境缺少讯飞转写凭据：${missing.join(" / ")} 未配置。` +
    `请在服务器 .env 填写 ${LFASR_CREDENTIAL_KEYS.join(" / ")}` +
    "（讯飞开放平台「录音文件转写」服务），部署说明见 docs/deploy.md，" +
    "改完 pm2 restart english-readalong 生效。"
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
