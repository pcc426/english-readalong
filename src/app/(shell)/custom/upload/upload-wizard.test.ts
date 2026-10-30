import { describe, expect, it } from "vitest";
import {
  STEP_TITLES,
  canGoNext,
  goNext,
  goPrev,
  submitBlocker,
  type WizardStep,
} from "./upload-wizard";

function file(name = "peppa.mp4"): File {
  return new File(["x"], name, { type: "video/mp4" });
}

const DONE: { file: File | null; title: string } = {
  file: file(),
  title: "Peppa Pig S1E1",
};

describe("STEP_TITLES（步骤指示条，票 07）", () => {
  it("三步：选择视频 → 填写标题 → 开始转写", () => {
    expect([...STEP_TITLES]).toEqual(["选择视频", "填写标题", "开始转写"]);
  });
});

describe("canGoNext（下一步可用性，票 07）", () => {
  it("步骤 1：未选视频不能下一步，选了才能", () => {
    expect(canGoNext(0, { file: null, title: "" })).toBe(false);
    expect(canGoNext(0, { file: file(), title: "" })).toBe(true);
  });

  it("步骤 2：标题为空或纯空白不能下一步（沿用现有非空校验）", () => {
    expect(canGoNext(1, DONE)).toBe(true);
    expect(canGoNext(1, { ...DONE, title: "" })).toBe(false);
    expect(canGoNext(1, { ...DONE, title: "   " })).toBe(false);
  });

  it("步骤 3 没有「下一步」（只有提交）", () => {
    expect(canGoNext(2, DONE)).toBe(false);
  });
});

describe("goNext / goPrev（步骤流转）", () => {
  it("条件满足依次前进，最后一步不再前进", () => {
    expect(goNext(0, DONE)).toBe<WizardStep>(1);
    expect(goNext(1, DONE)).toBe<WizardStep>(2);
    expect(goNext(2, DONE)).toBe<WizardStep>(2);
  });

  it("条件不满足原地不动（按钮置灰之外的确定性兜底）", () => {
    expect(goNext(0, { file: null, title: "" })).toBe<WizardStep>(0);
    expect(goNext(1, { ...DONE, title: "" })).toBe<WizardStep>(1);
  });

  it("上一步逐级回退，第一步原地不动", () => {
    expect(goPrev(2)).toBe<WizardStep>(1);
    expect(goPrev(1)).toBe<WizardStep>(0);
    expect(goPrev(0)).toBe<WizardStep>(0);
  });
});

describe("submitBlocker（步骤 3 提交前校验，文案沿用原表单）", () => {
  it("文件与标题齐备时放行", () => {
    expect(submitBlocker(DONE)).toBeNull();
  });

  it("缺文件提示先选视频", () => {
    expect(submitBlocker({ ...DONE, file: null })).toBe("请选择要上传的视频文件");
  });

  it("标题为空/纯空白提示起标题", () => {
    expect(submitBlocker({ ...DONE, title: "" })).toBe("请先给内容起个标题");
    expect(submitBlocker({ ...DONE, title: " 　 " })).toBe(
      "请先给内容起个标题"
    );
  });
});
