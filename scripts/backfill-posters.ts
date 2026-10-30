// 一次性补抽脚本（票 01）：对全部随代码视频（content/media/*.mp4）与上传视频
// （data/uploads/<accountId>/*.mp4）补抽竖版封面，产物落各自既定位置，
// 输出「video → poster」映射（内容包字段形态，票 03 包回填直接可用）。
// 上传视频补抽成功的同时回填对应草稿行的 poster_path（只补 NULL 行）。
//
// 用法: npx tsx --env-file=.env scripts/backfill-posters.ts
// 幂等：封面已存在且比视频新则跳过；可重复执行，第二轮全 skipped。
// ffmpeg 缺失时逐条报 failed 但不中断（部署前置依赖里有 ffmpeg）。
import { openDb, dbPath } from "../src/lib/db.ts";
import {
  backfillShippedPosters,
  backfillUploadPosters,
  type PosterBackfillResult,
} from "../src/lib/drafts/poster-backfill.ts";

function printResults(label: string, results: PosterBackfillResult[]): void {
  for (const r of results) {
    const mark = r.status === "created" ? "生成" : r.status === "skipped" ? "跳过" : "失败";
    console.log(`${label} [${mark}] ${r.video} → ${r.poster}`);
  }
}

async function main() {
  const shipped = await backfillShippedPosters();
  printResults("shipped", shipped);

  const db = openDb(dbPath());
  try {
    const uploads = await backfillUploadPosters({ db });
    printResults("uploads", uploads);

    const mapping = Object.fromEntries(
      [...shipped, ...uploads]
        .filter((r) => r.status !== "failed")
        .map((r) => [r.video, r.poster])
    );
    console.log("\nvideo → poster 映射（内容包字段形态，票 03 包回填用）：");
    console.log(JSON.stringify(mapping, null, 2));

    const failed = [...shipped, ...uploads].filter((r) => r.status === "failed");
    if (failed.length > 0) {
      console.error(`\n${failed.length} 条补抽失败（多为 ffmpeg 缺失/视频损坏），已跳过不阻断`);
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("backfill-posters 失败:", (err as Error).message);
  process.exit(1);
});
