import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password 哈希", () => {
  it("哈希后不再是明文，且是 bcrypt 格式", async () => {
    const hash = await hashPassword("secret123");
    expect(hash).not.toBe("secret123");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("正确密码校验通过，错误密码被拒", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("secret124", hash)).toBe(false);
  });

  it("同一密码两次哈希得到不同盐（哈希值不同但仍可校验）", async () => {
    const a = await hashPassword("secret123");
    const b = await hashPassword("secret123");
    expect(a).not.toBe(b);
    expect(await verifyPassword("secret123", b)).toBe(true);
  });
});
