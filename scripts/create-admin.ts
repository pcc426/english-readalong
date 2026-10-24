// 一次性引导脚本（票 01）：创建管理员账号。首个管理员只能由运维在本机跑
// 本脚本创建，公网没有任何自助建号入口（ADR-0003）。
// 用法: npx tsx --env-file=.env scripts/create-admin.ts <邮箱> <密码>
//       缺参时进入交互输入。邮箱重复时报错退出（exit 1）。
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { openDb } from "../src/lib/db.ts";
import { dbPath } from "../src/lib/units.ts";
import {
  createAccount,
  DuplicateAccountError,
} from "../src/lib/auth/accounts.ts";
import {
  isValidEmail,
  MIN_PASSWORD_LENGTH,
} from "../src/lib/admin/validation.ts";

async function main() {
  let [email, password] = process.argv.slice(2);

  if (!email || !password) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    if (!email) email = (await rl.question("邮箱: ")).trim();
    if (!password) password = await rl.question("密码: ");
    rl.close();
    console.log("（提示：密码输入会明文回显，注意避开旁人与录屏）");
  }

  if (!isValidEmail(email)) {
    console.error("create-admin: 邮箱格式不对");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`create-admin: 密码至少 ${MIN_PASSWORD_LENGTH} 位`);
    process.exit(1);
  }

  const db = openDb(dbPath());
  try {
    const account = createAccount(db, { email, password, isAdmin: true });
    console.log(`已创建管理员账号: ${account.email}（id: ${account.id}）`);
  } catch (err) {
    if (err instanceof DuplicateAccountError) {
      console.error(`create-admin: 创建失败，${(err as Error).message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("create-admin 失败:", (err as Error).message);
  process.exit(1);
});
