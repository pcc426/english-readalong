// 教材原文数据（构建期常量）：从教材注册表（registry.ts）取书并逐一 schema 校验，
// 不再裸 import 单个教材 JSON（票 02）。产物 JSON 损坏或含枚举外栏目会在
// 模块加载（构建/启动）阶段报错，而不是等到运行时。
import {
  books as bookRegistrations,
  series,
  type TextbookBookRegistration,
  type TextbookSeries,
} from "./registry";
import {
  parseTextbook,
  type TextbookData,
  type TextbookModule,
  type TextbookUnit,
} from "./schema";

export type {
  TextbookData,
  TextbookModule,
  TextbookUnit,
} from "./schema";
export { MODULE_KINDS, parseTextbook } from "./schema";
export { series };
export type { TextbookBookRegistration, TextbookSeries };

/** 注册表里的一册：注册元信息 + 校验通过的课文数据 */
export interface RegisteredBook {
  book: TextbookBookRegistration;
  data: TextbookData;
}

/** 注册表内全部教材（模块加载时即校验）。 */
export const registeredBooks: RegisteredBook[] = bookRegistrations.map(
  (book) => ({ book, data: parseTextbook(book.json) }),
);

/** 查询结果：一个单元模块的课文句子（12 号票校对页预填用）。 */
export interface TextbookModuleRef {
  unitId: string;
  moduleKind: string;
  sentences: string[];
}

/** 服务端制作链路的模块引用：除句子外带回课文名与单元序号，
 * 供生成草稿标题（主标题＝课文名）与枚举串（票 02）。 */
export interface TextbookModuleDetail {
  unitId: string;
  unitIndex: number;
  moduleKind: string;
  /** 课文名（教材目录页的 module.title），草稿主标题 */
  lessonTitle: string;
  sentences: string[];
}

/**
 * 按单元 slug 与模块原名查课文句子。
 * unitId 形如「五上-U2」，moduleKind 是教材印刷模块名（如 "Talking time"），
 * 规则见 schema.ts 头注释。未命中返回 undefined。
 */
export function getTextbookModule(
  unitId: string,
  moduleKind: string,
): TextbookModuleRef | undefined {
  const found = locateModuleBySlug(unitId, moduleKind);
  if (!found) return undefined;
  return {
    unitId: found.unit.unitId,
    moduleKind: found.module.moduleKind,
    sentences: found.module.sentences,
  };
}

/** 同 getTextbookModule，另带回课文名与单元序号（上传服务生成草稿标题用）。 */
export function findTextbookModuleDetail(
  unitId: string,
  moduleKind: string,
): TextbookModuleDetail | undefined {
  const found = locateModuleBySlug(unitId, moduleKind);
  if (!found) return undefined;
  return {
    unitId: found.unit.unitId,
    unitIndex: found.unit.index,
    moduleKind: found.module.moduleKind,
    lessonTitle: found.module.title,
    sentences: found.module.sentences,
  };
}

/**
 * 内容包的教材归属字段（票 03）：定稿与迁移落包时按草稿的 unitId/moduleKind
 * 反查注册表写入。unitId 不冗余存包（可由 bookId+unitNo 推导）。
 * 注册表查不到（草稿引用坏了）返回 undefined，调用方显式暴露。
 */
export interface TextbookPackAttribution {
  seriesCode: string;
  bookId: string;
  unitNo: number;
  moduleKind: string;
  lessonTitle: string;
}

export function textbookPackAttribution(
  unitId: string,
  moduleKind: string
): TextbookPackAttribution | undefined {
  const found = locateModuleBySlug(unitId, moduleKind);
  if (!found) return undefined;
  return {
    seriesCode: series.code,
    bookId: found.book.id,
    unitNo: found.unit.index,
    moduleKind: found.module.moduleKind,
    lessonTitle: found.module.title,
  };
}

/** 参与排序的最小归属字段（内容包上的同名字段，缺省 = 未迁移老包/自定义包） */
export interface PackAttributionFields {
  seriesCode?: string;
  bookId?: string;
  unitNo?: number;
  moduleKind?: string;
}

