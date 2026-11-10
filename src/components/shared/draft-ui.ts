// 草稿卡片/详情页共享的小件（V0.2 整改：STATUS_BADGES、formatMs 单一来源，
// 文案逐字保持）。壳只走 HTTP，不从 src/lib 引类型——状态名在此就地声明，
// 与 GET /api/drafts 等草稿接口响应的 status 字段对应。
export type DraftStatusUI = "transcribing" | "proofreading" | "published";

/** 草稿状态 → 徽标文案与配色（spec 界面布局：转写中 / 未校对 / 已定稿） */
export const STATUS_BADGES: Record<
  DraftStatusUI,
  { label: string; className: string }
> = {
  transcribing: { label: "转写中", className: "bg-sky-100 text-sky-700" },
  proofreading: { label: "未校对", className: "bg-amber-100 text-amber-700" },
  published: { label: "已定稿", className: "bg-emerald-100 text-emerald-700" },
};

/**
 * 徽标文案（V0.4.2）：自定义内容页把 published 显示为「已发布」，
 * 教材制作页仍是「已定稿」。只改显示名，status 字段与接口不动。
 */
export function statusBadgeLabel(
  status: DraftStatusUI,
  surface: "standard" | "custom"
): string {
  if (surface === "custom" && status === "published") return "已发布";
  return STATUS_BADGES[status].label;
}

/** 转写失败徽标（V0.4.2）：上传后转写失败时列表卡片改用它 */
export const TRANSCRIBE_FAILED_BADGE = {
  label: "转写失败",
  className: "bg-red-100 text-red-700",
} as const;

/** 转写失败时卡片上的提示（上传失败与转写失败共用同一句） */
export const TRANSCRIBE_FAILED_HINT = "转写失败，请重新上传视频！";

/** 毫秒 → m:ss.s（校对页 SentenceRow 与草稿详情页同一口径） */
export function formatMs(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/**
 * 票 09（ADR 0005）：三处发布入口（校对页末句 / custom 详情页 / 标准制作列表）
 * 统一收敛为「去预览」——定稿发布只从预览页发起。此函数是三处共用的同一把尺：
 * 至少一句且全部确认才能进预览；unconfirmedCount 供禁用态提示复用。
 */
export function previewGate(
  total: number,
  confirmed: number
): { canPreview: boolean; unconfirmedCount: number } {
  const unconfirmedCount = Math.max(0, total - confirmed);
  return { canPreview: total > 0 && unconfirmedCount === 0, unconfirmedCount };
}
