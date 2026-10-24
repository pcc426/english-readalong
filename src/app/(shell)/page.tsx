"use client";

// 「教材内容」页（票 03）：原首页的单元列表迁入壳内，数据改走 HTTP。
// 未登录时 GET /api/units 返回 401，由壳层统一重定向兜底，这里只标加载失败。
import { useEffect, useState } from "react";

// 与 GET /api/units 响应对应（壳只走 HTTP，不从 src/lib 引类型）
interface UnitOverview {
  id: string;
  title: string;
  source: string;
  sentenceCount: number;
  percentages: {
    threeStar: number;
    twoStar: number;
    oneStar: number;
    unpracticed: number;
  };
  encouragement: string;
}

type Percentages = UnitOverview["percentages"];

const STAR_LABELS: Array<[keyof Percentages, string, string]> = [
  ["threeStar", "三星", "text-amber-500"],
  ["twoStar", "两星", "text-orange-400"],
  ["oneStar", "一星", "text-slate-400"],
  ["unpracticed", "未练", "text-slate-300"],
];

export default function StandardContentPage() {
  const [units, setUnits] = useState<UnitOverview[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/units");
        if (cancelled) return;
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const body = (await res.json()) as { units?: UnitOverview[] };
        if (!cancelled) setUnits(body.units ?? []);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">教材内容</h1>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          加载失败，请刷新重试
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h1 className="text-3xl font-bold tracking-tight">教材内容</h1>
      <p className="mt-2 text-xl text-slate-500">选一个单元开始练习吧</p>

      {units === null ? (
        <p className="mt-8 text-lg text-slate-400" role="status">
          加载中…
        </p>
      ) : (
        <div className="mt-8 space-y-6">
          {units.map((unit) => (
            <a
              key={unit.id}
              href={`/units/${unit.id}`}
              className="block rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100 active:bg-slate-50"
            >
              <h2 className="text-2xl font-bold">{unit.title}</h2>
              <p className="mt-1 text-lg text-slate-500">
                {unit.source} · {unit.sentenceCount} 句
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-lg font-semibold">
                {STAR_LABELS.map(([key, label, color]) => (
                  <span
                    key={key}
                    className={`rounded-full px-3 py-1 ${color} bg-slate-50`}
                  >
                    {label} {unit.percentages[key]}%
                  </span>
                ))}
              </div>

              <p className="mt-4 text-xl leading-relaxed text-emerald-700">
                {unit.encouragement}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
