// 上传前置校验（体验层）的共享常量与检查（V0.2 整改：自定义内容页与
// 标准内容制作页同一份）。真实大小/时长/格式校验以服务端为准
// （spec 用户故事 30）；提示文案逐字保持。
export const MAX_MB = 200;
export const OK_EXTENSIONS = ["mp4", "m4v", "mov"];

/** 返回首个不满足项的提示文案；合法返回 null */
export function precheckVideoFile(f: File): string | null {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!OK_EXTENSIONS.includes(ext)) {
    return "仅支持 mp4 / m4v / mov 视频";
  }
  if (f.size > MAX_MB * 1024 * 1024) {
    return `视频超过 ${MAX_MB}MB，请压缩后再上传`;
  }
  return null;
}
