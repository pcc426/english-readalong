// 句子编辑领域逻辑（票 07）测试：只测外部行为——校验规则、落库结果、序号连续性。
// 草稿归属与 proofreading 状态门禁属 API 路由守卫，在这里不测。
import { describe, expect, it } from "vitest";
import { setupDb, sessionCookieFor } from "@/lib/testing/auth-test-utils";
import { createDraft, listDraftSentences, completeTranscription, sentenceCountsByDraft } from "./repo";
import {
  SentenceEditError,
  deleteSentence,
  insertSentenceAfter,
  mergeSentenceWithNext,
  mergeText,
  updateSentence,
} from "./sentences";

const SEED = [
  { text: "Hello!", startMs: 0, endMs: 3200 },
  { text: "My name is Danny.", startMs: 3400, endMs: 6100 },
  { text: "What is your name?", startMs: 6300, endMs: 8900 },
];

function seededDb() {
  const db = setupDb("ra-sentences");
  // content_drafts.account_id 有外键，先落一个真实账号（借测试工具建号）
  sessionCookieFor("parent@test.com");
  const accountId = (
    db.prepare("SELECT id FROM accounts LIMIT 1").get() as { id: string }
  ).id;
  const draft = createDraft(db, { accountId, title: "句子编辑" });
  completeTranscription(db, draft.id, SEED);
  return { db, draftId: draft.id };
}

function codes(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof SentenceEditError) return e.code;
    throw e;
  }
  throw new Error("预期抛出 SentenceEditError，但没有");
}

describe("updateSentence", () => {
  it("改文本：返回更新后的句子（edited）且已落库，其他字段不变", () => {
    const { db, draftId } = seededDb();

    const s = updateSentence(db, draftId, 1, { text: "My name is Danny." });

    expect(s).toEqual({
      index: 1,
      text: "My name is Danny.",
      startMs: 3400,
      endMs: 6100,
      proofread: "edited",
    });
    expect(listDraftSentences(db, draftId)[1]).toMatchObject({
      text: "My name is Danny.",
      proofread: "edited",
    });
  });

  it("confirm:true 置「已确认」，手工字段照常生效", () => {
    const { db, draftId } = seededDb();

    const s = updateSentence(db, draftId, 0, {
      text: "Hello!",
      confirm: true,
    });

    expect(s.proofread).toBe("confirmed");
  });

  it("只改时间也算手工改动：置 edited，文本不变", () => {
    const { db, draftId } = seededDb();

    const s = updateSentence(db, draftId, 0, { endMs: 3300 });

    expect(s).toEqual({
      index: 0,
      text: "Hello!",
      startMs: 0,
      endMs: 3300,
      proofread: "edited",
    });
  });

  it("只给 endMs 时 startMs 取现值；合成后 endMs<=startMs 报 SENTENCE_INVALID", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => updateSentence(db, draftId, 0, { endMs: 0 }))).toBe(
      "SENTENCE_INVALID"
    );
    // 合法对照：只给 startMs，endMs 取现值 3200 > 100
    expect(updateSentence(db, draftId, 0, { startMs: 100 }).endMs).toBe(3200);
  });

  it("空文本 / 纯空白 / 非字符串文本报 SENTENCE_INVALID", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => updateSentence(db, draftId, 0, { text: "" }))).toBe(
      "SENTENCE_INVALID"
    );
    expect(codes(() => updateSentence(db, draftId, 0, { text: "   " }))).toBe(
      "SENTENCE_INVALID"
    );
    expect(codes(() => updateSentence(db, draftId, 0, { text: 42 }))).toBe(
      "SENTENCE_INVALID"
    );
  });

  it("负数 / 浮点 / 非数字的时间报 SENTENCE_INVALID", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => updateSentence(db, draftId, 0, { startMs: -1 }))).toBe(
      "SENTENCE_INVALID"
    );
    expect(codes(() => updateSentence(db, draftId, 0, { endMs: 1.5 }))).toBe(
      "SENTENCE_INVALID"
    );
    expect(
      codes(() => updateSentence(db, draftId, 0, { startMs: "100" }))
    ).toBe("SENTENCE_INVALID");
  });

  it("confirm 非布尔报 SENTENCE_INVALID", () => {
    const { db, draftId } = seededDb();

    expect(
      codes(() => updateSentence(db, draftId, 0, { text: "Hi", confirm: "yes" }))
    ).toBe("SENTENCE_INVALID");
  });

  it("text / startMs / endMs 一个都不给报 SENTENCE_INVALID（含空对象与非法 JSON 体）", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => updateSentence(db, draftId, 0, {}))).toBe(
      "SENTENCE_INVALID"
    );
    expect(codes(() => updateSentence(db, draftId, 0, null))).toBe(
      "SENTENCE_INVALID"
    );
    expect(codes(() => updateSentence(db, draftId, 0, "text"))).toBe(
      "SENTENCE_INVALID"
    );
  });

  it("序号越界（越上界、负数）报 SENTENCE_NOT_FOUND", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => updateSentence(db, draftId, 3, { text: "x" }))).toBe(
      "SENTENCE_NOT_FOUND"
    );
    expect(codes(() => updateSentence(db, draftId, -1, { text: "x" }))).toBe(
      "SENTENCE_NOT_FOUND"
    );
  });

  it("只影响目标句：其他句子的文本与校对状态原样", () => {
    const { db, draftId } = seededDb();

    updateSentence(db, draftId, 1, { text: "改过的第 2 句" });

    const all = listDraftSentences(db, draftId);
    expect(all[0]).toEqual({
      index: 0,
      text: "Hello!",
      startMs: 0,
      endMs: 3200,
      proofread: "auto",
    });
    expect(all[2].proofread).toBe("auto");
  });
});

