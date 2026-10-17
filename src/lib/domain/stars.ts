// 星级阈值放配置不写死（ADR-0001：讯飞按美式基准评分、教材偏英式，
// 用阈值校准补偿；若后续调整评分基准，只改这里）。
export const THREE_STAR_MIN = 90;
export const TWO_STAR_MIN = 75;

export type Stars = 1 | 2 | 3;
/** 0 表示该句还没有练习记录 */
export type BestStars = Stars | 0;

export function mapScoreToStars(score: number): Stars {
  if (score >= THREE_STAR_MIN) return 3;
  if (score >= TWO_STAR_MIN) return 2;
  return 1;
}
