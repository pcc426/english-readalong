// 定稿发布的确认文案（V0.3.1 票 01）：自定义内容只对账号本人可见，
// 提示语不能沿用标准内容的「所有账号可见」。
import type { ContentDetail } from "@/lib/content/view";

export function publishConfirmText(
  type: ContentDetail["type"],
  title: string
): string {
  const audience =
    type === "custom"
      ? "发布后只有你自己的账号可见、可跟读。"
      : "发布后所有账号可见、可跟读。";
  return `确定把「${title}」定稿发布吗？${audience}`;
}
