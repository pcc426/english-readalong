"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  title,
  leading,
  children,
  primaryLabel,
  onPrimary,
  primaryTone = "primary",
  initialFocus = "primary",
  secondaryLabel,
  onSecondary,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  leading?: ReactNode;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  /** 主按钮配色（V0.4.2）：危险操作用 danger */
  primaryTone?: "primary" | "danger";
  /** 打开时的初始焦点（V0.4.2）：危险操作默认落在「取消」上，避免误触确认 */
  initialFocus?: "primary" | "secondary";
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const secondaryRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusInitial = () => {
      const preferred =
        initialFocus === "secondary" ? secondaryRef.current : primaryRef.current;
      const target =
        preferred ??
        cardRef.current?.querySelector<HTMLElement>("button");
      target?.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !cardRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    focusInitial();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className="relative w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-400 active:bg-slate-50"
          aria-label="关闭"
        >
          ✕
        </button>
        {leading}
        <h2 id={titleId} className="mt-2 text-2xl font-extrabold text-slate-800">
          {title}
        </h2>
        {children}
        <div className="mt-7 grid gap-3">
          {primaryLabel && onPrimary && (
            <button
              ref={primaryRef}
              type="button"
              onClick={onPrimary}
              className={`rounded-2xl px-5 py-3.5 text-lg font-bold text-white shadow-sm ${
                primaryTone === "danger"
                  ? "bg-red-500 active:bg-red-600"
                  : "bg-emerald-500 active:bg-emerald-600"
              }`}
            >
              {primaryLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              ref={secondaryRef}
              type="button"
              onClick={onSecondary}
              className="rounded-2xl px-5 py-3 text-base font-semibold text-slate-500 ring-1 ring-slate-200 active:bg-slate-50"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
