// 「教材内容」首页（票 05）的筛选/联动纯函数：单元下拉 → 模块下拉联动与客户端过滤。
// 与页面同目录，参照票 06 custom-list / 票 11 practice-panel 的模式——只做映射，
// 不承载请求/状态逻辑。排序不在这里做：默认序＝API 返回序（loader 已按教材序，票 03）。

/** 单元下拉的取值："all"（全部单元）或教材单元序号（unitNo） */
export type UnitFilter = number | "all";

/** 模块下拉的取值："all"（全部模块）或教材印刷栏目名（moduleKind） */
export type ModuleFilter = string | "all";

/** 筛选所需的最小内容字段（GET /api/units 的 units 行同形，票 03 归属字段） */
interface FilterableContent {
  unitNo: number | null;
  moduleKind: string | null;
}

/**
 * 按单元/模块筛选标准内容（纯客户端，票 05）。保持传入顺序——
 * 默认序＝API 返回序（教材序，spec 决策 18），筛选态不重排；
 * 无归属字段的老包（unitNo/moduleKind 为 null）只在完全不限时可见。
 */
export function filterStandardContent<T extends FilterableContent>(
  units: readonly T[],
  unit: UnitFilter,
  module: ModuleFilter
): T[] {
  return units.filter(
    (u) =>
      (unit === "all" || u.unitNo === unit) &&
      (module === "all" || u.moduleKind === module)
  );
}

/**
 * 模块下拉选项（不含「全部模块」，页面自补）：随单元联动——
 * 选了单元只列该单元实际有内容的栏目，不选单元跨所有单元收集。
 * 顺序＝在池中的首次出现序；池已按教材序排（票 03），故选项随教材目录序，
 * 不依赖 MODULE_KINDS 声明序（客户端不 import 教材注册表，避免教材 JSON 进浏览器包）。
 */
export function moduleOptionsFor<T extends FilterableContent>(
  units: readonly T[],
  unit: UnitFilter
): string[] {
  const pool = filterStandardContent(units, unit, "all");
  const seen: string[] = [];
  for (const u of pool) {
    if (u.moduleKind != null && !seen.includes(u.moduleKind)) {
      seen.push(u.moduleKind);
    }
  }
  return seen;
}
