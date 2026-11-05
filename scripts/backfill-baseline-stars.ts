// 一次性把历史练习折算成初始星星；幂等，部署时可重复执行。
import { openDb, dbPath } from "../src/lib/db";
import { beijingMonthOf, beijingToday } from "../src/lib/domain/beijing-date";
import { backfillBaselineStars } from "../src/lib/domain/baseline";

const db = openDb(dbPath());
try {
  const launchMonth = beijingMonthOf(beijingToday());
  const rows = backfillBaselineStars(db, { launchMonth });
  const inserted = rows.filter((row) => row.inserted);
  console.log(`[baseline] launchMonth=${launchMonth}`);
  for (const row of inserted) {
    console.log(`[baseline] ${row.accountId} / ${row.unitId}: +${row.stars}`);
  }
  console.log(`[baseline] inserted ${inserted.length} rows`);
} finally {
  db.close();
}
