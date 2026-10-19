import { describe, it, expect } from "vitest";
import { FakeScoringService } from "./fake";

describe("假评测服务", () => {
  it("按预设顺序返回分数", async () => {
    const fake = new FakeScoringService([88, 92]);
    expect((await fake.score({ text: "hello", audioWav: Buffer.alloc(0) })).score).toBe(88);
    expect((await fake.score({ text: "world", audioWav: Buffer.alloc(0) })).score).toBe(92);
  });

  it("分数用尽后抛错（防止测试悄悄失真）", async () => {
    const fake = new FakeScoringService([88]);
    await fake.score({ text: "a", audioWav: Buffer.alloc(0) });
    await expect(fake.score({ text: "b", audioWav: Buffer.alloc(0) })).rejects.toThrow();
  });

  it("支持单分数（所有调用同一分数）", async () => {
    const fake = new FakeScoringService(75);
    expect((await fake.score({ text: "a", audioWav: Buffer.alloc(0) })).score).toBe(75);
    expect((await fake.score({ text: "b", audioWav: Buffer.alloc(0) })).score).toBe(75);
  });
});
