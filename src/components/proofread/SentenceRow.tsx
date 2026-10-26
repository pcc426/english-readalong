"use client";

// 文本校对页的单句行（票 07）：可编辑文本 + 播放本句 + 删除 + 与下句合并。
// 保存反馈分四态：保存中… / 已保存 ✓ / 保存失败，请重试 / 无提示。
import type { DraftSentenceView } from "./types";

export type RowSaveState = "saving" | "saved" | "error";

/** 毫秒 → m:ss.s（与草稿详情页同一口径） */
function formatMs(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const SAVE_HINTS: Record<RowSaveState, { text: string; className: string }> = {
  saving: { text: "保存中…", className: "text-slate-400" },
  saved: { text: "已保存 ✓", className: "text-emerald-600" },
  error: { text: "保存失败，请重试", className: "text-red-600" },
};

interface SentenceRowProps {
  /** 全局序号（1 起，仅展示用） */
  number: number;
  sentence: DraftSentenceView;
  /** 是整份草稿的最后一句时没有「与下句合并」 */
  isLastOverall: boolean;
  saveState?: RowSaveState;
  playing: boolean;
  /** 删除/合并/整页确认进行中时锁住行内按钮 */
  disabled: boolean;
  /** 票 12（仅 standard 草稿）：本句的教材原文参照与一键采用 */
  textbook?: {
    text: string;
    onAdopt: () => void;
  };
  onTextChange: (text: string) => void;
  /** 失焦立即保存（清掉防抖定时器后提交） */
  onCommit: () => void;
  onPlay: () => void;
  onDelete: () => void;
  onMerge: () => void;
}

export default function SentenceRow({
  number,
  sentence,
  isLastOverall,
  saveState,
  playing,
  disabled,
  textbook,
  onTextChange,
  onCommit,
  onPlay,
  onDelete,
  onMerge,
}: SentenceRowProps) {
  return (
    <li className="rounded-3xl bg-white p-5 shadow-md ring-1 ring-slate-100">
      <div className="flex flex-wrap items-center gap-3">
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-base font-bold text-slate-500">
          第 {number} 句
        </span>
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          className={`shrink-0 rounded-2xl px-4 py-2 text-lg font-semibold shadow-sm active:bg-emerald-600 disabled:opacity-40 ${
            playing
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          }`}
        >
          {playing ? "停止" : "播放本句"}
        </button>
        <input
          type="text"
          value={sentence.text}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onCommit}
          aria-label={`第 ${number} 句文本`}
          className="min-w-0 flex-1 basis-64 rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-base text-slate-400">
          {formatMs(sentence.startMs)} – {formatMs(sentence.endMs)}
        </span>
        {sentence.proofread === "confirmed" && (
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-base font-semibold text-emerald-700">
            已确认
          </span>
        )}
        {saveState && (
          <span
            role="status"
            className={`text-base ${SAVE_HINTS[saveState].className}`}
          >
            {SAVE_HINTS[saveState].text}
          </span>
        )}
        <span className="ml-auto flex gap-2">
          {!isLastOverall && (
            <button
              type="button"
              onClick={onMerge}
              disabled={disabled}
              className="rounded-2xl bg-slate-50 px-4 py-2 text-lg font-semibold text-slate-600 ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
            >
              与下句合并
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            className="rounded-2xl bg-red-50 px-4 py-2 text-lg font-semibold text-red-600 ring-1 ring-red-100 active:bg-red-100 disabled:opacity-40"
          >
            删除
          </button>
        </span>
      </div>
      {/* 票 12（仅 standard 草稿）：教材原文参照；ASR 文本与起止时间保留作对照 */}
      {textbook && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-sky-50 px-4 py-3">
          <span className="shrink-0 text-base font-semibold text-sky-700">
            教材原文
          </span>
          <span className="min-w-0 flex-1 basis-48 text-base text-slate-600">
            {textbook.text}
          </span>
          {sentence.text !== textbook.text && (
            <button
              type="button"
              onClick={textbook.onAdopt}
              disabled={disabled}
              className="shrink-0 rounded-2xl bg-sky-100 px-4 py-2 text-base font-semibold text-sky-700 active:bg-sky-200 disabled:opacity-40"
            >
              采用教材原文
            </button>
          )}
        </div>
      )}
    </li>
  );
}
