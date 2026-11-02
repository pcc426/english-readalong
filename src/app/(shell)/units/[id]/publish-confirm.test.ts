import { describe, it, expect } from "vitest";
import { publishConfirmText } from "./publish-confirm";

describe("定稿发布确认文案", () => {
  it("标准内容：所有账号可见", () => {
    const text = publishConfirmText("standard", "The dragon dance");
    expect(text).toContain("所有账号可见");
    expect(text).not.toContain("只有你自己");
    expect(text).toContain("The dragon dance");
  });

  it("自定义内容：只有本人可见", () => {
    const text = publishConfirmText("custom", "Peppa Pig");
    expect(text).toContain("只有你自己的账号可见");
    expect(text).not.toContain("所有账号可见");
  });
});
