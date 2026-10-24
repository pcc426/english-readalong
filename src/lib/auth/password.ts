// 密码哈希：bcrypt 算法（ADR-0003）。用 bcryptjs 纯 JS 实现，免去原生编译依赖。
// 同步接口：cost 10 约 80ms，单进程小流量下可接受，换来简单的签名
// （createAccount 是同步契约，02 号票的管理页也直接复用）。
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}
