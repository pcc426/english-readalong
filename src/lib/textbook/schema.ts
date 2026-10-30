import { z } from "zod";
import { books } from "./registry";

/**
 * 教材原文（标准内容的权威句子清单）的数据契约。
 *
 * 产物由一次性脚本 scripts/extract-textbook.py 从教材 PDF 离线提取，
 * 存放在 content/textbook/ 下（书目见 registry.ts 注册表），运行时不解析 PDF。
 *
 * Slug 规则：
 * - unitId：`<册简称>-U<序号>`，序号为教材单元号（1..10），不补零，如「五上-U2」。
 *   册简称来自注册表（registry.ts，如「五上」= 五年级上册）；unitId 正则按
 *   注册表动态构建，注册新书后自动放行新前缀。
 * - moduleKind：教材印刷的栏目原名（"Talking time" / "Story time" / "Reading time" /
 *   "Chant time" / "Rhyme time" / "Song time"），不做归一改写。
 *   同一 unitId 下 moduleKind 唯一。
 * - needsReview：提取脚本对置信度低的句子（引语与叙述语拼接处）标记的
 *   sentences 下标，供人工校对定位；notes 是模块级的提取备注。
 */

/** 教材印刷的栏目原名。教材新增栏目时先补这里，枚举外值构建期即报错。 */
export const MODULE_KINDS = [
  "Talking time",
  "Story time",
  "Reading time",
  "Chant time",
  "Rhyme time",
  "Song time",
] as const;

export const moduleKindSchema = z.enum(MODULE_KINDS, {
  error: `不是教材印刷栏目原名：必须是 MODULE_KINDS 六值之一（${MODULE_KINDS.join(" / ")}）；教材出现新栏目时请先补充 MODULE_KINDS 枚举`,
});

/** 单元 slug 前缀合法值来自注册表的册简称（见文件头注释）。 */
const unitPrefixPattern = books.map((b) => b.shortName).join("|");

/** 单元 slug：`<册简称>-U<序号>`，如「五上-U2」，序号 1..10。 */
export const unitIdSchema = z
  .string()
  .regex(
    new RegExp(`^(${unitPrefixPattern})-U(10|[1-9])$`),
    `unitId 必须是「<册简称>-U<序号>」形态（如 五上-U2），序号 1..10，册简称须是教材注册表里的书（当前：${books.map((b) => b.shortName).join("、")}）`,
  );

export const textbookModuleSchema = z
  .object({
    moduleKind: moduleKindSchema,
    /** 模块标题，取自教材目录页。 */
    title: z.string().min(1),
    /** 教材书页码范围，如 "p12" 或 "p14-15"，仅供人工校对定位。 */
    sourcePages: z.string().min(1),
    sentences: z.array(z.string().min(1)).min(1, "模块至少要有一句课文"),
    needsReview: z.array(z.number().int().nonnegative()).default([]),
    notes: z.array(z.string()).default([]),
  })
  .refine((m) => m.needsReview.every((i) => i < m.sentences.length), {
    message: "needsReview 下标越界（必须指向模块内的句子）",
  });

export const textbookUnitSchema = z
  .object({
    unitId: unitIdSchema,
    /** 教材单元号，与 unitId 中的序号一致。 */
    index: z.number().int().min(1),
    title: z.string().min(1),
    modules: z.array(textbookModuleSchema).min(1, "单元至少要有一个模块"),
  });

export const textbookDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    textbook: z.object({
      id: z.string().min(1),
      series: z.string().min(1),
      title: z.string().min(1),
      source: z.string().min(1),
      /** 书页码 N 对应 PDF 第 N+pageOffset 页，便于人工对照复核。 */
      pageOffset: z.number().int(),
      extractedAt: z.string().min(1),
    }),
    units: z.array(textbookUnitSchema).min(1, "教材数据至少要有一个单元"),
  })
  .refine(
    (data) => {
      const unitIds = data.units.map((u) => u.unitId);
      return new Set(unitIds).size === unitIds.length;
    },
    { message: "unitId 重复" },
  )
  .refine(
    (data) => {
      const seen = new Set<string>();
      for (const unit of data.units) {
        for (const module of unit.modules) {
          const key = `${unit.unitId}::${module.moduleKind}`;
          if (seen.has(key)) return false;
          seen.add(key);
        }
      }
      return true;
    },
    { message: "同一单元下 moduleKind 重复" },
  );

export type TextbookModule = z.infer<typeof textbookModuleSchema>;
export type TextbookUnit = z.infer<typeof textbookUnitSchema>;
export type TextbookData = z.infer<typeof textbookDataSchema>;

/**
 * 校验并解析教材数据。数据损坏（坏 JSON 结构、缺字段、越界下标等）时抛出
 * 带明确原因的 Error——教材数据错了必须立刻暴露，不允许静默带病运行。
 */
export function parseTextbook(raw: unknown): TextbookData {
  const result = textbookDataSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`教材数据校验失败: ${issues}`);
  }
  return result.data;
}
