import { FakeTranscriptionService } from "./fake";
import { XunfeiTranscriptionService } from "./xunfei/service";
import {
  extractAudioFromEnv,
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
  xunfeiTranscriptionConfigured,
} from "./env";

let override: TranscriptionService | null = null;

/**
 * 测试注入点：置入假转写器后，getTranscriptionService 返回它；
 * 传 null 恢复默认（环境构造）。仿 setScoringService。
 */
export function setTranscriptionService(service: TranscriptionService | null) {
  override = service;
}

export function getTranscriptionService(): TranscriptionService {
  return override ?? createTranscriptionServiceFromEnv();
}

/**
 * 从环境构造转写服务（生产入口，密钥只走环境变量）：
 * - LFASR_APP_ID / LFASR_API_KEY / LFASR_API_SECRET 三件套齐全 →
 *   讯飞 LFASR 适配器（LFASR_EXTRACT_AUDIO=1 时先 ffmpeg 抽音轨再提交，
 *   mp4 直收与否待真机冒烟确认）；
 * - 否则维持假实现，让链路在开发环境照常走通。
 */
export function createTranscriptionServiceFromEnv(
  env: Record<string, string | undefined> = process.env
): TranscriptionService {
  if (xunfeiTranscriptionConfigured(env)) {
    return new XunfeiTranscriptionService({
      appId: env.LFASR_APP_ID!,
      apiKey: env.LFASR_API_KEY!,
      apiSecret: env.LFASR_API_SECRET!,
      extractAudio: extractAudioFromEnv(env),
    });
  }
  return new FakeTranscriptionService();
}
