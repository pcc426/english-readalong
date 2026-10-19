/**
 * 评测服务缝（ADR-0001）：所有发音评分调用收敛在此接口后。
 * 输入教材原文文本 + 16kHz/16bit 单声道 WAV 音频，输出 0-100 句子总分。
 * 讯飞/假实现之外的引擎将来只新增实现，不改调用方。
 */
export interface ScoringRequest {
  /** 教材原文（权威参考文本） */
  text: string;
  /** 16kHz/16bit 单声道 WAV（PCM）音频 */
  audioWav: Buffer;
}

export interface ScoringResult {
  /** 句子总分 0-100 */
  score: number;
}

export interface ScoringService {
  score(request: ScoringRequest): Promise<ScoringResult>;
}