/** 注册表定位结果：书、单元、模块及模块在该单元 modules 数组中的下标。
 * 是 book→unit→module 查找的唯一定义处——按 slug 或按包归属字段两条入口都归它。 */
export interface ModuleLocation {
  book: TextbookBookRegistration;
  unit: TextbookUnit;
  module: TextbookModule;
  /** 模块在该单元 modules 数组中的顺序（教材目录序，排序用） */
  moduleIndex: number;
}

/** 按单元 slug + 模块原名定位（unitId 已含册简称，遍历各册）。 */
export function locateModuleBySlug(
  unitId: string,
  moduleKind: string
): ModuleLocation | undefined {
  for (const { book, data } of registeredBooks) {
    const unit = data.units.find((u) => u.unitId === unitId);
    const moduleIndex =
      unit?.modules.findIndex((m) => m.moduleKind === moduleKind) ?? -1;
    if (!unit || moduleIndex < 0) continue;
    return { book, unit, module: unit.modules[moduleIndex], moduleIndex };
  }
  return undefined;
}

/** 按内容包归属字段（版本码 + 书 id + 单元号 + 模块原名）定位；字段不全/查不到返回 undefined。 */
export function locateModuleByAttribution(
  fields: PackAttributionFields
): ModuleLocation | undefined {
  const { seriesCode, bookId, unitNo, moduleKind } = fields;
  if (seriesCode == null || bookId == null || unitNo == null || moduleKind == null) {
    return undefined;
  }
  const registered = registeredBooks.find(
    (b) => b.book.id === bookId && series.code === seriesCode
  );
  const unit = registered?.data.units.find((u) => u.index === unitNo);
  const moduleIndex =
    unit?.modules.findIndex((m) => m.moduleKind === moduleKind) ?? -1;
  if (!registered || !unit || moduleIndex < 0) return undefined;
  return {
    book: registered.book,
    unit,
    module: unit.modules[moduleIndex],
    moduleIndex,
  };
}

/** 首页单元下拉的单项（票 05）：单元序号＋教材英文标题 */
export interface TextbookUnitRef {
  no: number;
  title: string;
}

/**
 * 注册教材的全部单元（票 05 单元下拉数据源）：按注册册序 × 教材目录序。
 * 服务端拼好随 API 下发（同 enum-subtitle 的约定：教材 JSON 不进浏览器包）。
 */
export function registeredUnits(): TextbookUnitRef[] {
  return registeredBooks.flatMap(({ data }) =>
    data.units.map((u) => ({ no: u.index, title: u.title }))
  );
}

/**
 * 教材列表默认排序（票 03，spec 决策 18）：seriesCode → grade → term → unitNo
 * → 模块在教材 JSON modules 数组中的顺序（不是 MODULE_KINDS 字母/声明序——
 * U1 是 Talking→Story，U3 是 Chant→Talking→Reading，以各单元的教材目录为准）。
 * 归属字段不全或注册表查不到的包沉底（比较结果恒为 0，保持原有相对顺序）。
 */
export function compareStandardPacks(
  a: PackAttributionFields,
  b: PackAttributionFields
): number {
  const ka = standardPackSortKey(a);
  const kb = standardPackSortKey(b);
  if (ka == null || kb == null) {
    // 有键的排前；两个都无键 → 0（稳定沉底）
    return ka == null && kb == null ? 0 : ka == null ? 1 : -1;
  }
  return (
    ka.seriesCode.localeCompare(kb.seriesCode) ||
    ka.grade - kb.grade ||
    ka.term.localeCompare(kb.term) ||
    ka.unitNo - kb.unitNo ||
    ka.moduleIndex - kb.moduleIndex
  );
}

interface StandardPackSortKey {
  seriesCode: string;
  grade: number;
  term: string;
  unitNo: number;
  moduleIndex: number;
}

function standardPackSortKey(
  pack: PackAttributionFields
): StandardPackSortKey | null {
  const found = locateModuleByAttribution(pack);
  if (!found) return null;
  return {
    seriesCode: pack.seriesCode!,
    grade: found.book.grade,
    term: found.book.term,
    unitNo: found.unit.index,
    moduleIndex: found.moduleIndex,
  };
}
