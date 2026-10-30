import { z } from "zod";

const sentenceSchema = z
  .object({
    text: z.string().min(1),
    start: z.number().nullable(),
    end: z.number().nullable(),
  })
  .refine((s) => (s.start === null) === (s.end === null), {
    message: "start 与 end 必须同时为空（未切分）或同时有值",
  })
  .refine((s) => s.start === null || s.end === null || s.start < s.end, {
    message: "时间倒置：start 必须小于 end",
  });

export const contentPackSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    source: z.string().min(1),
    video: z.string().min(1),
    /** 竖版封面（9:16 JPEG）相对引用：上传类为 <accountId>/<file>.jpg，随代码包为文件名；缺省 = 无封面 */
    poster: z.string().min(1).optional(),
    /** 内容类型：缺省视为 standard（既有内容包无需修改即合法） */
    type: z.enum(["standard", "custom"]).optional(),
    /** 归属账号 id：standard 必须为空；custom 必须为非空账号 id */
    owner: z.string().min(1).nullable().optional(),
    /**
     * 教材归属（票 03，仅标准包写；custom 包不写；可由 bookId+unitNo 推导
     * unitId，故不冗余存）。全字段可选：V0.3 前的老包未迁移时仍合法。
     */
    /** 教材版本机器码（textbook/registry.ts series.code，如 sh-jiaoban-new） */
    seriesCode: z.string().min(1).optional(),
    /** 书目注册 id（textbook/registry.ts，如 grade5a） */
    bookId: z.string().min(1).optional(),
    /** 教材单元号（1..10，与 unitId「五上-U2」的序号一致） */
    unitNo: z.number().int().min(1).optional(),
    /** 教材印刷栏目原名（如 Story time） */
    moduleKind: z.string().min(1).optional(),
    /** 课文名（教材 JSON 的 module.title），枚举副标题的课文名来源 */
    lessonTitle: z.string().min(1).optional(),
    sentences: z.array(sentenceSchema),
  })
  .superRefine((pack, ctx) => {
    if ((pack.type ?? "standard") === "standard") {
      if (pack.owner != null) {
        ctx.addIssue({
          code: "custom",
          path: ["owner"],
          message: "标准内容不归属账号（owner 必须为空）",
        });
      }
    } else if (pack.owner == null) {
      ctx.addIssue({
        code: "custom",
        path: ["owner"],
        message: "自定义内容必须归属账号（owner 为账号 id）",
      });
    }
  });

export type Sentence = z.infer<typeof sentenceSchema>;
export type ContentPack = z.infer<typeof contentPackSchema>;
