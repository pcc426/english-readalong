import { describe, expect, it } from "vitest";
import {
  filterStandardContent,
  moduleOptionsFor,
  type ModuleFilter,
  type UnitFilter,
} from "./home-grid";

// 池子按 GET /api/units 默认序（教材序：单元 → 教材 JSON 模块序，票 03）；
// legacy 模拟未迁移老包（无归属字段，稳定沉底）
const POOL = [
  { id: "u2-story", unitNo: 2, moduleKind: "Story time" },
  { id: "u3-chant", unitNo: 3, moduleKind: "Chant time" },
  { id: "u3-talking", unitNo: 3, moduleKind: "Talking time" },
  { id: "u3-reading", unitNo: 3, moduleKind: "Reading time" },
  { id: "legacy", unitNo: null, moduleKind: null },
];

describe("filterStandardContent（票 05 单元/模块筛选）", () => {
  it("不筛选时原样返回（默认序＝API 返回序，页面不重排）", () => {
    expect(
      filterStandardContent(POOL, "all" as UnitFilter, "all" as ModuleFilter).map(
        (u) => u.id
      )
    ).toEqual(["u2-story", "u3-chant", "u3-talking", "u3-reading", "legacy"]);
  });

  it("选单元：只留该单元内容，保持教材序；未归属老包被滤掉", () => {
    expect(
      filterStandardContent(POOL, 3, "all" as ModuleFilter).map((u) => u.id)
    ).toEqual(["u3-chant", "u3-talking", "u3-reading"]);
  });

  it("不选单元只选模块：跨单元筛同栏目，保持教材序", () => {
    expect(
      filterStandardContent(POOL, "all" as UnitFilter, "Reading time").map(
        (u) => u.id
      )
    ).toEqual(["u3-reading"]);
  });

  it("单元＋模块同时筛选取交集", () => {
    expect(filterStandardContent(POOL, 3, "Talking time").map((u) => u.id)).toEqual([
      "u3-talking",
    ]);
    expect(filterStandardContent(POOL, 2, "Talking time")).toEqual([]);
  });

  it("筛选无结果（如没内容的单元）返回空数组，页面据此显示空态", () => {
    expect(filterStandardContent(POOL, 9, "all" as ModuleFilter)).toEqual([]);
  });
});

describe("moduleOptionsFor（模块下拉随单元联动，票 05）", () => {
  it("不选单元：选项＝池内出现过的栏目，按教材序去重", () => {
    expect(moduleOptionsFor(POOL, "all" as UnitFilter)).toEqual([
      "Story time",
      "Chant time",
      "Talking time",
      "Reading time",
    ]);
  });

  it("选单元后：只列该单元实际有内容的栏目，仍按教材序", () => {
    expect(moduleOptionsFor(POOL, 3)).toEqual([
      "Chant time",
      "Talking time",
      "Reading time",
    ]);
    expect(moduleOptionsFor(POOL, 2)).toEqual(["Story time"]);
  });

  it("所选单元还没有内容：没有栏目可选（页面只剩「全部模块」）", () => {
    expect(moduleOptionsFor(POOL, 9)).toEqual([]);
  });
});
