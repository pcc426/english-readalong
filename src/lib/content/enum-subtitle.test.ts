import { describe, expect, it } from "vitest";
import { standardEnumSubtitle } from "./enum-subtitle";
import type { ContentPack } from "./schema";

/** 带全归属字段的最小标准包（字段值取自真实注册表：五上-U2 Story time） */
function stdPack(overrides: Partial<ContentPack> = {}): ContentPack {
  return {
    id: "u2-dragon-dance",
    title: "The dragon dance",
    source: "standard-upload",
    video: "五上_U2.mp4",
    type: "standard",
    owner: null,
    seriesCode: "sh-jiaoban-new",
    bookId: "grade5a",
    unitNo: 2,
    moduleKind: "Story time",
    lessonTitle: "The dragon dance",
    sentences: [
      { text: "Stop!", start: 5, end: 6.05 },
      { text: "Let's try again.", start: 15.78, end: 17.37 },
    ],
    ...overrides,
  } as ContentPack;
}

describe("standardEnumSubtitle（卡片/练习页枚举副标题，票 03）", () => {
  it("用包内归属字段拼枚举串，句数按包实际句子数运行时算（与票 02 生成器共用实现）", () => {
    expect(standardEnumSubtitle(stdPack())).toBe(
      "沪教版五上-Unit2-Story time-2句"
    );
    expect(
      standardEnumSubtitle(
        stdPack({
          id: "u3-amazing-plants",
          unitNo: 3,
          moduleKind: "Chant time",
          lessonTitle: "Parts of plants",
          sentences: Array.from({ length: 5 }, (_, i) => ({
            text: `s${i}`,
            start: i,
            end: i + 1,
          })),
        })
      )
    ).toBe("沪教版五上-Unit3-Chant time-5句");
  });

  it("type=custom 恒返回 null（自定义内容不带枚举串，spec 决策 16）", () => {
    const custom = stdPack({
      type: "custom",
      owner: "acc-1",
    }) as ContentPack;
    expect(standardEnumSubtitle(custom)).toBeNull();
  });

  it("归属字段缺失（未迁移老包/custom）返回 null，调用方回退 sourceLabel", () => {
    for (const key of [
      "seriesCode",
      "bookId",
      "unitNo",
      "moduleKind",
    ] as const) {
      const pack = { ...stdPack() } as Record<string, unknown>;
      delete pack[key];
      expect(standardEnumSubtitle(pack as ContentPack)).toBeNull();
    }
  });

  it("字段齐但注册表查不到（未知书/单元越界/栏目不在该单元）：返回 null", () => {
    expect(
      standardEnumSubtitle(stdPack({ bookId: "grade6a" }))
    ).toBeNull();
    expect(standardEnumSubtitle(stdPack({ unitNo: 99 }))).toBeNull();
    expect(
      standardEnumSubtitle(stdPack({ unitNo: 3, moduleKind: "Story time" }))
    ).toBeNull();
  });
});
