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

export const unitPackSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.string().min(1),
  video: z.string().min(1),
  sentences: z.array(sentenceSchema),
});

export type Sentence = z.infer<typeof sentenceSchema>;
export type UnitPack = z.infer<typeof unitPackSchema>;
