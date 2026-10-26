/**
 * 内容包 source 的展示文案。`*-upload` 是内部标记（媒体路由据此把视频
 * 改写成鉴权流），界面上换成人话；教材随代码内容包仍显示原出处。
 */
const SOURCE_LABELS: Record<string, string> = {
  "standard-upload": "教材上传",
  "custom-upload": "自定义上传",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}
