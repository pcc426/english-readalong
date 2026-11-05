"use client";

import { monthLabel, shiftMonth } from "@/lib/domain/beijing-date";

export function MonthSwitcher({
  month,
  earliest,
  current,
  onChange,
}: {
  month: string;
  earliest: string;
  current: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={month <= earliest}
        aria-label="上个月"
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-slate-500 ring-1 ring-slate-200 disabled:opacity-30"
      >
        ‹
      </button>
      <span className="min-w-[108px] text-center font-extrabold text-slate-700">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={month >= current}
        aria-label="下个月"
        className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-slate-500 ring-1 ring-slate-200 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
