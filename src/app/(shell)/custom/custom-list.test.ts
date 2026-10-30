import { describe, expect, it } from "vitest";
import { parseTabParam, tabOfStatus, sortByCreatedDesc, type CustomTab } from "./custom-list";

describe("parseTabParam（?tab= → 默认 tab，票 06）", () => {
  it("?tab=making 打开「制作中」（上传成功跳回带此参，票 07）", () => {
    expect(parseTabParam("making")).toBe<CustomTab>("making");
  });

  it("缺参、?tab=ready、其他值一律默认「可练习」", () => {
    expect(parseTabParam(null)).toBe<CustomTab>("ready");
    expect(parseTabParam("ready")).toBe<CustomTab>("ready");
    expect(parseTabParam("bogus")).toBe<CustomTab>("ready");
  });
});

describe("tabOfStatus（tab 归属，票 06）", () => {
  it("published 归「可练习」；proofreading/transcribing 归「制作中」", () => {
    expect(tabOfStatus("published")).toBe<CustomTab>("ready");
    expect(tabOfStatus("proofreading")).toBe<CustomTab>("making");
    expect(tabOfStatus("transcribing")).toBe<CustomTab>("making");
  });
});

describe("sortByCreatedDesc（制作中按创建时间倒排，新上传卡在第一位）", () => {
  it("新创建的排前面；createdAt 相同时保持原相对顺序（稳定）", () => {
    const items = [
      { id: "old", createdAt: "2026-01-01 08:00:00" },
      { id: "newest", createdAt: "2026-03-01 08:00:00" },
      { id: "same-a", createdAt: "2026-02-01 08:00:00" },
      { id: "same-b", createdAt: "2026-02-01 08:00:00" },
    ];
    expect(sortByCreatedDesc(items).map((i) => i.id)).toEqual([
      "newest",
      "same-a",
      "same-b",
      "old",
    ]);
  });

  it("空列表返回空列表", () => {
    expect(sortByCreatedDesc([])).toEqual([]);
  });
});
