// 句子编辑领域逻辑（票 07）测试：只测外部行为——校验规则、落库结果、序号连续性。
// 草稿归属与 proofreading 状态门禁属 API 路由守卫，在这里不测。
import { describe, expect, it } from "vitest";
import { setupDb, sessionCookieFor } from "@/lib/testing/auth-test-utils";
import { createDraft, listDraftSentences, completeTranscription } from "./repo";
import {
  SentenceEditError,
  deleteSentence,
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
