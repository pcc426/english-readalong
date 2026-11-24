// ICP 备案信息：环境变量解析与常量。展示组件保持薄、纯逻辑可单测（项目 UI 不做自动化测试的约定）。

export const ICP_BEIAN_URL = "https://beian.miit.gov.cn/";

export function getIcpNumber(
  env: Record<string, string | undefined> = process.env
): string | null {
  const raw = env.READALONG_ICP_NUMBER?.trim();
  return raw ? raw : null;
}
