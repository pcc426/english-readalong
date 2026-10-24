// 管理端表单校验（票 02）：规则与 CLI 引导脚本（scripts/create-admin.ts）保持一致，
// 纯函数无服务端依赖，管理页 UI 也复用做提交前校验。
export const MIN_PASSWORD_LENGTH = 8;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}
