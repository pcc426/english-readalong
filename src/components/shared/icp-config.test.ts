import { describe, expect, it } from "vitest";
import { getIcpNumber, ICP_BEIAN_URL } from "./icp-config";

describe("getIcpNumber", () => {
  it("未配置或空白时返回 null（本地开发不渲染页脚）", () => {
    expect(getIcpNumber({})).toBeNull();
    expect(getIcpNumber({ READALONG_ICP_NUMBER: "" })).toBeNull();
    expect(getIcpNumber({ READALONG_ICP_NUMBER: "   " })).toBeNull();
  });

  it("返回去空白后的备案号原文", () => {
    expect(
      getIcpNumber({ READALONG_ICP_NUMBER: " 沪ICP备2026061963号-1 " })
    ).toBe("沪ICP备2026061963号-1");
  });

  it("默认从 process.env 读取", () => {
    const prev = process.env.READALONG_ICP_NUMBER;
    process.env.READALONG_ICP_NUMBER = "沪ICP备2026061963号-1";
    try {
      expect(getIcpNumber()).toBe("沪ICP备2026061963号-1");
    } finally {
      if (prev === undefined) delete process.env.READALONG_ICP_NUMBER;
      else process.env.READALONG_ICP_NUMBER = prev;
    }
  });
});

describe("ICP_BEIAN_URL", () => {
  it("指向工信部备案系统", () => {
    expect(ICP_BEIAN_URL).toBe("https://beian.miit.gov.cn/");
  });
});
