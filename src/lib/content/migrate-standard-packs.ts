// 老标准包归属回填引擎（票 03，spec 决策 17）：对单个内容包按目标归属
// （unitId/moduleKind + poster 引用）补写教材归属字段。
// 幂等：字段与注册表值一致（poster 目标为 null 时「已有即正确」）则 skipped；
// 错值按注册表纠正。dry-run（apply 缺省 false）只产出 before/after 计划不动磁盘。
//
// 引擎只管单包读写与幂等判定；目标枚举、poster 引用解析（文件存在性）、
// DB 草稿行查询都在 scripts/migrate-v03-standard-packs.ts 编排，
// 单测用临时目录直接驱动本模块。
import { readFileSync, writeFileSync } from "node:fs";
import { contentPackSchema } from "./schema";
import { textbookPackAttribution } from "@/lib/textbook/textbook";

/** 迁移目标的归属与封面引用。poster 为 null = 不写封面字段（脚本层已判定缺失）。 */
export interface PackMigrationTarget {
  unitId: string;
  moduleKind: string;
  poster: string | null;
}

export interface MigrateOptions {
  /** true = 实际写盘；缺省 false = dry-run，只出计划 */
  apply?: boolean;
}

/** 归属字段的 before/after 快照：只含包上实际存在（或将要写入）的键 */
export interface AttributionSnapshot {
  seriesCode?: string;
  bookId?: string;
  unitNo?: number;
  moduleKind?: string;
  lessonTitle?: string;
  poster?: string;
}

export type MigrationStatus = "migrated" | "skipped" | "planned" | "failed";

export interface MigrateStandardPackResult {
  packPath: string;
  packId: string;
  status: MigrationStatus;
  before: AttributionSnapshot;
  /** 目标态；failed 时为 null */
  after: AttributionSnapshot | null;
  /** failed 时的原因 */
  problem?: string;
}

const ATTR_KEYS = [
  "seriesCode",
  "bookId",
  "unitNo",
  "moduleKind",
  "lessonTitle",
] as const;

function snapshotOf(pack: Record<string, unknown>): AttributionSnapshot {
  const snap: AttributionSnapshot = {};
  for (const key of ATTR_KEYS) {
    if (pack[key] != null) {
      (snap as Record<string, unknown>)[key] = pack[key];
    }
  }
  if (pack.poster != null) snap.poster = pack.poster as string;
  return snap;
}

function sameSnapshot(a: AttributionSnapshot, b: AttributionSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function migrateStandardPack(
  packPath: string,
  target: PackMigrationTarget,
  options: MigrateOptions = {}
): MigrateStandardPackResult {
  const base = { packPath, before: {} as AttributionSnapshot };
  let raw: string;
  try {
    raw = readFileSync(packPath, "utf8");
  } catch (e) {
    return { ...base, packId: "(?)", status: "failed", after: null, problem: `读不到文件: ${(e as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ...base, packId: "(?)", status: "failed", after: null, problem: `不是合法 JSON: ${(e as Error).message}` };
  }

  const id = (parsed as { id?: unknown }).id;
  const packId = typeof id === "string" ? id : "(?)";

  const current = contentPackSchema.safeParse(parsed);
  if (!current.success) {
    return {
      ...base,
      packId,
      status: "failed",
      after: null,
      problem: `现有内容包校验失败（先修包再迁移）: ${current.error.issues[0]?.message}`,
    };
  }
  if (current.data.type === "custom") {
    return { ...base, packId, status: "failed", after: null, problem: "自定义内容包不走标准包迁移" };
  }

  const attribution = textbookPackAttribution(target.unitId, target.moduleKind);
  if (!attribution) {
    return {
      ...base,
      packId,
      status: "failed",
      after: null,
      problem: `教材注册表里找不到 ${target.unitId} / ${target.moduleKind}`,
    };
  }

  const before = snapshotOf(parsed as Record<string, unknown>);
  const desired: AttributionSnapshot = { ...attribution };
  if (target.poster != null) {
    desired.poster = target.poster;
  } else if (before.poster != null) {
    // poster 目标为 null（封面文件暂缺等）时保留包上已有引用——只增不删：
    // 删引用救不了缺文件，反而破坏既有封面展示
    desired.poster = before.poster;
  }
  if (sameSnapshot(before, desired)) {
    return { packPath, packId, status: "skipped", before, after: desired };
  }

  if (!(options.apply ?? false)) {
    return { packPath, packId, status: "planned", before, after: desired };
  }

  const updated = { ...(parsed as Record<string, unknown>), ...desired };
  const revalidated = contentPackSchema.safeParse(updated);
  if (!revalidated.success) {
    return {
      packPath,
      packId,
      status: "failed",
      before,
      after: null,
      problem: `迁移后校验失败（未写盘）: ${revalidated.error.issues[0]?.message}`,
    };
  }
  try {
    writeFileSync(packPath, JSON.stringify(updated, null, 2), "utf8");
  } catch (e) {
    return {
      packPath,
      packId,
      status: "failed",
      before,
      after: null,
      problem: `写盘失败: ${(e as Error).message}`,
    };
  }
  return { packPath, packId, status: "migrated", before, after: desired };
}
