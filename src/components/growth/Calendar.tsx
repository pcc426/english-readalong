"use client";

import {
  beijingToday,
  leadingBlanks,
  monthDates,
} from "@/lib/domain/beijing-date";
import type { GrowthDay } from "./types";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function Calendar({
  month,
  days,
}: {
  month: string;
  days: GrowthDay[];
}) {
  const today = beijingToday();
  const byDate = new Map(days.map((day) => [day.date, day]));
  const blanks = leadingBlanks(month);
  return (
    <div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-center text-[11px] font-bold text-slate-400"
          >
            {day}
          </div>
        ))}
        {Array.from({ length: blanks }).map((_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {monthDates(month).map((date) => {
          const day = byDate.get(date);
          const isToday = date === today;
          return (
            <div
              key={date}
              className={`relative min-h-[70px] rounded-2xl p-1.5 ring-1 ${
                day?.checkedIn
                  ? "bg-amber-50 ring-amber-100"
                  : day?.partial
                    ? "bg-slate-50 ring-slate-100"
                    : "bg-white ring-slate-100"
              } ${isToday ? "ring-2 ring-emerald-400" : ""}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`text-xs font-semibold ${
                    day?.checkedIn || day?.partial
                      ? "text-slate-700"
                      : "text-slate-300"
                  }`}
                >
                  {Number(date.slice(8, 10))}
                </span>
                {day?.checkedIn && (
                  <span className="text-[10px] font-bold text-emerald-500">
                    ✓
                  </span>
                )}
              </div>
              {day?.checkedIn && (
                <div className="absolute inset-x-1 bottom-1.5 text-center text-sm font-extrabold leading-none text-amber-600">
                  🌟{day.stars}
                </div>
              )}
              {day?.partial && (
                <div className="absolute inset-x-0 bottom-2 flex justify-center">
                  <span className="h-2 w-2 rounded-full bg-amber-300 ring-2 ring-amber-100" />
                </div>
              )}
              {isToday && (
                <span className="absolute bottom-0.5 left-1 text-[10px] font-bold text-emerald-600">
                  今天
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="font-bold text-emerald-500">✓</span>完成打卡
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-300" />
          练习过 · 未完成整条内容
        </span>
        <span className="flex items-center gap-1">🌟 当天获得星星</span>
      </div>
    </div>
  );
}
