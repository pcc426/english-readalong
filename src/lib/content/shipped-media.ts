import path from "node:path";

/**
 * 随代码部署的标准内容视频目录：SHIPPED_MEDIA_DIR 覆盖，默认 <cwd>/content/media。
 * 视频不做静态公开，统一由 /api/media/shipped/<文件名> 经鉴权后流式提供。
 */
export function shippedMediaRoot(): string {
  return (
    process.env.SHIPPED_MEDIA_DIR ||
    path.join(process.cwd(), "content", "media")
  );
}

/** 单个文件名（不含目录分隔符），允许中文原名 */
const SAFE_NAME = /^[^/\\\x00-\x1f]+$/;

export function isShippedVideoName(name: string | undefined): name is string {
  return !!name && SAFE_NAME.test(name) && name !== "." && name !== "..";
}

export function shippedMediaAbsPath(name: string): string {
  return path.join(shippedMediaRoot(), name);
}
