// 上传进度/取消/完成倒计时的纯逻辑（V0.3.4 票 01）。
// 进度换算与倒计时都抽成可注入时钟的纯函数，组件只消费状态。
import { useEffect, useRef, useState } from "react";

export const AUTO_NAVIGATE_SECONDS = 3;

export function percentOf(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}

export interface CountdownOptions {
  seconds?: number;
  onTick?: (n: number) => void;
  onDone: () => void;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
}

export interface CountdownHandle {
  cancel: () => void;
}

/**
 * 完成后的 3-2-1 倒计时（纯函数，时钟可注入供单测）：
 * 每秒 onTick(剩余秒)（3→2→1），计到 0 时 onDone 一次；cancel() 后不再触发。
 */
export function createCountdown(options: CountdownOptions): CountdownHandle {
  const seconds = options.seconds ?? AUTO_NAVIGATE_SECONDS;
  const setTimer =
    options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((t) => clearTimeout(t));

  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  for (let tick = seconds; tick >= 1; tick--) {
    const n = tick;
    timers.push(
      setTimer(() => {
        if (cancelled) return;
        options.onTick?.(n);
        if (n === 1) {
          cancelled = true;
          options.onDone();
        }
      }, (seconds - n) * 1000)
    );
  }

  return {
    cancel() {
      cancelled = true;
      timers.forEach(clearTimer);
    },
  };
}

/** Hook 包装：组件用（挂载即开始，卸载自动 cancel） */
export function useCountdown(options: CountdownOptions): { left: number } {
  const [left, setLeft] = useState(seconds(options));
  const doneRef = useRef(options.onDone);
  doneRef.current = options.onDone;
  const tickRef = useRef(options.onTick);
  tickRef.current = options.onTick;

  useEffect(() => {
    const handle = createCountdown({
      seconds: seconds(options),
      onDone: () => doneRef.current(),
      onTick: (n) => {
        setLeft(n);
        tickRef.current?.(n);
      },
    });
    return () => handle.cancel();
    // 只在挂载时启动一次；onDone/onTick 经 ref 取最新值
  }, []);

  return { left };
}

function seconds(options: CountdownOptions): number {
  return options.seconds ?? AUTO_NAVIGATE_SECONDS;
}
