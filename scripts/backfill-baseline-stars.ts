// 一次性把历史练习折算成初始星星；幂等，部署时可重复执行。
import { openDb, dbPath } from "../src/lib/db";
import { beijingMonthOf, beijingToday } from "../src/lib/domain/beijing-date";
import { backfillBaselineStars } from "../src/lib/domain/baseline";

const db = openDb(dbPath());
try {
  const report = backfillBaselineStars(db, {
    launchMonth: beijingMonthOf(beijingToday()),
  });
  const inserted = report.rows.filter((row) => row.inserted);
  console.log(`[baseline] launchMonth=${report.launchMonth}`);
  for (const row of inserted) {
    console.log(`[baseline] ${row.accountId} / ${row.unitId}: +${row.stars}`);
  }
  if (report.skippedNullOwner > 0) {
    console.log(
      `[baseline] warning: skipped ${report.skippedNullOwner} NULL-owner attempts (no admin)`
    );
  }
  const byAccount = new Map<string, number>();
  for (const row of report.rows) {
    byAccount.set(row.accountId, (byAccount.get(row.accountId) ?? 0) + row.stars);
  }
  for (const [accountId, total] of byAccount) {
    console.log(`[baseline] ${accountId}: ${total} stars`);
  }
  console.log(`[baseline] inserted ${inserted.length} rows`);
} finally {
  db.close();
}
