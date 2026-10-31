import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDebouncedSave,
  DEBOUNCE_MS,
  settleStateAfterSave,
} from "./use-draft-save";
import type { DraftSentenceView } from "@/components/proofread/types";

function sentenceWith(proofread: string): DraftSentenceView {
  return { index: 0, text: "Hello", startMs: 0, endMs: 1000, proofread };
}

describe("settleStateAfterSave（PUT 成功后的常驻落定态，票 v03-10）", () => {
  it("服务端返回 confirmed（确认本句/本来就未改动）：saved，常驻不再定时清除", () => {
    expect(settleStateAfterSave(sentenceWith("confirmed"))).toBe("saved");
  });

  it("服务端打回 edited（已确认句被改/未确认句保存）：needs-reconfirm 提示重新确认", () => {
    expect(settleStateAfterSave(sentenceWith("edited"))).toBe("needs-reconfirm");
  });

  it("SAVED_HINT_MS 定时消失逻辑已删除（saved 不再 1.5s 自动清掉）", async () => {
    const mod = await import("./use-draft-save");
    // @ts-expect-error 导出已删除；若有人重新加回，此处的 expect-error 会反过来报错
    expect(mod.SAVED_HINT_MS).toBeUndefined();
  });
});

describe("createDebouncedSave（票 v03-10：防抖只延迟请求，saving 立即）", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function recorder() {
    const starts: number[] = [];
    const flushes: number[] = [];
    const debounced = createDebouncedSave({
      onEditStart: (index) => starts.push(index),
      onFlush: (index) => flushes.push(index),
    });
    return { debounced, starts, flushes };
  }

  it("编辑一发生立即回调 onEditStart（置 saving），防抖到期前不发请求", () => {
    const { debounced, starts, flushes } = recorder();
    debounced.schedule(2);
    // 同步：状态条马上 saving，不再等 800ms
    expect(starts).toEqual([2]);
    expect(flushes).toEqual([]);
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(flushes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushes).toEqual([2]);
  });

  it("连续编辑重置计时：每次编辑都立即 saving，请求只在最后一次停止后发一次", () => {
    const { debounced, starts, flushes } = recorder();
    debounced.schedule(0);
    vi.advanceTimersByTime(400);
    debounced.schedule(0);
    expect(starts).toEqual([0, 0]);
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(flushes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushes).toEqual([0]);
  });

  it("cancel 取消某句未触发的请求；cancelAll 清掉全部", () => {
    const { debounced, flushes } = recorder();
    debounced.schedule(0);
    debounced.cancel(0);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(flushes).toEqual([]);

    debounced.schedule(0);
    debounced.schedule(1);
    debounced.cancelAll();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(flushes).toEqual([]);
  });
});
