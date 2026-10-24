import { describe, it, expect } from "vitest";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "./validation";

// 规则对齐 CLI（scripts/create-admin.ts）：邮箱格式 + 密码 ≥ 8 位
describe("admin 表单校验", () => {
  it(`密码下限是 ${8} 位（与 CLI 一致）`, () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("常规邮箱通过", () => {
    expect(isValidEmail("fam@test.com")).toBe(true);
    expect(isValidEmail("FAM@Test.COM")).toBe(true);
    expect(isValidEmail(" a+b@test.co ")).toBe(true);
  });

  it("缺 @、缺域名、含空白的字符串不算邮箱", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@test.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
