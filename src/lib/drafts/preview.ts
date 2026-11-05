// 预览页数据组装（V0.3 票 08）：草稿 + 草稿句子 → 不落盘的 ContentDetail 形状，
// 交给 PracticeFlow 的 preview 模式复用练习页的播放/逐句导航体验。
// 纯函数、无 IO：不写内容包文件（落盘仍只走 finalizeDraft，ADR 0005），
// 也不查练习记录——预览不携带任何成绩（bestScore/bestAt 恒 null）。
// 句子毫秒 → 0.1s 精度秒沿用 finalize 的换算（全站唯一口径）。
import type { ContentDetail } from "@/lib/content/view";
import { standardEnumSubtitleForModule } from "@/lib/textbook/enum-subtitle";
import { mediaUrl } from "@/lib/media-url";
import { msToSeconds } from "./finalize";
import type { Draft, DraftSentence } from "./repo";
import type { DraftModuleRef } from "./standard-drafts";

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
  sentences: DraftSentence[],
  moduleRef: DraftModuleRef | null = null
): PreviewData {
  const unconfirmedCount = sentences.filter(
    (s) => s.proofread !== "confirmed"
  ).length;
  const unit: ContentDetail = {
    id: draft.id,
    title: draft.title,
    type: draft.type,
    source: draft.type === "standard" ? "standard-upload" : "custom-upload",
    // 草稿视频引用与已发布内容一致（<accountId>/<file>），播放走鉴权媒体路由
    video: mediaUrl(draft.videoPath),
    // 封面沿用草稿上传链路抽的帧（票 01）；没抽到为 null，与草稿 API 同一 URL 口径
    poster: draft.posterPath ? mediaUrl(draft.posterPath) : null,
    // 枚举副标题（票 02/03 生成器）：标准草稿按草稿的教材单元/模块引用拼串；
    // custom 草稿保持 sourceLabel 语义（subtitle=null，界面回退文案）
    subtitle:
      draft.type === "standard" && moduleRef
        ? standardEnumSubtitleForModule(
            moduleRef.unitId,
            moduleRef.moduleKind,
            sentences.length
          )
        : null,
    sentences: sentences.map((s) => ({
      index: s.index,
      text: s.text,
      start: msToSeconds(s.startMs),
      end: msToSeconds(s.endMs),
      bestScore: null,
      bestAt: null,
    })),
    // 预览不查账本，本周次数恒 0（同 bestScore/bestAt 的占位语义）
    weeklyRuns: 0,
  };
  return {
    unit,
    sentenceCount: sentences.length,
    confirmedCount: sentences.length - unconfirmedCount,
    unconfirmedCount,
  };
}
