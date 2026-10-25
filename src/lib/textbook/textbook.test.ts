import { describe, it, expect } from "vitest";
import { getTextbookModule, parseTextbook, textbook } from "./textbook";

/** 构造一份最小合法教材数据，供坏数据用例在其上做破坏。 */
function validData(): ReturnType<typeof parseTextbook> {
  return parseTextbook({
    schemaVersion: 1,
    textbook: {
      id: "grade5a",
      series: "沪教版（五·四学制）英语",
      title: "五年级上册",
      source: "教材 PDF",
      pageOffset: 5,
      extractedAt: "2026-10-25",
    },
    units: [
      {
        unitId: "五上-U1",
        index: 1,
        title: "Clubs in our school",
        modules: [
          {
            moduleKind: "Talking time",
            title: "It's good to join clubs",
            sourcePages: "p12",
            sentences: ["Good idea."],
            needsReview: [],
            notes: [],
          },
        ],
      },
    ],
  });
}

describe("教材原文产物（content/textbook/grade5a.json）", () => {
  it("加载时通过 schema 校验，覆盖五上全部 10 个单元", () => {
    expect(textbook.schemaVersion).toBe(1);
    expect(textbook.units.map((u) => u.unitId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `五上-U${i + 1}`),
    );
  });

  it("每个单元都有 Talking time 与阅读类栏目，句子非空", () => {
    for (const unit of textbook.units) {
      const kinds = unit.modules.map((m) => m.moduleKind);
      expect(kinds, `${unit.unitId} 缺 Talking time`).toContain("Talking time");
      expect(
        kinds.some((k) => ["Story time", "Reading time"].includes(k)),
        `${unit.unitId} 缺 Story/Reading time`,
      ).toBe(true);
      for (const module of unit.modules) {
        expect(module.sentences.length, `${unit.unitId} ${module.moduleKind}`).toBeGreaterThan(0);
      }
    }
  });

  it("U3 Chant time 与已验收的 V0.1 内容包句子一致（权威性交叉验证）", () => {
    const chant = getTextbookModule("五上-U3", "Chant time");
    expect(chant?.sentences[0]).toBe(
      "The roots hold the plant in place, and take in food and water.",
    );
    expect(chant?.sentences).toHaveLength(5);
  });

  it("标记 needsReview 的句子是引语边界拼接等待人工复核项", () => {
    const flagged = textbook.units.flatMap((u) =>
      u.modules.filter((m) => m.needsReview.length > 0),
    );
    expect(flagged.length).toBeGreaterThan(0);
    for (const module of flagged) {
      for (const i of module.needsReview) {
        expect(module.sentences[i]).toBeDefined();
      }
    }
  });
});

describe("getTextbookModule", () => {
  it("按单元 slug 与栏目原名命中，返回钉死的返回形态", () => {
    const result = getTextbookModule("五上-U2", "Story time");
    expect(result).toBeDefined();
    expect(result!.unitId).toBe("五上-U2");
    expect(result!.moduleKind).toBe("Story time");
    expect(result!.sentences[0]).toBe(
      "The students in the dragon dance team are training hard for the coming garden party.",
    );
    expect(Object.keys(result!).sort()).toEqual([
      "moduleKind",
      "sentences",
      "unitId",
    ]);
  });

  it("栏目名用教材印刷原名（Reading time 与 Story time 是不同栏目）", () => {
    expect(getTextbookModule("五上-U3", "Reading time")).toBeDefined();
    expect(getTextbookModule("五上-U3", "Story time")).toBeUndefined();
  });

  it("单元或栏目未命中时返回 undefined", () => {
    expect(getTextbookModule("五上-U99", "Talking time")).toBeUndefined();
    expect(getTextbookModule("五上-U1", "Song time")).toBeUndefined();
    expect(getTextbookModule("", "")).toBeUndefined();
  });
});

describe("parseTextbook 坏数据报错", () => {
  it("非对象输入报错", () => {
    expect(() => parseTextbook("not json")).toThrow(/教材数据校验失败/);
    expect(() => parseTextbook(null)).toThrow(/教材数据校验失败/);
  });

  it("缺字段与坏枚举报错并带路径", () => {
    expect(() =>
      parseTextbook({
        schemaVersion: 1,
        textbook: { id: "x" },
        units: [],
      }),
    ).toThrow(/教材数据校验失败/);
    expect(() =>
      parseTextbook({
        ...validData(),
        schemaVersion: 2,
      }),
    ).toThrow(/schemaVersion/);
  });

  it("unitId 不符合 slug 规则报错", () => {
    const data = validData();
    (data.units[0] as { unitId: string }).unitId = "u1";
    expect(() => parseTextbook(data)).toThrow(/unitId/);
  });

  it("moduleKind 不是教材栏目原名报错", () => {
    const data = validData();
    (data.units[0].modules[0] as { moduleKind: string }).moduleKind = "Talking";
    expect(() => parseTextbook(data)).toThrow(/教材数据校验失败/);
  });

  it("空句子列表报错", () => {
    const data = validData();
    (data.units[0].modules[0] as { sentences: string[] }).sentences = [];
    expect(() => parseTextbook(data)).toThrow(/至少要有一句/);
  });

  it("needsReview 下标越界报错", () => {
    const data = validData();
    (data.units[0].modules[0] as { needsReview: number[] }).needsReview = [5];
    expect(() => parseTextbook(data)).toThrow(/needsReview 下标越界/);
  });

  it("同一单元下栏目重复报错", () => {
    const data = validData();
    data.units[0].modules.push({ ...data.units[0].modules[0] });
    expect(() => parseTextbook(data)).toThrow(/moduleKind 重复/);
  });
});
