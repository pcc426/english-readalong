import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel（内容包 source 的展示文案）", () => {
  it("上传来源换成人话，内部标记不外泄", () => {
    expect(sourceLabel("standard-upload")).toBe("教材上传");
    expect(sourceLabel("custom-upload")).toBe("自定义上传");
  });

  it("随代码教材内容包保留原出处", () => {
    expect(sourceLabel("沪教版五上 Unit 2 · Story time")).toBe(
      "沪教版五上 Unit 2 · Story time"
    );
  });
});
