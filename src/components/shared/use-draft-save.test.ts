import { describe, expect, it } from "vitest";
import { settleStateAfterSave } from "./use-draft-save";
import type { DraftSentenceView } from "@/components/proofread/types";

function sentenceWith(proofread: string): DraftSentenceView {
  return { index: 0, text: "Hello", startMs: 0, endMs: 1000, proofread };
}

describe("settleStateAfterSave（PUT 成功后的常驻落定态，票 v03-10）", () => {
  it("服务端返回 confirmed（确认本句/本来就未改动）：saved，常驻不再定时清除", () => {
    expect(settleStateAfterSave(sentenceWith("confirmed"))).toBe("saved");
  });

  it("服务端打回 edited（已确认句被改/未确认句保存）：needs-reconfirm 提示重新确认", () => {
    expect(settleStateAfterSave(sentenceWith("edited"))).toBe("needs-reconfirm");
  });

  it("SAVED_HINT_MS 定时消失逻辑已删除（saved 不再 1.5s 自动清掉）", async () => {
    const mod = await import("./use-draft-save");
    // @ts-expect-error 导出已删除；若有人重新加回，此处的 expect-error 会反过来报错
    expect(mod.SAVED_HINT_MS).toBeUndefined();
  });
});
