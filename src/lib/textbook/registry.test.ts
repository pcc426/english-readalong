import { describe, expect, it } from "vitest";
import { books, series } from "./registry";

describe("教材注册表（票 02：版本枚举与书目）", () => {
  it("版本仅沪教版（上教新版）一项，牛津上海版旧版不出现", () => {
    expect(series).toEqual({
      code: "sh-jiaoban-new",
      shortName: "沪教版",
      display: "沪教版（上教新版）",
    });
  });

  it("当前只注册五年级上册一册，字段齐全（加书=注册+加 JSON）", () => {
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({
      id: "grade5a",
      grade: 5,
      term: "a",
      shortName: "五上",
      display: "五年级上册",
    });
    // json 是待 parseTextbook 校验的原始产物，注册表只搬运不解析
    expect(books[0].json).toMatchObject({ schemaVersion: 1 });
  });

  it("各册简称互不相同（单元 slug 与枚举串靠它区分册别）", () => {
    const shortNames = books.map((b) => b.shortName);
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });
});
