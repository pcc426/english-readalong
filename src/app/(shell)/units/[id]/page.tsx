import { notFound } from "next/navigation";
import { getContentDetail } from "@/lib/content/view";
import PracticeFlow from "./PracticeFlow";

export const dynamic = "force-dynamic";

export default async function UnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const unit = getContentDetail(id);
  if (!unit) notFound();

  return (
    <main className="mx-auto flex h-[100dvh] max-w-xl flex-col overflow-hidden px-5 py-2">
      <div className="flex items-center justify-between">
        <a href="/" className="text-base text-slate-500">
          ‹ 单元列表
        </a>
        <a href={`/units/${id}/calibrate`} className="text-sm text-slate-400">
          🔧 校对模式
        </a>
      </div>
      <h1 className="mt-1 text-2xl font-bold">{unit.title}</h1>
      <p className="text-base text-slate-500">
        {unit.source} · {unit.sentences.length} 句
      </p>
      <PracticeFlow unit={unit} />
    </main>
  );
}
