import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { unitPackSchema, type UnitPack } from "./schema";

export type { Sentence, UnitPack } from "./schema";

/**
 * 按文件名顺序加载目录下全部内容包。任何包不合法即抛错（含文件名上下文），
 * 不静默跳过——素材数据错了必须立刻暴露。
 */
export function listUnitPacks(contentDir: string): UnitPack[] {
  return readdirSync(contentDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const raw = readFileSync(path.join(contentDir, f), "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`内容包 ${f} 不是合法 JSON: ${(e as Error).message}`);
      }
      const result = unitPackSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`内容包 ${f} 校验失败: ${result.error.message}`);
      }
      return result.data;
    });
}
