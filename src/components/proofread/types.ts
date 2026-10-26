// 文本校对页共享的视图类型（票 07）。壳只走 HTTP，不从 src/lib 引类型；
// 与 GET /api/drafts/[id] 响应（票 05）及句子变更端点响应（票 07）对应。
export interface DraftSentenceView {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  proofread: string;
}

export interface DraftDetailView {
  id: string;
  title: string;
  /** 票 12：custom=自家上传；standard=管理员制作的标准内容（校对页显示教材原文参照） */
  type: "custom" | "standard";
  /** 票 12：standard 草稿指向的教材单元与栏目；custom 为 null */
  unitId: string | null;
  moduleKind: string | null;
  status: "transcribing" | "proofreading" | "published";
  videoUrl: string;
  transcribeError: string | null;
  sentences: DraftSentenceView[];
}

/** 票 12：GET /api/textbook/module 的响应——标准草稿对应模块的教材原句清单 */
export interface TextbookModuleView {
  unitId: string;
  moduleKind: string;
  sentences: string[];
}

/** 更新单句的响应：{ sentence: 更新后的句子 } */
export interface SentenceUpdateResponse {
  sentence: DraftSentenceView;
}

/** 删除 / 合并的响应：{ sentences: 重排后的整个数组 } */
export interface SentencesResponse {
  sentences: DraftSentenceView[];
}
