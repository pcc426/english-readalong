// 一次性迁移脚本（票 03，spec 决策 17）：给 3 个已存在的标准内容包补写
// 教材归属字段（seriesCode/bookId/unitNo/moduleKind/lessonTitle）+ poster 引用。
//  - 随代码 2 包（content/units/）：归属按 source 串人工核定（票面已定），
//    poster 引用指向票 01 补抽产物（content/media/posters/<同名>.jpg）；
//  - 运行时标准包（<CONTENT_DATA_DIR>/standard/，如 f5fcec05-….json）：
//    归属从对应 content_drafts 行的 unit_id/module_kind 回填（以查库为准），
//    poster 用草稿行的 poster_path。
//
// 用法: npx tsx --env-file=.env scripts/migrate-v03-standard-packs.ts [--apply]
// dry-run 默认开：只打印每条的 before/after 计划，不动磁盘；
// 确认无误后加 --apply 实际写盘。幂等：字段已正确则 skipped，可重复执行。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { openDb, dbPath } from "../src/lib/db.ts";
import { getDraft } from "../src/lib/drafts/repo.ts";
import { getDraftModule } from "../src/lib/drafts/standard-drafts.ts";
import { uploadsRoot } from "../src/lib/drafts/storage.ts";
import { shippedPosterNameFor } from "../src/lib/drafts/poster.ts";
import { shippedPosterAbsPath } from "../src/lib/content/shipped-media.ts";
import { standardContentDir, standardRuntimeDir } from "../src/lib/content/loader.ts";
import {
  migrateStandardPack,
  type AttributionSnapshot,
  type MigrateStandardPackResult,
  type PackMigrationTarget,
} from "../src/lib/content/migrate-standard-packs.ts";

/** 随代码包的归属登记（票面核定，source 串佐证）。新随代码包定稿即带字段，不进本表。 */
const SHIPPED_ATTRIBUTION: Record<string, { unitId: string; moduleKind: string }> = {
  "u2-dragon-dance": { unitId: "五上-U2", moduleKind: "Story time" },
  "u3-amazing-plants": { unitId: "五上-U3", moduleKind: "Chant time" },
};

const apply = process.argv.includes("--apply");

function listPackFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

function fmtSnap(snap: AttributionSnapshot | null): string {
  return JSON.stringify(snap ?? null);
}

function printResult(label: string, result: MigrateStandardPackResult): void {
  console.log(`[${label}] ${result.packId} (${result.packPath})`);
  if (result.status === "failed") {
    console.log(`  原因: ${result.problem}`);
    return;
  }
  console.log(`  before: ${fmtSnap(result.before)}`);
  console.log(`  after:  ${fmtSnap(result.after)}`);
}

function packFields(packPath: string): { id: string; video: string } | null {
  try {
    const parsed = JSON.parse(readFileSync(packPath, "utf8")) as {
      id?: unknown;
      video?: unknown;
    };
    if (typeof parsed.id !== "string") return null;
    return { id: parsed.id, video: typeof parsed.video === "string" ? parsed.video : "" };
  } catch {
    return null;
  }
}

/** 随代码包的 poster 引用：票 01 补抽产物 <同名>.jpg（裸文件名，与 video 同形）。
 * 封面文件缺失时返回 null（本次不写 poster，警告提示先跑补抽脚本）。 */
function shippedPosterRef(video: string): { poster: string | null; warning?: string } {
  if (!video) return { poster: null, warning: "包缺 video 字段，无法定位封面" };
  const poster = shippedPosterNameFor(video);
  if (!existsSync(shippedPosterAbsPath(poster))) {
    return { poster: null, warning: `封面文件缺失：content/media/posters/${poster}（先跑 scripts/backfill-posters.ts）` };
  }
  return { poster };
}

