"use client";

import { useEffect, useState } from "react";
import {
  beijingMonthOf,
  beijingToday,
  monthLabel,
  shiftMonth,
} from "@/lib/domain/beijing-date";
import { BalanceCurve } from "./BalanceCurve";
import { Calendar } from "./Calendar";
import { MonthSwitcher } from "./MonthSwitcher";
import type { GrowthSnapshot } from "./types";

export function GrowthView() {
  const currentMonth = beijingMonthOf(beijingToday());
  const earliest = shiftMonth(currentMonth, -11);
  const [month, setMonth] = useState(currentMonth);
  const [snapshot, setSnapshot] = useState<GrowthSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(`/api/growth?month=${month}`);
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = (await res.json()) as GrowthSnapshot;
        if (cancelled) return;
        setSnapshot(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const loading = !snapshot || snapshot.month !== month;
  const checkInDates = snapshot
    ? snapshot.days.filter((day) => day.checkedIn).map((day) => day.date)
    : [];
  const launchMonthStart = snapshot ? `${snapshot.launchMonth}-01` : "";
  const showLaunchDateNote = snapshot
    ? snapshot.month === snapshot.launchMonth &&
      snapshot.launchDate !== launchMonthStart
    : false;
  const showCurve = snapshot
    ? !snapshot.preLaunch && snapshot.balances.length > 0
    : false;
  const endLabel = snapshot?.isCurrentMonth ? "现在" : "月末";
  const endBalance = snapshot
    ? (snapshot.balances[snapshot.balances.length - 1]?.balance ??
      snapshot.totalStars)
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">我的成长</h1>
          <p className="mt-1 text-slate-500">
            每一次跟读，都会变成一颗小星星。
          </p>
        </div>
        <MonthSwitcher
          month={month}
          earliest={earliest}
          current={currentMonth}
          onChange={setMonth}
        />
      </div>

      {failed ? (
        <div
          className="mt-8 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100"
          role="alert"
        >
          <p className="text-lg text-slate-500">加载失败，请刷新重试</p>
        </div>
      ) : loading ? (
        <div
          className="mt-8 rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-100"
          role="status"
        >
          <p className="text-lg text-slate-400">加载中…</p>
        </div>
      ) : snapshot ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-gradient-to-br from-amber-100 to-amber-50 p-5 shadow-sm ring-1 ring-amber-100">
              <div className="text-xs font-bold text-slate-500">累计星星</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-amber-600">
                  {snapshot.totalStars}
                </span>
                <span className="text-sm font-bold text-slate-400">🌟</span>
              </div>
            </div>
            <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm ring-1 ring-emerald-100">
              <div className="text-xs font-bold text-slate-500">连续打卡</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-emerald-600">
                  {snapshot.streakDays}
                </span>
                <span className="text-sm font-bold text-slate-400">天 🔥</span>
              </div>
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="text-xs font-bold text-slate-500">本月获得</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-slate-700">
                  {snapshot.monthStars}
                </span>
                <span className="text-sm font-bold text-slate-400">🌟</span>
              </div>
            </div>
          </div>

          <div
            className={`mt-6 grid gap-6 ${
              showCurve ? "xl:grid-cols-[1.35fr_1fr]" : ""
            }`}
          >
            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold">打卡日历</h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    完成一条完整内容，就会点亮一天
                  </p>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-600">
                  {snapshot.monthStars} 🌟
                </span>
              </div>
              {snapshot.preLaunch && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-5 text-center ring-1 ring-slate-100">
                  <div className="text-3xl">🌱</div>
                  <p className="mt-2 text-base font-bold text-slate-600">
                    打卡记录从 {monthLabel(snapshot.launchMonth)} 开始
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    之前的练习会折算成星星，但不补打卡记录。
                  </p>
                </div>
              )}
              {showLaunchDateNote && (
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  打卡记录从 {snapshot.launchDate} 开始
                </p>
              )}
              <Calendar month={snapshot.month} days={snapshot.days} />
              {!snapshot.preLaunch && snapshot.monthStars === 0 && (
                <p className="mt-3 text-center text-xs text-slate-400">
                  这个月还没有完整练完一条内容，今天试试吧！
                </p>
              )}
            </section>

            {showCurve && (
              <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold">
                      {Number(snapshot.month.split("-")[1])}月星星积累
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-400">
                      每天结束时的账户星星余额
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-600">
                    +{snapshot.monthStars} 🌟
                  </span>
                </div>
                <BalanceCurve
                  balances={snapshot.balances}
                  checkInDates={checkInDates}
                />
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>月初 {snapshot.balances[0]?.balance}</span>
                  <span>
                    {endLabel} {endBalance} 🌟
                  </span>
                </div>
              </section>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
