import { notFound } from "next/navigation";
import { getUnitDetail } from "@/lib/units";
import Calibrator from "./Calibrator";

export const dynamic = "force-dynamic";

export default async function CalibratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const unit = getUnitDetail(id);
  if (!unit) notFound();

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <a href={`/units/${id}`} className="text-lg text-slate-500">
        ‹ 返回练习
      </a>
      <h1 className="mt-2 text-2xl font-bold">🔧 校对模式 · {unit.title}</h1>
      <p className="mt-1 text-base text-slate-500">
        播放本句听效果，用按钮微调起点/终点（步进 0.25 秒），调完导出 JSON 发给 Claude 替换内容包。
      </p>
      <Calibrator unit={unit} />
    </main>
  );
}
