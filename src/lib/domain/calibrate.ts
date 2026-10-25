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

export interface ClipBoundsMs {
  start: number;
  end: number;
}

/** 草稿句子存整数毫秒：最短片段 0.2s = 200ms，微调步进 0.25s = 250ms */
export const MIN_CLIP_MS = MIN_CLIP * 1000;
export const CALIBRATE_STEP_MS = CALIBRATE_STEP * 1000;

/**
 * 草稿场景（整数毫秒）的边界微调（切点校对页用）：语义与 adjustBounds 相同，
 * 结果钳为整数毫秒，保证能直接 PUT 给句子端点。
 */
export function adjustBoundsMs(
  bounds: ClipBoundsMs,
  field: "start" | "end",
  deltaMs: number
): ClipBoundsMs {
  const adjusted = adjustBounds(
    { start: bounds.start / 1000, end: bounds.end / 1000 },
    field,
    deltaMs / 1000
  );
  return {
    start: Math.round(adjusted.start * 1000),
    end: Math.round(adjusted.end * 1000),
  };
}
