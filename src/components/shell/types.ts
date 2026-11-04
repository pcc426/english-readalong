// 壳内流转的账号形状：来自 GET /api/auth/me 的响应体。
// 壳只走 HTTP、不 import src/lib/**，故在这里独立声明。
export interface Account {
  id: string;
  email: string;
  isAdmin: boolean;
  /** 能否看到「教材内容」（v0.3.6）：管理员恒为 true，其余账号看全局开关 */
  standardContentVisible: boolean;
}
