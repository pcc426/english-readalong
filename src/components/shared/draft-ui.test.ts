// 票 09（ADR 0005）：三处发布入口（校对页末句 / custom 详情页 / 标准制作列表）
// 统一收敛为「去预览」，定稿发布只从预览页发起。此处定三处共用的同一把尺：
// 至少一句且全部 confirmed 才能进预览；unconfirmedCount 供禁用态提示复用。
import { describe, expect, it } from "vitest";
import { previewGate } from "./draft-ui";

describe("previewGate（票 09：三处发布入口统一去预览）", () => {
  it("全部确认且至少一句：可进预览，无未确认", () => {
    expect(previewGate(3, 3)).toEqual({ canPreview: true, unconfirmedCount: 0 });
  });

  it("还有未确认句：不可进预览，给出未确认数", () => {
    expect(previewGate(5, 2)).toEqual({ canPreview: false, unconfirmedCount: 3 });
  });

  it("全部未确认：不可进预览", () => {
    expect(previewGate(4, 0)).toEqual({ canPreview: false, unconfirmedCount: 4 });
  });

  it("一句都没有（custom 详情/标准列表的空草稿口径）：不可进预览", () => {
    expect(previewGate(0, 0)).toEqual({ canPreview: false, unconfirmedCount: 0 });
  });
});
