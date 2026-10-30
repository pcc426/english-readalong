import { describe, it, expect } from "vitest";
import {
  compareStandardPacks,
  findBookData,
  findTextbookModuleDetail,
  getTextbookModule,
  parseTextbook,
  registeredBooks,
  series,
  textbookPackAttribution,
} from "./textbook";

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
  it("从注册表加载并校验，覆盖五上全部 10 个单元", () => {
    const grade5a = findBookData("grade5a");
    expect(grade5a).toBeDefined();
    expect(grade5a!.schemaVersion).toBe(1);
    expect(grade5a!.units.map((u) => u.unitId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `五上-U${i + 1}`),
    );
  });

  it("注册表带版本与册别元信息，解析后的书与注册一一对应", () => {
    expect(series.code).toBe("sh-jiaoban-new");
    expect(registeredBooks).toHaveLength(1);
    expect(registeredBooks[0].book.id).toBe("grade5a");
    expect(registeredBooks[0].data.textbook.id).toBe("grade5a");
  });

  it("每个单元都有 Talking time 与阅读类栏目，句子非空", () => {
    for (const { data } of registeredBooks) {
      for (const unit of data.units) {
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
    const flagged = registeredBooks.flatMap(({ data }) =>
      data.units.flatMap((u) =>
        u.modules.filter((m) => m.needsReview.length > 0),
      ),
    );
    expect(flagged.length).toBeGreaterThan(0);
    for (const module of flagged) {
      for (const i of module.needsReview) {
        expect(module.sentences[i]).toBeDefined();
      }
    }
  });
});

describe("findTextbookModuleDetail（服务端制作链路用，票 02）", () => {
  it("命中时带回课文名（主标题）、单元序号与册别，供服务端生成草稿标题", () => {
    const detail = findTextbookModuleDetail("五上-U2", "Story time");
    expect(detail).toBeDefined();
    expect(detail!.lessonTitle).toBe("The dragon dance");
    expect(detail!.unitIndex).toBe(2);
    expect(detail!.unitId).toBe("五上-U2");
    expect(detail!.moduleKind).toBe("Story time");
    expect(detail!.sentences[0]).toBe(
      "The students in the dragon dance team are training hard for the coming garden party.",
    );
  });

  it("单元或栏目未命中时返回 undefined", () => {
    expect(findTextbookModuleDetail("五上-U99", "Story time")).toBeUndefined();
    expect(findTextbookModuleDetail("五上-U2", "Nope time")).toBeUndefined();
    expect(findTextbookModuleDetail("", "")).toBeUndefined();
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

describe("textbookPackAttribution（定稿落内容包归属字段，票 03）", () => {
  it("按草稿的 unitId/moduleKind 反查注册表，带回版本/书/单元号/课文名", () => {
    expect(textbookPackAttribution("五上-U2", "Story time")).toEqual({
      seriesCode: "sh-jiaoban-new",
      bookId: "grade5a",
      unitNo: 2,
      moduleKind: "Story time",
      lessonTitle: "The dragon dance",
    });
    expect(textbookPackAttribution("五上-U3", "Chant time")).toMatchObject({
      unitNo: 3,
      lessonTitle: "Parts of plants",
    });
  });

  it("单元或栏目未命中时返回 undefined（草稿引用坏了要显式暴露）", () => {
    expect(textbookPackAttribution("五上-U99", "Story time")).toBeUndefined();
    expect(textbookPackAttribution("五上-U3", "Story time")).toBeUndefined();
  });
});

describe("compareStandardPacks（教材列表默认排序，票 03）", () => {
  const attr = (
    unitNo: number,
    moduleKind: string,
    bookId = "grade5a",
    seriesCode = "sh-jiaoban-new",
  ) => ({ seriesCode, bookId, unitNo, moduleKind });

  it("按 单元序号 → 模块在教材 JSON 中的顺序 排（不是字母序：U1 Talking 在 Story 前）", () => {
    const input = [
      attr(3, "Reading time"),
      attr(1, "Story time"),
      attr(3, "Chant time"),
      attr(2, "Talking time"),
      attr(1, "Talking time"),
    ];
    const sorted = [...input].sort(compareStandardPacks);
    expect(sorted.map((p) => `${p.unitNo}-${p.moduleKind}`)).toEqual([
      "1-Talking time",
      "1-Story time",
      "2-Talking time",
      "3-Chant time",
      "3-Reading time",
    ]);
  });

  it("同册内按单元序号排；比较对相同归属自反（grade/term 维度随注册表扩册生效）", () => {
    // 注册表当前只有 grade5a；用字段不同的假包验证比较维度不会串序
    const a = attr(1, "Talking time");
    const b = attr(2, "Talking time");
    expect(compareStandardPacks(a, b)).toBeLessThan(0);
    expect(compareStandardPacks(b, a)).toBeGreaterThan(0);
    expect(compareStandardPacks(a, a)).toBe(0);
  });

  it("归属字段不全或注册表查不到的包沉底，彼此保持原序（稳定）", () => {
    const noFields = {};
    const partial = attr(2, "Talking time");
    delete (partial as Partial<typeof partial>).moduleKind;
    const unknownBook = attr(1, "Talking time", "grade6a");
    const u1 = attr(1, "Talking time");
    const u3 = attr(3, "Chant time");
    const input = [noFields, u1, unknownBook, partial, u3];
    const sorted = [...input].sort(compareStandardPacks);
    expect(sorted.slice(0, 2)).toEqual([u1, u3]);
    // 沉底组保持输入相对顺序（稳定排序）
    expect(sorted.slice(2)).toEqual([noFields, unknownBook, partial]);
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

  it("枚举外新栏目报错信息明确指向 MODULE_KINDS（提示补枚举，票 02）", () => {
    const data = validData();
    (data.units[0].modules[0] as { moduleKind: string }).moduleKind =
      "Word time";
    expect(() => parseTextbook(data)).toThrow(/MODULE_KINDS/);
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
