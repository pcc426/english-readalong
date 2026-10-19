import { notFound } from "next/navigation";
import { getUnitDetail } from "@/lib/units";
import PracticeFlow from "./PracticeFlow";

export const dynamic = "force-dynamic";

export default async function UnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const unit = getUnitDetail(id);
  if (!unit) notFound();

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <a href="/" className="text-lg text-slate-500">
        ‹ 单元列表
      </a>
      <h1 className="mt-2 text-3xl font-bold">{unit.title}</h1>
      <p className="mt-1 text-lg text-slate-500">
        {unit.source} · {unit.sentences.length} 句
      </p>
      <PracticeFlow unit={unit} />
    </main>
  );
}
