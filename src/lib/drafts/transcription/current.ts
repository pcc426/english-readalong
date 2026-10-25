import { FakeTranscriptionService } from "./fake";
import type { TranscriptionService } from "./types";

export type {
  TranscribedSentence,
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionSubmitInput,
  TranscriptionTask,
} from "./types";

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

/** 从环境构造转写服务（生产入口，密钥只走环境变量）。 */
export function createTranscriptionServiceFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TranscriptionService {
  // 06 号票落地讯飞 LFASR 适配器后改为：有凭据（XFYUN 转写三件套）→
  // XunfeiTranscriptionService，否则维持假实现让链路在开发环境可走通。
  void env;
  return new FakeTranscriptionService();
}
