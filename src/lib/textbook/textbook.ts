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

/** 按注册 id 取某册课文数据；未注册返回 undefined。 */
export function findBookData(bookId: string): TextbookData | undefined {
  return registeredBooks.find((b) => b.book.id === bookId)?.data;
}

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

/** 按单元 slug 与栏目原名在注册表各册中定位模块（册简称在 unitId 前缀里）。 */
function locateModule(
  unitId: string,
  moduleKind: string,
): { unit: TextbookUnit; module: TextbookModule } | undefined {
  for (const { data } of registeredBooks) {
    const unit = data.units.find((u) => u.unitId === unitId);
    const module = unit?.modules.find((m) => m.moduleKind === moduleKind);
    if (unit && module) return { unit, module };
  }
  return undefined;
}

/**
 * 按单元 slug 与栏目原名查课文句子。
 * unitId 形如「五上-U2」，moduleKind 是教材印刷栏目名（如 "Talking time"），
 * 规则见 schema.ts 头注释。未命中返回 undefined。
 */
export function getTextbookModule(
  unitId: string,
  moduleKind: string,
): TextbookModuleRef | undefined {
  const found = locateModule(unitId, moduleKind);
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
  const found = locateModule(unitId, moduleKind);
  if (!found) return undefined;
  return {
    unitId: found.unit.unitId,
    unitIndex: found.unit.index,
    moduleKind: found.module.moduleKind,
    lessonTitle: found.module.title,
    sentences: found.module.sentences,
  };
}
