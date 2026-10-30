// 预览页数据组装（V0.3 票 08）：草稿 + 草稿句子 → 不落盘的 ContentDetail 形状，
// 交给 PracticeFlow 的 preview 模式复用练习页的播放/逐句导航体验。
// 纯函数、无 IO：不写内容包文件（落盘仍只走 finalizeDraft，ADR 0005），
// 也不查练习记录——预览不携带任何成绩（bestScore/bestAt 恒 null）。
// 句子毫秒 → 0.1s 精度秒沿用 finalize 的换算（全站唯一口径）。
import type { ContentDetail } from "@/lib/content/view";
import { msToSeconds } from "./finalize";
import type { Draft, DraftSentence } from "./repo";

export interface PreviewData {
  /** 练习页同形状的内容详情：直接喂给 PracticeFlow */
  unit: ContentDetail;
  /** 全部句子数（= unit.sentences.length） */
  sentenceCount: number;
  /** 已确认句数 */
  confirmedCount: number;
  /** 未确认句数：>0 时可预览但定稿按钮禁用（票 08） */
  unconfirmedCount: number;
}

export function buildPreviewDetail(
  draft: Draft,
  sentences: DraftSentence[]
): PreviewData {
  const unconfirmedCount = sentences.filter(
    (s) => s.proofread !== "confirmed"
  ).length;
  const unit: ContentDetail = {
    id: draft.id,
    title: draft.title,
    source: draft.type === "standard" ? "standard-upload" : "custom-upload",
    // 草稿视频引用与已发布内容一致（<accountId>/<file>），播放走鉴权媒体路由
    video: `/api/media/${draft.videoPath}`,
    // 封面沿用草稿上传链路抽的帧（票 01）；没抽到为 null，与草稿 API 同一 URL 口径
    poster: draft.posterPath ? `/api/media/${draft.posterPath}` : null,
    // 枚举副标题（票 03）只对已发布内容包计算；预览暂不带（界面回退 sourceLabel），
    // 草稿的 unit_id/module_kind 引用接线留给票 09 的预览-定稿链路
    subtitle: null,
    sentences: sentences.map((s) => ({
      index: s.index,
      text: s.text,
      start: msToSeconds(s.startMs),
      end: msToSeconds(s.endMs),
      bestScore: null,
      bestAt: null,
    })),
  };
  return {
    unit,
    sentenceCount: sentences.length,
    confirmedCount: sentences.length - unconfirmedCount,
    unconfirmedCount,
  };
}
