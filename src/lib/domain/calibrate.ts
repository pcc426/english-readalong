export interface ClipBounds {
  start: number;
  end: number;
}

/** 片段最短时长（秒），保证起点终点互不越界 */
export const MIN_CLIP = 0.2;

export const CALIBRATE_STEP = 0.25;

/**
 * 校对模式的边界微调：把某一边挪 delta 秒，并钳制在合法范围
 * （起点 ∈ [0, end-MIN_CLIP]，终点 ∈ [start+MIN_CLIP, ∞)）。
 */
export function adjustBounds(
  bounds: ClipBounds,
  field: "start" | "end",
  delta: number
): ClipBounds {
  if (field === "start") {
    const start = Math.max(0, Math.min(bounds.start + delta, bounds.end - MIN_CLIP));
    return { start, end: bounds.end };
  }
  const end = Math.max(bounds.start + MIN_CLIP, bounds.end + delta);
  return { start: bounds.start, end };
}
