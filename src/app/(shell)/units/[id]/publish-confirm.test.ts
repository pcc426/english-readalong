import { describe, it, expect } from "vitest";
import { publishAudienceText } from "./publish-confirm";

describe("定稿发布弹框的受众说明", () => {
  it("标准内容：所有账号可见", () => {
    const text = publishAudienceText("standard");
    expect(text).toContain("所有账号可见");
    expect(text).not.toContain("只有你自己");
  });

  it("自定义内容：只有本人可见", () => {
    const text = publishAudienceText("custom");
    expect(text).toContain("只有你自己的账号可见");
    expect(text).not.toContain("所有账号可见");
  });
});