/** 运行时包的归属与 poster：从 content_drafts 行回填（以查库为准）。
 * 草稿行已删但包已有归属字段时不阻塞（引擎会按幂等跳过/纠正由调用方决定），
 * 这里只在需要写而查不到时给 null 目标 → 由调用方报 failed。 */
function runtimeTarget(
  db: ReturnType<typeof openDb>,
  packId: string
): { target: PackMigrationTarget | null; warning?: string } {
  const draft = getDraft(db, packId);
  const moduleRef = getDraftModule(db, packId);
  if (!draft || !moduleRef) {
    return { target: null, warning: "content_drafts 里找不到对应草稿行（unit_id/module_kind 无法回填）" };
  }
  let poster: string | null = null;
  let warning: string | undefined;
  if (draft.posterPath) {
    if (existsSync(path.join(uploadsRoot(), draft.posterPath))) {
      poster = draft.posterPath;
    } else {
      warning = `封面文件缺失：uploads/${draft.posterPath}（先跑 scripts/backfill-posters.ts）`;
    }
  } else {
    warning = "草稿行没有 poster_path（未抽到封面），本次不写 poster";
  }
  return {
    target: { unitId: moduleRef.unitId, moduleKind: moduleRef.moduleKind, poster },
    warning,
  };
}

function main() {
  console.log(apply ? "== 迁移模式：--apply（实际写盘）==" : "== dry-run（默认，只出计划；确认后加 --apply）==");
  const results: MigrateStandardPackResult[] = [];
  const warnings: string[] = [];

  // 1) 随代码包（content/units）
  for (const packPath of listPackFiles(standardContentDir())) {
    const info = packFields(packPath);
    if (!info) {
      results.push({ packPath, packId: "(?)", status: "failed", before: {}, after: null, problem: "读包失败（JSON/字段）" });
      continue;
    }
    const registered = SHIPPED_ATTRIBUTION[info.id];
    if (!registered) {
      results.push({
        packPath,
        packId: info.id,
        status: "failed",
        before: {},
        after: null,
        problem: "未登记随代码归属（请在 SHIPPED_ATTRIBUTION 表补一行，按 source 串核定）",
      });
      continue;
    }
    const { poster, warning } = shippedPosterRef(info.video);
    if (warning) warnings.push(`${info.id}: ${warning}`);
    results.push(
      migrateStandardPack(packPath, { ...registered, poster }, { apply })
    );
  }

  // 2) 运行时标准包（<CONTENT_DATA_DIR>/standard）
  const runtimeFiles = listPackFiles(standardRuntimeDir());
  if (runtimeFiles.length > 0) {
    const db = openDb(dbPath());
    try {
      for (const packPath of runtimeFiles) {
        const info = packFields(packPath);
        if (!info) {
          results.push({ packPath, packId: "(?)", status: "failed", before: {}, after: null, problem: "读包失败（JSON/字段）" });
          continue;
        }
        const { target, warning } = runtimeTarget(db, info.id);
        if (warning) warnings.push(`${info.id}: ${warning}`);
        if (!target) {
          results.push({
            packPath,
            packId: info.id,
            status: "failed",
            before: {},
            after: null,
            problem: "查不到草稿行，无法回填归属（若包已带正确字段可直接跳过本条）",
          });
          continue;
        }
        results.push(migrateStandardPack(packPath, target, { apply }));
      }
    } finally {
      db.close();
    }
  }

  console.log("");
  for (const r of results) {
    printResult(
      r.status === "migrated" ? "迁移" : r.status === "skipped" ? "跳过" : r.status === "planned" ? "计划" : "失败",
      r
    );
  }
  if (warnings.length > 0) {
    console.log("\n警告：");
    for (const w of warnings) console.log(`  - ${w}`);
  }
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(
    `\n共 ${results.length} 条：迁移 ${results.filter((r) => r.status === "migrated").length}、` +
      `跳过 ${results.filter((r) => r.status === "skipped").length}、` +
      `计划 ${results.filter((r) => r.status === "planned").length}、失败 ${failed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main();
