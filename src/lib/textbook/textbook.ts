import textbookJson from "../../../content/textbook/grade5a.json";
import { parseTextbook, type TextbookData } from "./schema";

export type {
  TextbookData,
  TextbookModule,
  TextbookUnit,
} from "./schema";
export { MODULE_KINDS, parseTextbook } from "./schema";

/**
 * 教材原文数据（构建期常量）。模块加载时即做 schema 校验：
 * 产物 JSON 损坏会在启动/构建阶段报错，而不是等到运行时。
 */
export const textbook: TextbookData = parseTextbook(textbookJson);

/** 查询结果：一个单元模块的课文句子（12 号票校对页预填用）。 */
export interface TextbookModuleRef {
  unitId: string;
  moduleKind: string;
  sentences: string[];
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
  const unit = textbook.units.find((u) => u.unitId === unitId);
  const module = unit?.modules.find((m) => m.moduleKind === moduleKind);
  if (!unit || !module) return undefined;
  return {
    unitId: unit.unitId,
    moduleKind: module.moduleKind,
    sentences: module.sentences,
  };
}
