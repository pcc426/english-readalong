import { getUnitsOverview } from "@/lib/units";
import type { CompletionDistribution } from "@/lib/domain/stats";

export const dynamic = "force-dynamic";

type Percentages = CompletionDistribution["percentages"];

const STAR_LABELS: Array<[keyof Percentages, string, string]> = [
  ["threeStar", "三星", "text-amber-500"],
  ["twoStar", "两星", "text-orange-400"],
  ["oneStar", "一星", "text-slate-400"],
  ["unpracticed", "未练", "text-slate-300"],
];

export default function HomePage() {
  const units = getUnitsOverview();
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <h1 className="text-4xl font-bold tracking-tight">英语跟读</h1>
      <p className="mt-2 text-xl text-slate-500">选一个单元开始练习吧</p>

      <div className="mt-8 space-y-6">
        {units.map((unit) => (
          <section
            key={unit.id}
            className="rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100"
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
          </section>
        ))}
      </div>
    </main>
  );
}
