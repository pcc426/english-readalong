"use client";

// 切点校对页的当前句卡片（票 08）：句子文本 + 起止时间 + ±0.25s 微调 + 片段播放。
// 保存反馈与文本校对页同一口径：保存中… / 已保存 ✓ / 保存失败，请重试。
import { CALIBRATE_STEP_MS } from "@/lib/domain/calibrate";

export type ClipSaveState = "saving" | "saved" | "error";

/** 毫秒 → 两位小数的秒，切点微调的展示口径（沿用 V0.1 校对模式） */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

const SAVE_HINTS: Record<ClipSaveState, { text: string; className: string }> = {
  saving: { text: "保存中…", className: "text-slate-400" },
  saved: { text: "已保存 ✓", className: "text-emerald-600" },
  error: { text: "保存失败，请重试", className: "text-red-600" },
};

interface ClipCardProps {
  /** 全局序号（1 起，仅展示用） */
  number: number;
  text: string;
  startMs: number;
  endMs: number;
  playing: boolean;
  saveState?: ClipSaveState;
  /** 置灰微调与播放按钮（如草稿不可编辑时整页已被守卫，这里保险用） */
  disabled: boolean;
  onAdjust: (field: "start" | "end", deltaMs: number) => void;
  onPlay: () => void;
}

export default function ClipCard({
  number,
  text,
  startMs,
  endMs,
  playing,
  saveState,
  disabled,
  onAdjust,
  onPlay,
}: ClipCardProps) {
  const adjustClass =
    "rounded-xl bg-slate-100 py-3 text-lg font-bold active:bg-slate-200 disabled:opacity-40";
  return (
    <section className="rounded-3xl bg-white p-5 shadow-md ring-1 ring-slate-100">
      <p className="text-xl font-semibold leading-relaxed">
        {number}. {text}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">
        {formatSeconds(startMs)} → {formatSeconds(endMs)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onAdjust("start", -CALIBRATE_STEP_MS)}
          disabled={disabled}
          className={adjustClass}
        >
          起点 −0.25s
        </button>
        <button
          type="button"
          onClick={() => onAdjust("start", CALIBRATE_STEP_MS)}
          disabled={disabled}
          className={adjustClass}
        >
          起点 ＋0.25s
        </button>
        <button
          type="button"
          onClick={() => onAdjust("end", -CALIBRATE_STEP_MS)}
          disabled={disabled}
          className={adjustClass}
        >
          终点 −0.25s
        </button>
        <button
          type="button"
          onClick={() => onAdjust("end", CALIBRATE_STEP_MS)}
          disabled={disabled}
          className={adjustClass}
        >
          终点 ＋0.25s
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          className={`rounded-xl px-5 py-3 text-lg font-bold shadow-sm disabled:opacity-40 ${
            playing
              ? "bg-emerald-600 text-white active:bg-emerald-700"
              : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-100"
          }`}
        >
          {playing ? "⏹ 停止" : "▶ 播放本句"}
        </button>
        {saveState && (
          <span role="status" className={`text-base ${SAVE_HINTS[saveState].className}`}>
            {SAVE_HINTS[saveState].text}
          </span>
        )}
      </div>
    </section>
  );
}