describe("deleteSentence", () => {
  it("删中间句：后续序号前移，返回整个句子数组，库中 seq 连续", () => {
    const { db, draftId } = seededDb();

    const rest = deleteSentence(db, draftId, 1);

    expect(rest).toEqual([
      { index: 0, text: "Hello!", startMs: 0, endMs: 3200, proofread: "auto" },
      {
        index: 1,
        text: "What is your name?",
        startMs: 6300,
        endMs: 8900,
        proofread: "auto",
      },
    ]);
    // 库中主键 (draft_id, seq) 已重排，无空洞
    const seqs = db
      .prepare("SELECT seq FROM draft_sentences WHERE draft_id = ? ORDER BY seq")
      .all(draftId) as Array<{ seq: number }>;
    expect(seqs.map((r) => r.seq)).toEqual([0, 1]);
  });

  it("删首句同样成立", () => {
    const { db, draftId } = seededDb();

    const rest = deleteSentence(db, draftId, 0);

    expect(rest.map((s) => s.text)).toEqual([
      "My name is Danny.",
      "What is your name?",
    ]);
  });

  it("仅剩一句时报 LAST_SENTENCE，句子原样保留", () => {
    const db = setupDb("ra-sentences-one");
    sessionCookieFor("parent@test.com");
    const accountId = (
      db.prepare("SELECT id FROM accounts LIMIT 1").get() as { id: string }
    ).id;
    const draft = createDraft(db, { accountId, title: "单句" });
    completeTranscription(db, draft.id, [{ text: "Only one.", startMs: 0, endMs: 1000 }]);

    expect(codes(() => deleteSentence(db, draft.id, 0))).toBe("LAST_SENTENCE");
    expect(listDraftSentences(db, draft.id)).toHaveLength(1);
  });

  it("序号越界报 SENTENCE_NOT_FOUND", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => deleteSentence(db, draftId, 9))).toBe(
      "SENTENCE_NOT_FOUND"
    );
  });
});

describe("mergeSentenceWithNext", () => {
  it("合并 0+1：文本拼接、时间取并集、置 edited，后续序号前移并返回整个数组", () => {
    const { db, draftId } = seededDb();

    const rest = mergeSentenceWithNext(db, draftId, 0);

    expect(rest).toEqual([
      {
        index: 0,
        text: "Hello! My name is Danny.",
        startMs: 0,
        endMs: 6100,
        proofread: "edited",
      },
      {
        index: 1,
        text: "What is your name?",
        startMs: 6300,
        endMs: 8900,
        proofread: "auto",
      },
    ]);
    const seqs = db
      .prepare("SELECT seq FROM draft_sentences WHERE draft_id = ? ORDER BY seq")
      .all(draftId) as Array<{ seq: number }>;
    expect(seqs.map((r) => r.seq)).toEqual([0, 1]);
  });

  it("非相邻序号也按「本句 + 下一句」合并（与分页无关）", () => {
    const { db, draftId } = seededDb();

    const rest = mergeSentenceWithNext(db, draftId, 1);

    expect(rest).toHaveLength(2);
    expect(rest[1].text).toBe("My name is Danny. What is your name?");
    expect(rest[1].startMs).toBe(3400);
    expect(rest[1].endMs).toBe(8900);
  });

  it("最后一句没有下一句：报 NO_NEXT_SENTENCE", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => mergeSentenceWithNext(db, draftId, 2))).toBe(
      "NO_NEXT_SENTENCE"
    );
  });

  it("序号越界报 SENTENCE_NOT_FOUND", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => mergeSentenceWithNext(db, draftId, 7))).toBe(
      "SENTENCE_NOT_FOUND"
    );
  });
});

