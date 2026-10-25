import { describe, it, expect, afterEach } from "vitest";
import {
  createDurationProbe,
  getDurationProbe,
  setDurationProbe,
} from "./probe";

afterEach(() => setDurationProbe(null));

describe("createDurationProbe", () => {
  it("ffprobe 输出的秒数解析为毫秒（进位取整）", async () => {
    const probe = createDurationProbe(async () => "42.567\n");
    expect(await probe("/tmp/v.mp4")).toBe(42_567);
  });

  it("四舍五入到整毫秒，整数秒也成立", async () => {
    const probe = createDurationProbe(async () => "300.000000\n");
    expect(await probe("/tmp/v.mp4")).toBe(300_000);
  });

  it("ffprobe 失败（未安装/文件无效）返回 null：本机没有 ffprobe 时上传链路照常可走", async () => {
    const probe = createDurationProbe(async () => {
      throw new Error("spawn ffprobe ENOENT");
    });
    expect(await probe("/tmp/v.mp4")).toBeNull();
  });

  it("输出不是数字（损坏文件）返回 null，负数同样视为无效", async () => {
    expect(
      await createDurationProbe(async () => "N/A\n")("/tmp/v.mp4")
    ).toBeNull();
    expect(
      await createDurationProbe(async () => "-3.2\n")("/tmp/v.mp4")
    ).toBeNull();
  });
});

describe("getDurationProbe / setDurationProbe", () => {
  it("注入优先于默认实现，传 null 恢复默认", async () => {
    const stub = async () => 12_345;
    setDurationProbe(stub);
    expect(await getDurationProbe()("/x.mp4")).toBe(12_345);
    setDurationProbe(null);
    // 默认实现是真实 ffprobe 包装：拿到一个函数即可（不在这断言执行结果，
    // 是否装了 ffprobe 属于环境差异）
    expect(typeof getDurationProbe()).toBe("function");
  });
});
