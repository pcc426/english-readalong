import type { ScoringRequest, ScoringResult, ScoringService } from "./types";

/**
 * 可编程假评测器（测试注入用）：按预设顺序返回分数。
 * 传入单数字则所有调用返回同一分数；分数用尽后抛错，
 * 避免测试在无意中多调评测还全靠同一个值蒙混过关。
 */
export class FakeScoringService implements ScoringService {
  private queue?: number[];
  private fixed?: number;

  constructor(scores: number | number[]) {
    if (Array.isArray(scores)) {
      this.queue = [...scores];
    } else {
      this.fixed = scores;
    }
  }

  score(_request: ScoringRequest): Promise<ScoringResult> {
    if (this.fixed !== undefined) {
      return Promise.resolve({ score: this.fixed });
    }
    const score = this.queue?.shift();
    if (score === undefined) {
      return Promise.reject(new Error("FakeScoringService: 预设分数已用尽"));
    }
    return Promise.resolve({ score });
  }
}
