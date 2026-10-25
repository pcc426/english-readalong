import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { contentPackSchema, type ContentPack } from "./schema";

export type { Sentence, ContentPack } from "./schema";

export interface ContentQuery {
  /** 账号 id：传入时结果为标准内容 + 该账号的自定义内容；不传仅标准内容 */
  accountId?: string;
}

/** 标准内容目录（随代码部署、只读）。 */
export function standardContentDir(): string {
  // 用 || 而非 ??：.env 里的空值行（CONTENT_DIR=）应视为未设置
  return process.env.CONTENT_DIR || path.join(process.cwd(), "content", "units");
}

/** 按账号分目录的自定义内容根目录（运行时写入 <root>/<accountId>/，可能不存在）。 */
export function customContentRoot(): string {
  return (
    process.env.CONTENT_DATA_DIR ||
    path.join(process.cwd(), "data", "content")
  );
}

/** 运行时产出的标准内容目录（12 号票：管理员定稿写入，与账号目录平级，部署不覆盖）。 */
export function standardRuntimeDir(): string {
  return path.join(customContentRoot(), "standard");
}

/**
 * 按文件名顺序加载目录下全部内容包。任何包不合法即抛错（含文件名上下文），
 * 不静默跳过——素材数据错了必须立刻暴露。
 * requireOwner 用于账号目录：包的 owner 必须与所在目录的账号一致。
 */
function loadContentPacks(dir: string, requireOwner?: string): ContentPack[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const raw = readFileSync(path.join(dir, f), "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`内容包 ${f} 不是合法 JSON: ${(e as Error).message}`);
      }
      const result = contentPackSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`内容包 ${f} 校验失败: ${result.error.message}`);
      }
      if (requireOwner != null && result.data.owner !== requireOwner) {
        throw new Error(
          `内容包 ${f} 的 owner（${result.data.owner ?? "缺省"}）与所在账号目录（${requireOwner}）不一致`
        );
      }
      return result.data;
    });
}

/**
 * 标准内容 = 随代码目录（content/units）+ 运行时目录（data/content/standard）
 * 两处合并。同名 id 去重时随代码包优先：运行时包是管理员后制作的，
 * 不覆盖随代码已发布的素材。运行时目录缺失视为空（还没有管理员制作是常态）。
 */
function loadStandardPacks(): ContentPack[] {
  const shipped = loadContentPacks(standardContentDir());
  const runtimeDir = standardRuntimeDir();
  const runtime = existsSync(runtimeDir) ? loadContentPacks(runtimeDir) : [];
  const shippedIds = new Set(shipped.map((p) => p.id));
  return [...shipped, ...runtime.filter((p) => !shippedIds.has(p.id))];
}

/**
 * 内容加载缝：标准目录 + 按账号自定义目录合并读取。
 * 不传账号参数 → 仅标准内容（既有行为）；传 accountId → 标准 + 该账号自定义，
 * 其他账号的自定义内容不可见。自定义目录缺失视为空（运行时还没有上传是常态）。
 */
export function listContent(query: ContentQuery = {}): ContentPack[] {
  const standard = loadStandardPacks();
  if (query.accountId == null) return standard;
  const accountDir = path.join(customContentRoot(), query.accountId);
  const custom = existsSync(accountDir)
    ? loadContentPacks(accountDir, query.accountId)
    : [];
  return [...standard, ...custom];
}

/** 按 id 取单条内容包。自定义内容仅归属账号传 accountId 时可取；找不到返回 null。 */
export function getContent(id: string, query: ContentQuery = {}): ContentPack | null {
  return listContent(query).find((pack) => pack.id === id) ?? null;
}
