// 一次性迁移脚本（票 10）：把 owner 为空的练习记录归到首个管理员账号名下。
// V0.1 的记录 owner 恒为 NULL（ADR-0002 预留列），公网化后按账号归属统计，
// 部署新版本前跑一次。核心逻辑在 src/lib/practice/migrate-owner.ts（含测试）。
//
// 用法: npx tsx --env-file=.env scripts/migrate-practice-owner.ts
// 幂等：可重复执行，没有可迁移记录时报 0 条；库中无管理员时明确报错退出（exit 1）。
import { openDb, dbPath } from "../src/lib/db.ts";
import { migrateNullOwnersToAdmin } from "../src/lib/practice/migrate-owner.ts";

async function main() {
  const db = openDb(dbPath());
  try {
    const { admin, migrated } = migrateNullOwnersToAdmin(db);
    if (migrated === 0) {
      console.log(
        `没有需要迁移的记录（owner 均已有归属），目标管理员: ${admin.email}（id: ${admin.id}）`
      );
    } else {
      console.log(
        `已把 ${migrated} 条练习记录迁移到管理员 ${admin.email}（id: ${admin.id}）名下`
      );
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("migrate-practice-owner 失败:", (err as Error).message);
  process.exit(1);
});
