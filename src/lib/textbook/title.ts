// 标准内容标题生成器（票 02）：主标题＝课文名（教材 JSON 的 module.title），
// 枚举串＝`${series.shortName}${book.shortName}-Unit${index}-${moduleKind}-${n}句`
// （例：沪教版五上-Unit2-Story time-7句），分隔符是半角 -。
// n 来自草稿实际 confirmed 句数（校对/定稿阶段都可算），制作表单预览时
// 用教材模块句数占位（校对可增删句，以确认后为准）。
//
// 纯函数、零依赖：服务端（草稿/定稿链路）与客户端（制作表单预览）共用，
// 不 import 教材数据本身，保证客户端组件引用它不会把教材 JSON 打进浏览器包。

/** 生成枚举串所需的最小字段（series/book 简称来自教材注册表） */
export interface EnumTitleParts {
  seriesShortName: string;
  bookShortName: string;
  unitIndex: number;
  moduleKind: string;
  sentenceCount: number;
}

/** 拼标准内容的枚举串，如「沪教版五上-Unit2-Story time-7句」。 */
export function buildEnumTitle(parts: EnumTitleParts): string {
  return `${parts.seriesShortName}${parts.bookShortName}-Unit${parts.unitIndex}-${parts.moduleKind}-${parts.sentenceCount}句`;
}

/** 标准内容的一对标题：主标题（课文名）+ 枚举串（卡片/练习页副标题）。 */
export interface StandardTitles {
  mainTitle: string;
  enumTitle: string;
}

/** 主标题＝课文名（module.title）原样，不做归一改写；枚举串见 buildEnumTitle。 */
export function buildStandardTitles(
  input: EnumTitleParts & { lessonTitle: string },
): StandardTitles {
  return {
    mainTitle: input.lessonTitle,
    enumTitle: buildEnumTitle(input),
  };
}
