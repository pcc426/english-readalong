// 标准内容的枚举副标题（票 03，spec 决策 15）：由内容包自带的教材归属字段
// 拼出「沪教版五上-Unit2-Story time-7句」。句数不持久化，按包实际句子数运行时算
// （校对增删句后枚举串随之更新）。与票 02 的标题生成器共用 buildEnumTitle 实现。
//
// 教材匹配下沉到 textbook/：book→unit→module 的查找与标题/排序共用
// locateModuleByAttribution / locateModuleBySlug，不再各自遍历注册表。
//
// 服务端专用（要查教材注册表）：视图层把拼好的副标题随 API 下发，
// 客户端组件不 import 本模块，避免教材 JSON 进浏览器包。
// 返回 null = 该包没有可用归属（custom 包、未迁移老包、注册表查不到），
// 调用方回退 sourceLabel 文案（spec 决策 16：自定义内容不带枚举串）。
import { buildEnumTitle } from "./title";
import {
  locateModuleByAttribution,
  locateModuleBySlug,
  series,
} from "./textbook";

/** 枚举副标题所需的最小输入：内容包上的归属字段 + 是否为标准内容 + 实际句数。
 * 用最小结构而非 ContentPack，避免 textbook/ 反向依赖 content/schema。 */
export interface StandardEnumSubtitleSource {
  type?: "standard" | "custom";
  seriesCode?: string;
  bookId?: string;
  unitNo?: number;
  moduleKind?: string;
  sentences: readonly unknown[];
}

export function standardEnumSubtitle(
  pack: StandardEnumSubtitleSource
): string | null {
  if ((pack.type ?? "standard") !== "standard") return null;
  const found = locateModuleByAttribution(pack);
  if (!found) return null;
  return buildEnumTitle({
    seriesShortName: series.shortName,
    bookShortName: found.book.shortName,
    unitIndex: found.unit.index,
    moduleKind: found.module.moduleKind,
    sentenceCount: pack.sentences.length,
  });
}

/**
 * 草稿视角的枚举串（预览页用）：标准草稿只有 unitId/moduleKind 引用
 * （票 12），没有落包的 seriesCode/bookId/unitNo——按 slug 定位注册表后拼串。
 * 句数传校对的当前句数。查不到返回 null（界面回退 sourceLabel）。
 */
export function standardEnumSubtitleForModule(
  unitId: string,
  moduleKind: string,
  sentenceCount: number
): string | null {
  const found = locateModuleBySlug(unitId, moduleKind);
  if (!found) return null;
  return buildEnumTitle({
    seriesShortName: series.shortName,
    bookShortName: found.book.shortName,
    unitIndex: found.unit.index,
    moduleKind: found.module.moduleKind,
    sentenceCount,
  });
}
