// 标准内容的枚举副标题（票 03，spec 决策 15）：由内容包自带的教材归属字段
// 拼出「沪教版五上-Unit2-Story time-7句」。句数不持久化，按包实际句子数运行时算
// （校对增删句后枚举串随之更新）。与票 02 的标题生成器共用 buildEnumTitle 实现。
//
// 服务端专用（要查教材注册表）：视图层把拼好的副标题随 API 下发，
// 客户端组件不 import 本模块，避免教材 JSON 进浏览器包。
// 返回 null = 该包没有可用归属（custom 包、未迁移老包、注册表查不到），
// 调用方回退 sourceLabel 文案（spec 决策 16：自定义内容不带枚举串）。
import { buildEnumTitle } from "@/lib/textbook/title";
import { registeredBooks, series } from "@/lib/textbook/textbook";
import type { ContentPack } from "./schema";

export function standardEnumSubtitle(pack: ContentPack): string | null {
  if ((pack.type ?? "standard") !== "standard") return null;
  const { seriesCode, bookId, unitNo, moduleKind } = pack;
  if (seriesCode == null || bookId == null || unitNo == null || moduleKind == null) {
    return null;
  }
  const book = registeredBooks.find(
    (b) => b.book.id === bookId && series.code === seriesCode
  );
  const unit = book?.data.units.find((u) => u.index === unitNo);
  // 栏目必须真的在该单元里（教材 JSON 顺序/内容是归属的权威）
  if (!book || !unit || !unit.modules.some((m) => m.moduleKind === moduleKind)) {
    return null;
  }
  return buildEnumTitle({
    seriesShortName: series.shortName,
    bookShortName: book.book.shortName,
    unitIndex: unitNo,
    moduleKind,
    sentenceCount: pack.sentences.length,
  });
}
