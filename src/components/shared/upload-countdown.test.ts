import { describe, it, expect, vi } from "vitest";
import { createCountdown, percentOf } from "./upload-countdown";

/** 假时钟：collect 所有 (fn, ms)，按累计时间推进（ms <= 已过时间即触发） */
function fakeClock() {
  const pending: { fn: () => void; ms: number }[] = [];
  let elapsed = 0;
  const setTimer = (fn: () => void, ms: number) => {
    pending.push({ fn, ms });
    return pending.length as unknown as ReturnType<typeof setTimeout>;
  };
  const clearTimer = (t: ReturnType<typeof setTimeout>) => {
    const i = (t as unknown as number) - 1;
    if (pending[i]) pending.splice(i, 1);
  };
  const advance = (ms: number) => {
    elapsed += ms;
    const due = pending.filter((p) => p.ms <= elapsed);
    due.forEach((p) => p.fn());
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].ms <= elapsed) pending.splice(i, 1);
    }
  };
  return { pending, setTimer, clearTimer, advance };
}

describe("percentOf", () => {
  it("换算百分比并钳制到 0-100", () => {
    expect(percentOf(0, 1000)).toBe(0);
    expect(percentOf(450, 1000)).toBe(45);
    expect(percentOf(1000, 1000)).toBe(100);
    expect(percentOf(1200, 1000)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
  });
});

describe("createCountdown", () => {
  it("挂载即显示满秒，随后每秒递减，计到 0 触发 onDone 一次", () => {
    const clock = fakeClock();
    const onTick = vi.fn();
    const onDone = vi.fn();
    createCountdown({ onTick, onDone, ...clock });
    expect(onTick).not.toHaveBeenCalled();

    clock.advance(0); // 挂载即显示 3
    expect(onTick).toHaveBeenCalledWith(3);
    clock.advance(1000); // @1s → 剩 2
    expect(onTick).toHaveBeenCalledWith(2);
    clock.advance(1000); // @2s → 剩 1
    expect(onTick).toHaveBeenCalledWith(1);
    clock.advance(1000); // @3s → 完
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("cancel 后不再触发 onTick/onDone", () => {
    const clock = fakeClock();
    const onTick = vi.fn();
    const onDone = vi.fn();
    const handle = createCountdown({ onTick, onDone, ...clock });
    handle.cancel();
    clock.advance(10000);
    expect(onTick).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("秒数可配置（seconds: 5 → 五次 tick：5,4,3,2,1）", () => {
    const clock = fakeClock();
    const onTick = vi.fn();
    const onDone = vi.fn();
    createCountdown({ seconds: 5, onTick, onDone, ...clock });
    clock.advance(0);
    clock.advance(4000);
    clock.advance(1000); // @5s → 完
    expect(onTick).toHaveBeenCalledTimes(5); // 5→4→3→2→1
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
