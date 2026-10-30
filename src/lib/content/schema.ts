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
