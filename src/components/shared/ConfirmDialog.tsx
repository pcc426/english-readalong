"use client";

// 统一的确认弹框（V0.4.2）：替换原生 window.confirm，沿用 0.4 版 Modal 的视觉。
// 危险操作（删除、退回校对）用红色主按钮，初始焦点落在「取消」上避免误触；
// 发布这类正向操作用 emerald。正文可以是一句话，也可以是左对齐的后果要点。
import type { ReactNode } from "react";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  onClose,
  icon,
  title,
  message,
  points,
  confirmLabel,
  cancelLabel = "取消",
  tone = "danger",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** 顶部圆图标（emoji） */
  icon: ReactNode;
  title: string;
  /** 一句话说明（与 points 二选一或并用） */
  message?: string;
  /** 左对齐的后果要点（退回校对这类强确认用） */
  points?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      leading={
        <div
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ${
            tone === "danger" ? "bg-red-100" : "bg-emerald-100"
          }`}
        >
          {icon}
        </div>
      }
      primaryLabel={confirmLabel}
      onPrimary={onConfirm}
      primaryTone={tone}
      initialFocus="secondary"
      secondaryLabel={cancelLabel}
      onSecondary={onClose}
    >
      {message && (
        <p className="mt-4 text-lg leading-relaxed text-slate-600">{message}</p>
      )}
      {points && points.length > 0 && (
        <ul className="mt-4 space-y-1.5 rounded-2xl bg-slate-50 px-4 py-3 text-left text-[15px] leading-relaxed text-slate-600">
          {points.map((point) => (
            <li key={point} className="flex gap-2">
              <span className="text-slate-400">·</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
