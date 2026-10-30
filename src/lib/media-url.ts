/**
 * 上传类媒体相对引用（<accountId>/<file>）→ 鉴权媒体路由 URL。
 * 视频/封面同形（票 01：poster 与 video 共用同一套改写），
 * 前端展示与预览组装都从这里拼，避免 `api/media/${rel}` 散落多处漂移。
 */
export function mediaUrl(rel: string): string {
  return `/api/media/${rel}`;
}