describe("mergeText", () => {
  it("普通文本之间补一个空格", () => {
    expect(mergeText("Hello!", "My name is Danny.")).toBe(
      "Hello! My name is Danny."
    );
  });

  it("一侧已带边界空格时不产生双空格", () => {
    expect(mergeText("Hello ", "there")).toBe("Hello there");
    expect(mergeText("Hello", " there")).toBe("Hello there");
  });
});

describe("sentenceCountsByDraft（V0.2 整改：草稿列表批量计数）", () => {
  it("一次查询返回各草稿句数，无句草稿按 0 兜底由调用方处理", () => {
    const db = setupDb("ra-counts");
    sessionCookieFor("parent@test.com");
    const accountId = (
      db.prepare("SELECT id FROM accounts LIMIT 1").get() as { id: string }
    ).id;
    const withThree = createDraft(db, { accountId, title: "三句" });
    completeTranscription(db, withThree.id, SEED);
    const withOne = createDraft(db, { accountId, title: "一句" });
    completeTranscription(db, withOne.id, [SEED[0]]);
    const empty = createDraft(db, { accountId, title: "无句" });

    const counts = sentenceCountsByDraft(db, [withThree.id, withOne.id, empty.id]);

    expect(counts.get(withThree.id)).toBe(3);
    expect(counts.get(withOne.id)).toBe(1);
    expect(counts.has(empty.id)).toBe(false);
    // 与逐草稿 listDraftSentences 的口径一致
    expect(counts.get(withThree.id)).toBe(listDraftSentences(db, withThree.id).length);
  });

  it("空批次直接返回空映射，不发查询", () => {
    const db = setupDb("ra-counts-empty");
    expect(sentenceCountsByDraft(db, []).size).toBe(0);
  });
});

describe("insertSentenceAfter（V0.2.1 拆分长句）", () => {
  it("中间插入：新句 seq=index+1，占位时间取当前句结束到下一句开始的空隙，后续序号后移", () => {
    const { db, draftId } = seededDb();

    const sentences = insertSentenceAfter(db, draftId, 0, {
      text: "Hello, Kitty!",
    });

    expect(sentences).toHaveLength(4);
    expect(sentences[1]).toEqual({
      index: 1,
      text: "Hello, Kitty!",
      startMs: 3200, // 当前句结束
      endMs: 3400, // 下一句开始（空隙）
      proofread: "edited",
    });
    expect(sentences[2]).toMatchObject({ index: 2, text: "My name is Danny." });
    expect(sentences[3]).toMatchObject({ index: 3, text: "What is your name?" });
    // 库中无空洞
    expect(
      listDraftSentences(db, draftId).map((s) => s.index)
    ).toEqual([0, 1, 2, 3]);
  });

  it("下一句起始晚于本句结束：占位时间取两者之间的空隙", () => {
    const { db, draftId } = seededDb();

    const sentences = insertSentenceAfter(db, draftId, 0, { text: "" });

    // SEED 第 1/2 句之间有 200ms 空隙（3200 → 3400）
    expect(sentences[1]).toMatchObject({ startMs: 3200, endMs: 3400 });
  });

  it("下一句紧贴本句结束时：给 当前句结束 +250ms，允许与下一句重叠", () => {
    const { db, draftId } = seededDb();
    // 先把第 2 句起点改成与第 1 句终点紧贴
    updateSentence(db, draftId, 1, { startMs: 3200 });

    const sentences = insertSentenceAfter(db, draftId, 0, { text: "" });

    expect(sentences[1]).toMatchObject({ startMs: 3200, endMs: 3450 });
    expect(sentences[1].endMs).toBeGreaterThan(sentences[1].startMs);
  });

  it("在最后一句后插入：没有下一句，占位为 结束+250ms", () => {
    const { db, draftId } = seededDb();

    const sentences = insertSentenceAfter(db, draftId, 2, { text: "The end." });

    expect(sentences).toHaveLength(4);
    expect(sentences[3]).toEqual({
      index: 3,
      text: "The end.",
      startMs: 8900,
      endMs: 9150,
      proofread: "edited",
    });
  });

  it("缺省 text 落空串（草稿态允许，发布校验会拦）", () => {
    const { db, draftId } = seededDb();

    const sentences = insertSentenceAfter(db, draftId, 0, {});

    expect(sentences[1].text).toBe("");
  });

  it("text 非字符串报 SENTENCE_INVALID", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => insertSentenceAfter(db, draftId, 0, { text: 42 }))).toBe(
      "SENTENCE_INVALID"
    );
  });

  it("序号越界报 SENTENCE_NOT_FOUND", () => {
    const { db, draftId } = seededDb();

    expect(codes(() => insertSentenceAfter(db, draftId, 99, {}))).toBe(
      "SENTENCE_NOT_FOUND"
    );
  });
});
