"use client";

// 练习结束页（V0.4 验收调整）：从练习页跳转过来的独立页面，不再嵌在练习右栏。
// 一轮练完时 PracticeFlow 把本轮汇总写进 sessionStorage（按内容 id 隔离），
// 这里只负责展示结果与下一步：再练一遍 / 返回列表。
// 直接访问或结果已失效时给出返回列表的兜底，不臆造数据。
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WeeklyLimitModal } from "@/components/shared/WeeklyLimitModal";
import {
  finishStorageKey,
  finishView,
  type FinishPayload,
} from "../finish-summary";

export default function FinishPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [payload, setPayload] = useState<FinishPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const [capOpen, setCapOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = sessionStorage.getItem(finishStorageKey(id));
      if (!raw) {
        setMissing(true);
        return;
      }
      setPayload(JSON.parse(raw) as FinishPayload);
    } catch {
      setMissing(true);
    }
  }, [id]);

  if (missing) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-10 text-center">
        <p className="text-lg text-slate-500">没有找到这次的练习结果</p>
        <a
          href="/units"
          className="mt-6 inline-block rounded-2xl bg-white px-8 py-3 text-lg font-bold text-slate-600 shadow-md ring-1 ring-slate-200 active:bg-slate-50"
        >
          返回列表
        </a>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="mx-auto w-full max-w-xl px-5 py-10">
        <p className="text-lg text-slate-400" role="status">
          加载中…
        </p>
      </div>
    );
  }

  const view = finishView(payload);

  /** 新一轮练习：本周已练满就先弹限次说明，否则整页重开练习页（重新取本周次数） */
  function restartRun() {
    if (view.capped) {
      setCapOpen(true);
      return;
    }
    window.location.href = `/units/${payload!.unitId}`;
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-10">
      <p className="text-center text-sm font-semibold text-slate-400">
        {payload.title}
      </p>

      {payload.weeklyLimitReached ? (
        <section className="mt-4 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
          <div className="text-5xl">🌟</div>
          <p className="mt-2 text-2xl font-black text-slate-700">
            本周挑战次数已用完
          </p>
          <p className="mt-2 text-base text-slate-500">
            本次不计入星星，下周再来挑战吧。
          </p>
        </section>
      ) : view.doubled ? (
        <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-100 via-amber-50 to-white p-6 text-center shadow-sm ring-1 ring-amber-100">
          <span className="absolute left-5 top-5 text-2xl">✨</span>
          <span className="absolute right-6 top-8 text-xl">⭐</span>
          <span className="absolute bottom-6 left-8 text-xl">🌟</span>
          <div className="text-5xl">🎉</div>
          <p className="mt-2 text-2xl font-black text-amber-700">
            读得太棒了！
          </p>
          <p className="mt-1 text-lg font-extrabold text-amber-600">
            这次星星翻倍啦！
          </p>
          <p className="mt-3 text-5xl font-black text-amber-600">
            {view.awarded} <span className="text-3xl">🌟</span>
          </p>
          <p className="mt-1 text-sm font-bold text-amber-500">
            共获得 {view.awarded} 🌟
          </p>
        </section>
      ) : view.complete ? (
        <section className="mt-4 rounded-3xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-100">
          <p className="text-2xl font-bold text-emerald-700">
            🎉 整个内容练完啦！
          </p>
          <p className="mt-3 text-3xl font-bold text-amber-500">
            本次获得 {view.awarded} 颗星
            <span className="ml-2 text-lg font-normal text-slate-500">
              （{payload.total} 句全部读完）
            </span>
          </p>
        </section>
      ) : (
        <section className="mt-4 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100">
          <div className="text-5xl">🌱</div>
          <p className="mt-2 text-2xl font-black text-slate-700">
            这次还差一点点
          </p>
          <p className="mt-1 text-lg font-bold text-slate-500">
            本次读了 {payload.practiced}/{payload.total} 句
          </p>
          <div className="mx-auto mt-4 max-w-md rounded-2xl bg-amber-50 px-4 py-3 text-base font-bold text-amber-700 ring-1 ring-amber-100">
            未读完所有句子，不能累计星星🌟哦！
          </div>
          <p className="mt-3 text-sm text-slate-400">
            点「再练一遍」，把剩下的句子读完就能拿到星星。
          </p>
        </section>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={restartRun}
          className="rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600"
        >
          ↺ 再练一遍
        </button>
        <a
          href={view.listHref}
          className="rounded-2xl bg-white py-4 text-center text-xl font-bold text-slate-600 shadow-md ring-1 ring-slate-200 active:bg-slate-50"
        >
          返回列表
        </a>
      </div>

      <WeeklyLimitModal
        open={capOpen}
        onClose={() => setCapOpen(false)}
        contentType={payload.type}
      />
    </div>
  );
}
