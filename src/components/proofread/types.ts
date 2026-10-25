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
  status: "transcribing" | "proofreading" | "published";
  videoUrl: string;
  transcribeError: string | null;
  sentences: DraftSentenceView[];
}

/** 更新单句的响应：{ sentence: 更新后的句子 } */
export interface SentenceUpdateResponse {
  sentence: DraftSentenceView;
}

/** 删除 / 合并的响应：{ sentences: 重排后的整个数组 } */
export interface SentencesResponse {
  sentences: DraftSentenceView[];
}
