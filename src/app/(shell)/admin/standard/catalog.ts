// 教材目录（V0.3.4 票 04）：从教材注册表构建 RSC props 用的目录。
// 原本在 page.tsx 里，拆分后列表页与上传页两个 server 页面共用。
import { registeredBooks, series } from "@/lib/textbook/textbook";
import type { TextbookCatalog } from "./types";

export function buildCatalog(): TextbookCatalog {
  return {
    series: { shortName: series.shortName, display: series.display },
    books: registeredBooks.map(({ book, data }) => ({
      id: book.id,
      shortName: book.shortName,
      display: book.display,
      units: data.units.map((u) => ({
        unitId: u.unitId,
        index: u.index,
        title: u.title,
        modules: u.modules.map((m) => ({
          moduleKind: m.moduleKind,
          title: m.title,
          sentenceCount: m.sentences.length,
        })),
      })),
    })),
  };
}
