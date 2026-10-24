// 壳内流转的账号形状：来自 GET /api/auth/me 的响应体。
// 壳只走 HTTP、不 import src/lib/**，故在这里独立声明。
export interface Account {
  id: string;
  email: string;
  isAdmin: boolean;
}
