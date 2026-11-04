// 一次性运维脚本：重置指定账号（含管理员）的登录密码。
// 场景：管理员忘记自己的密码、无法登录后台时，在服务器本机直接改库。
// 与 /api/admin/accounts/password-reset 路由共用同一个 updatePassword（bcrypt）。
//
// 用法: npx tsx --env-file=.env scripts/reset-password.ts <邮箱> <新密码>
//       两个参数都必须给出（避免密码明文走交互回显；忘记邮箱可先查 accounts 表）。
// 注意: 密码会明文回显在终端与 shell 历史里，用完建议清一下历史（history -c）。
import { openDb, dbPath } from "../src/lib/db.ts";
import { findAccountByEmail, updatePassword } from "../src/lib/auth/accounts.ts";
import { isValidEmail, MIN_PASSWORD_LENGTH } from "../src/lib/admin/validation.ts";

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      `用法: npx tsx --env-file=.env scripts/reset-password.ts <邮箱> <新密码>\n` +
        `  新密码至少 ${MIN_PASSWORD_LENGTH} 位。密码会明文回显在终端与 shell 历史里。`
    );
    process.exit(1);
  }
  if (!isValidEmail(email)) {
    console.error("reset-password: 邮箱格式不对");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `reset-password: 新密码至少 ${MIN_PASSWORD_LENGTH} 位（当前 ${password.length} 位）`
    );
    process.exit(1);
  }

  const db = openDb(dbPath());
  try {
    const account = findAccountByEmail(db, email);
    if (!account) {
      console.error(`reset-password: 账号不存在：${email}`);
      process.exit(1);
    }
    updatePassword(db, account.id, password);
    console.log(
      `已重置 ${account.isAdmin ? "管理员" : "家长"}账号密码：${email}（id: ${account.id}）\n` +
        `现在可以直接登录。提示：若之前连续输错被临时锁定（15 分钟），` +
        `pm2 restart english-readalong 可立即清除锁定（锁定计数在内存里）。`
    );
  } finally {
    db.close();
  }
}

void main();
