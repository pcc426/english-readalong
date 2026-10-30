import { describe, expect, it } from "vitest";
import { buildPreviewDetail } from "./preview";
import type { Draft, DraftSentence } from "./repo";

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-1",
    accountId: "acc-1",
    title: "Unit test draft",
    type: "custom",
    status: "proofreading",
    videoPath: "acc-1/video.mp4",
    transcribeTaskId: null,
    transcribeError: null,
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-01 00:00:00",
    ...overrides,
  };
}

function sentence(overrides: Partial<DraftSentence> = {}): DraftSentence {
  return {
    index: 0,
    text: "Hello world.",
    startMs: 0,
    endMs: 1000,
    proofread: "confirmed",
    ...overrides,
  };
}

describe("buildPreviewDetail（票 08：草稿组装不落盘的预览内容）", () => {
  it("custom 草稿：source=custom-upload，video 走鉴权媒体路由，题目取草稿标题", () => {
    const { unit } = buildPreviewDetail(makeDraft(), [sentence()]);
    expect(unit.id).toBe("draft-1");
    expect(unit.title).toBe("Unit test draft");
    expect(unit.source).toBe("custom-upload");
    expect(unit.video).toBe("/api/media/acc-1/video.mp4");
  });

  it("standard 草稿：source=standard-upload", () => {
    const { unit } = buildPreviewDetail(makeDraft({ type: "standard" }), [sentence()]);
    expect(unit.source).toBe("standard-upload");
  });

  it("句子时间毫秒 → 0.1s 精度秒（与 finalize 换算同口径）", () => {
    const { unit } = buildPreviewDetail(makeDraft(), [
      sentence({ index: 0, startMs: 1234, endMs: 4567 }),
      sentence({ index: 1, text: "Second.", startMs: 5000, endMs: 9850 }),
    ]);
    // 1234ms→1.2s、4567ms→4.6s、9850ms→9.9s（98.5 四舍五入进位）：手工核对字面量
    expect(unit.sentences[0]).toEqual({
      index: 0,
      text: "Hello world.",
      start: 1.2,
      end: 4.6,
      bestScore: null,
      bestAt: null,
    });
    expect(unit.sentences[1].start).toBe(5);
    expect(unit.sentences[1].end).toBe(9.9);
  });

  it("预览不携带任何练习成绩：bestScore/bestAt 恒为 null", () => {
    const { unit } = buildPreviewDetail(makeDraft(), [sentence()]);
    for (const s of unit.sentences) {
      expect(s.bestScore).toBeNull();
      expect(s.bestAt).toBeNull();
    }
  });

  it("确认计数：只数 proofread=confirmed 的句子", () => {
    const { confirmedCount, unconfirmedCount, sentenceCount } = buildPreviewDetail(
      makeDraft(),
      [
        sentence({ index: 0, proofread: "confirmed" }),
        sentence({ index: 1, proofread: "edited" }),
        sentence({ index: 2, proofread: "auto" }),
      ]
    );
    expect(sentenceCount).toBe(3);
    expect(confirmedCount).toBe(1);
    expect(unconfirmedCount).toBe(2);
  });

  it("全部确认：unconfirmedCount=0（定稿按钮可用）", () => {
    const { confirmedCount, unconfirmedCount } = buildPreviewDetail(makeDraft(), [
      sentence({ index: 0 }),
      sentence({ index: 1 }),
    ]);
    expect(confirmedCount).toBe(2);
    expect(unconfirmedCount).toBe(0);
  });
});
