import { randomUUID } from "node:crypto";
import type {
  TranscribedSentence,
  TranscriptionPollResult,
  TranscriptionService,
  TranscriptionSubmitInput,
  TranscriptionTask,
} from "./types";

/**
 * 假转写的确定性句子清单（3-5 句、起止毫秒合法且单调递增）。
 * 导出常量：上传链路测试可直接断言落库句子与它一致。
 */
export function fakeTranscriptSentences(): TranscribedSentence[] {
  return [
    { text: "Hello, Kitty!", startMs: 0, endMs: 3200 },
    { text: "What is your name?", startMs: 3400, endMs: 6100 },
    { text: "My name is Danny.", startMs: 6300, endMs: 9200 },
    { text: "Let's play together.", startMs: 9400, endMs: 12600 },
  ];
}

/**
 * 可编程假转写服务（测试注入 + 无凭据环境默认）：提交即登记任务，
 * 轮询一律返回同一份确定性句子。pollOnCall 允许测试把首次轮询
 * 钉成 pending/failed，验证草稿停在 transcribing 的中间态与失败可重试。
 */
export class FakeTranscriptionService implements TranscriptionService {
  private readonly tasks = new Map<string, TranscribedSentence[]>();
  private seq = 0;

  constructor(
    /** 首次 poll 固定返回该结果（默认 done，走完整链路） */
    private readonly pollOnCall?: TranscriptionPollResult
  ) {}

  async submit(_input: TranscriptionSubmitInput): Promise<TranscriptionTask> {
    this.seq += 1;
    const taskId = this.pollOnCall
      ? `fake-${this.seq}`
      : `fake-${randomUUID()}`;
    this.tasks.set(taskId, fakeTranscriptSentences());
    return { taskId };
  }

  async poll(taskId: string): Promise<TranscriptionPollResult> {
    if (this.pollOnCall) return this.pollOnCall;
    const sentences = this.tasks.get(taskId);
    if (!sentences) return { state: "failed", error: "未知转写任务引用" };
    return { state: "done", sentences };
  }
}
