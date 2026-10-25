import { describe, it, expect } from "vitest";
import { FakeTranscriptionService, fakeTranscriptSentences } from "./fake";
import type { TranscribedSentence } from "./types";

/** 轮询到完成态并取句子清单（fake 约定默认必完成） */
async function pollDone(
  service: FakeTranscriptionService,
  taskId: string
): Promise<TranscribedSentence[]> {
  const result = await service.poll(taskId);
  if (result.state !== "done") throw new Error(`fake 应当完成，得到 ${result.state}`);
  return result.sentences;
}

describe("FakeTranscriptionService", () => {
  it("提交返回任务引用，按引用轮询得到完成态与句子清单", async () => {
    const service = new FakeTranscriptionService();
    const { taskId } = await service.submit({ videoPath: "a1/b.mp4" });
    expect(typeof taskId).toBe("string");
    expect(taskId.length).toBeGreaterThan(0);
    expect(await pollDone(service, taskId)).toEqual(fakeTranscriptSentences());
  });

  it("句子清单确定性：同一服务两次轮询、两个实例结果一致", async () => {
    const a = new FakeTranscriptionService();
    const b = new FakeTranscriptionService();
    const ta = await a.submit({ videoPath: "x/y.mp4" });
    const tb = await b.submit({ videoPath: "other/z.mov" });
    expect(await pollDone(a, ta.taskId)).toEqual(await pollDone(b, tb.taskId));
  });

  it("句子 3-5 句、毫秒时间合法（0 ≤ start < end）", async () => {
    const service = new FakeTranscriptionService();
    const { taskId } = await service.submit({ videoPath: "a1/b.mp4" });
    const sentences = await pollDone(service, taskId);
    expect(sentences.length).toBeGreaterThanOrEqual(3);
    expect(sentences.length).toBeLessThanOrEqual(5);
    for (const s of sentences) {
      expect(s.text.trim().length).toBeGreaterThan(0);
      expect(s.startMs).toBeGreaterThanOrEqual(0);
      expect(s.endMs).toBeGreaterThan(s.startMs);
    }
  });

  it("pollOnCall 钉住首次轮询：可模拟 pending / failed 中间态", async () => {
    const pending = new FakeTranscriptionService({ state: "pending" });
    expect(await pending.poll("any")).toEqual({ state: "pending" });
    const failed = new FakeTranscriptionService({
      state: "failed",
      error: "讯飞 10105",
    });
    expect(await failed.poll("any")).toEqual({
      state: "failed",
      error: "讯飞 10105",
    });
  });
});
