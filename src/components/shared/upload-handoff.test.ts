// 上传页 → 列表页的交接提示（V0.4.2）：100% 就跳回列表时草稿可能还没建好，
// 列表页据这条提示在短窗口内继续轮询。这里定提示的时间口径。
import { describe, expect, it } from "vitest";
import {
  UPLOAD_HINT_TTL_MS,
  markUploadStarted,
  readUploadHint,
} from "./upload-handoff";

function fakeStore(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe("上传交接提示", () => {
  it("刚上传过：列表页应该继续短时轮询", () => {
    const store = fakeStore();
    markUploadStarted(1_000, store);
    expect(readUploadHint(2_000, store)).toBe(true);
  });

  it("超出有效期（30s）：当作上一次遗留的提示忽略", () => {
    const store = fakeStore();
    markUploadStarted(1_000, store);
    expect(readUploadHint(1_000 + UPLOAD_HINT_TTL_MS, store)).toBe(false);
  });

  it("没有提示：不额外轮询", () => {
    expect(readUploadHint(5_000, fakeStore())).toBe(false);
  });

  it("浏览器不给 storage（隐私模式）：静默降级为不轮询", () => {
    expect(readUploadHint(5_000, null)).toBe(false);
    expect(() => markUploadStarted(5_000, null)).not.toThrow();
  });
});
