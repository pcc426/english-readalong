import { createScoringServiceFromEnv } from "./xunfei/service";
import type { ScoringService } from "./types";

let override: ScoringService | null = null;

/**
 * 测试注入点：置入假评测器后，getScoringService 返回它；
 * 传 null 恢复默认（从环境变量构造讯飞实现）。
 */
export function setScoringService(service: ScoringService | null) {
  override = service;
}

export function getScoringService(): ScoringService {
  return override ?? createScoringServiceFromEnv();
}
