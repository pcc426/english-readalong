// 定稿发布弹框的受众说明（V0.4.2）：自定义内容只对账号本人可见，
// 提示语不能沿用标准内容的「所有账号可见」。标题由调用方拼「定稿发布「X」？」。
import type { ContentDetail } from "@/lib/content/view";

export function publishAudienceText(type: ContentDetail["type"]): string {
  return type === "custom"
    ? "发布后只有你自己的账号可见、可跟读。"
    : "发布后所有账号可见、可跟读。";
}
