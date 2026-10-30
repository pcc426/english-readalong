// 教材注册表（票 02）：版本（series）与书目（books）的唯一登记处。
// 数据结构留扩展位（多版本/多册），但 V0.3 只注册沪教版（上教新版）五年级上册——
// 以后加书 = 注册一条 book + 放一份解析产物 JSON，schema/unitId 校验随注册表自动扩展。
//
// 本模块只声明数据，不 import schema/textbook（避免循环依赖）：
// schema.ts 反过来读本模块的 book.shortName 动态构建 unitId 正则，
// 教材 JSON 的解析（parseTextbook）收敛在 textbook.ts。
import grade5aJson from "../../../content/textbook/grade5a.json";

/** 教材版本。V0.3 仅「沪教版（上教新版）」一项；「牛津上海版」是旧版，不出现。 */
export interface TextbookSeries {
  /** 版本机器码，落内容包/数据库时用 */
  code: string;
  /** 枚举串前缀简称，如「沪教版」→ 沪教版五上-Unit2-… */
  shortName: string;
  /** UI 展示名 */
  display: string;
}

/** 学期：a = 第一学期（上册），b = 第二学期（下册） */
export type TextbookTerm = "a" | "b";

/** 一册教材的注册信息。json 是待校验的解析产物原文。 */
export interface TextbookBookRegistration {
  id: string;
  grade: number;
  term: TextbookTerm;
  /** 册简称：单元 slug（五上-U2）与枚举串（沪教版五上-…）的册别前缀，各册互不相同 */
  shortName: string;
  /** 学期下拉里展示的名称，如「五年级上册」 */
  display: string;
  json: unknown;
}

export const series: TextbookSeries = {
  code: "sh-jiaoban-new",
  shortName: "沪教版",
  display: "沪教版（上教新版）",
};

export const books: TextbookBookRegistration[] = [
  {
    id: "grade5a",
    grade: 5,
    term: "a",
    shortName: "五上",
    display: "五年级上册",
    json: grade5aJson,
  },
];
