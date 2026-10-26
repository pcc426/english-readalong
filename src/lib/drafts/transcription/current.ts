import { FakeTranscriptionService } from "./fake";
import { XunfeiTranscriptionService } from "./xunfei/service";
import { XunfeiLlmTranscriptionService } from "./xunfei/llm";
import {
  extractAudioFromEnv,
  missingCredentialsError,
  xunfeiTranscriptionConfigured,
} from "./env";
import type { TranscriptionService } from "./types";

export type {
  TranscribedSentence,
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionSubmitInput,
  TranscriptionTask,
} from "./types";

export {
  extractAudioFromEnv,
  missingCredentialsError,
  productionStartupCredentialError,
  xunfeiTranscriptionConfigured,
} from "./env";

let override: TranscriptionService | null = null;
/** 环境构造的服务须跨调用复用：假实现的任务表在实例内，每次新建会让 submit/poll 分家 */
let fromEnv: TranscriptionService | null = null;

/**
 * 测试注入点：置入假转写器后，getTranscriptionService 返回它；
 * 传 null 恢复默认（环境构造）。仿 setScoringService。
 */
export function setTranscriptionService(service: TranscriptionService | null) {
  override = service;
  fromEnv = null;
}

export function getTranscriptionService(): TranscriptionService {
  if (override) return override;
  fromEnv ??= createTranscriptionServiceFromEnv();
  return fromEnv;
}

/**
 * 从环境构造转写服务（生产入口，密钥只走环境变量）：
 * - LFASR_APP_ID / LFASR_API_KEY / LFASR_API_SECRET 三件套齐全 →
 *   讯飞录音文件转写。LFASR_MODE 选版本：
 *   - llm（默认）：录音文件转写大模型（office-api-ist-dx.iflyaisol.com，
 *     请求头 signature 鉴权，只收音频，恒用 ffmpeg 抽轨）；
 *   - standard：录音文件转写标准版（raasr.xfyun.cn/v2/api）；
 * - 生产（NODE_ENV=production）缺三件套 → 抛中文启动错误（票 13），
 *   不静默回退假转写。经 runTranscription 落到草稿 transcribe_error，
 *   详情页会显示完整指路文案；
 * - 开发/测试维持假实现，让链路照常走通。
 */
export function createTranscriptionServiceFromEnv(
  env: Record<string, string | undefined> = process.env
): TranscriptionService {
  if (xunfeiTranscriptionConfigured(env)) {
    const appId = env.LFASR_APP_ID!;
    const apiKey = env.LFASR_API_KEY!;
    const apiSecret = env.LFASR_API_SECRET!;
    if (env.LFASR_MODE === "standard") {
      return new XunfeiTranscriptionService({
        appId,
        apiKey,
        apiSecret,
        extractAudio: extractAudioFromEnv(env),
      });
    }
    return new XunfeiLlmTranscriptionService({
      appId,
      accessKeyId: apiKey,
      accessKeySecret: apiSecret,
    });
  }
  if (env.NODE_ENV === "production") {
    throw missingCredentialsError();
  }
  return new FakeTranscriptionService();
}
