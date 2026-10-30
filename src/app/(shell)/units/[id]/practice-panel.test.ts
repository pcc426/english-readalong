import { describe, expect, it } from "vitest";
import { cellStars, replayControl } from "./practice-panel";

describe("replayControl（播放控制排中间按钮）", () => {
  it("录音态：重播示范改名为「再播一遍」，可点击且非播放中＝高亮黄", () => {
    expect(replayControl("recording", false)).toEqual({
      label: "🔁 再播一遍",
      highlight: true,
    });
  });

  it("播放中：显示「⏸ 暂停」，深灰不高亮", () => {
    expect(replayControl("playing", false)).toEqual({
      label: "⏸ 暂停",
      highlight: false,
    });
  });

  it("播放中被暂停：显示「▶ 继续」，可点击且非播放中＝高亮黄", () => {
    expect(replayControl("playing", true)).toEqual({
      label: "▶ 继续",
      highlight: true,
    });
  });

  it("禁用状态（idle/submitting/scored/finished）：文案沿用现状、维持深灰", () => {
    expect(replayControl("idle", true)).toEqual({ label: "▶ 继续", highlight: false });
    expect(replayControl("submitting", false)).toEqual({ label: "⏸ 暂停", highlight: false });
    expect(replayControl("scored", true)).toEqual({ label: "▶ 继续", highlight: false });
    expect(replayControl("finished", true)).toEqual({ label: "▶ 继续", highlight: false });
  });
});

describe("cellStars（句格序号下方小字）", () => {
  it("练过：显示最佳星级 ★×n", () => {
    expect(cellStars(3)).toEqual({ text: "★×3", learned: true });
    expect(cellStars(1)).toEqual({ text: "★×1", learned: true });
  });

  it("没练过：显示「未练」", () => {
    expect(cellStars(null)).toEqual({ text: "未练", learned: false });
  });
});
