import { describe, expect, it } from "vitest";
import { buildEnumTitle, buildStandardTitles } from "./title";

describe("buildEnumTitle（枚举串生成器）", () => {
  it("票面钉死样例：沪教版五上-Unit2-Story time-7句", () => {
    expect(
      buildEnumTitle({
        seriesShortName: "沪教版",
        bookShortName: "五上",
        unitIndex: 2,
        moduleKind: "Story time",
        sentenceCount: 7,
      }),
    ).toBe("沪教版五上-Unit2-Story time-7句");
  });

  it("两位数单元号不补零：Unit10", () => {
    expect(
      buildEnumTitle({
        seriesShortName: "沪教版",
        bookShortName: "五上",
        unitIndex: 10,
        moduleKind: "Song time",
        sentenceCount: 6,
      }),
    ).toBe("沪教版五上-Unit10-Song time-6句");
  });

  it("栏目用教材印刷原名，不归一化（Chant time 不被改写）", () => {
    expect(
      buildEnumTitle({
        seriesShortName: "沪教版",
        bookShortName: "五上",
        unitIndex: 3,
        moduleKind: "Chant time",
        sentenceCount: 5,
      }),
    ).toBe("沪教版五上-Unit3-Chant time-5句");
  });

  it("六种栏目印刷名原样进串（Rhyme time 含空格照拼）", () => {
    for (const moduleKind of [
      "Talking time",
      "Reading time",
      "Rhyme time",
    ] as const) {
      expect(
        buildEnumTitle({
          seriesShortName: "沪教版",
          bookShortName: "五上",
          unitIndex: 1,
          moduleKind,
          sentenceCount: 1,
        }),
      ).toBe(`沪教版五上-Unit1-${moduleKind}-1句`);
    }
  });

  it("句数来自草稿实际确认句数，原样拼接", () => {
    expect(
      buildEnumTitle({
        seriesShortName: "沪教版",
        bookShortName: "五上",
        unitIndex: 5,
        moduleKind: "Talking time",
        sentenceCount: 19,
      }),
    ).toBe("沪教版五上-Unit5-Talking time-19句");
  });
});

describe("buildStandardTitles（主标题 + 枚举串）", () => {
  it("主标题＝课文名（module.title）原样，不做改写", () => {
    const titles = buildStandardTitles({
      lessonTitle: "The dragon dance",
      seriesShortName: "沪教版",
      bookShortName: "五上",
      unitIndex: 2,
      moduleKind: "Story time",
      sentenceCount: 7,
    });
    expect(titles.mainTitle).toBe("The dragon dance");
    expect(titles.enumTitle).toBe("沪教版五上-Unit2-Story time-7句");
  });
});
