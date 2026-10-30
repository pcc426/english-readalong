// 上传分步向导（票 07）的步骤流转/校验纯函数：与页面同目录，参照
// custom-list.ts 的模式——只做映射与判断，不承载请求/状态逻辑。
// 校验文案沿用原列表页内联表单（票 06 前的版本），逐字保持。

export type WizardStep = 0 | 1 | 2;

/** 顶部步骤指示条的编号标题（spec 决策 22：① 选择视频 ② 填写标题 ③ 开始转写） */
export const STEP_TITLES: readonly [string, string, string] = [
  "选择视频",
  "填写标题",
  "开始转写",
];

/** 向导已收集的两项输入：视频文件（步骤 1）与标题（步骤 2） */
export interface WizardInputs {
  file: File | null;
  title: string;
}

/** 「下一步」可用性：步骤 1 需已选视频，步骤 2 需非空标题（沿用现有非空校验），步骤 3 无下一步 */
export function canGoNext(step: WizardStep, inputs: WizardInputs): boolean {
  if (step === 0) return inputs.file !== null;
  if (step === 1) return inputs.title.trim().length > 0;
  return false;
}

/** 前进一步；条件不满足原地不动（按钮置灰之外的确定性兜底） */
export function goNext(step: WizardStep, inputs: WizardInputs): WizardStep {
  if (!canGoNext(step, inputs)) return step;
  return Math.min(step + 1, 2) as WizardStep;
}

/** 上一步；第一步原地不动 */
export function goPrev(step: WizardStep): WizardStep {
  return Math.max(step - 1, 0) as WizardStep;
}

/** 步骤 3 提交前的最终校验：返回首个不满足项的提示文案，放行返回 null。
 * 到得了步骤 3 通常两项都满足，这里是防跳步的兜底。 */
export function submitBlocker(inputs: WizardInputs): string | null {
  if (!inputs.title.trim()) return "请先给内容起个标题";
  if (!inputs.file) return "请选择要上传的视频文件";
  return null;
}
