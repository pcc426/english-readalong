// 上传接口（票 05）：multipart（title + file）→ 服务端校验 → 落盘 → 建草稿 → 转写首轮。
// 校验全在服务端（spec 用户故事 30）：格式按扩展名 + content-type 双查，
// 大小按解析出的 File.size，时长按可注入的 ffprobe（见 lib/drafts/probe）。
import { NextResponse } from "next/server";
import { requireAccount } from "@/lib/auth/guard";
import { openDb, dbPath } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { createDraftWithTranscription } from "@/lib/drafts/service";
import {
  checkUploadFormat,
  deleteUploadVideo,
  MAX_DURATION_MS,
  MAX_UPLOAD_BYTES,
  videoAbsPath,
} from "@/lib/drafts/storage";
import { getDurationProbe } from "@/lib/drafts/probe";
import { storeUpload } from "@/lib/drafts/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireAccount(req);
  if (!auth.ok) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "INVALID_FORM", "上传内容不是有效的表单数据");
  }

  const rawTitle = form.get("title");
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    return errorResponse(400, "INVALID_TITLE", "请填写内容标题");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse(400, "MISSING_FILE", "请选择要上传的视频文件");
  }

  const format = checkUploadFormat(file.name, file.type);
  if (!format.ok) {
    return errorResponse(415, "UNSUPPORTED_FORMAT", "仅支持 mp4 / m4v / mov 视频");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(413, "TOO_LARGE", "视频超过 200MB，请压缩后再上传");
  }

  const db = openDb(dbPath());
  try {
    // 先落盘再做时长校验（ffprobe 读文件）：超长即删文件，不留垃圾；
    // 探测失败（本机没有 ffprobe）返回 null 放行——部署前置依赖里有 ffmpeg
    const videoPath = await storeUpload(auth.account.id, format.ext, file);
    const durationMs = await getDurationProbe()(videoAbsPath(videoPath));
    if (durationMs != null && durationMs > MAX_DURATION_MS) {
      deleteUploadVideo(videoPath);
      return errorResponse(400, "TOO_LONG", "视频超过 5 分钟，请剪辑后再上传");
    }

    const draft = await createDraftWithTranscription(db, {
      accountId: auth.account.id,
      title,
      videoPath,
    });
    return NextResponse.json(
      { draft: { id: draft.id, title: draft.title, status: draft.status } },
      { status: 201 }
    );
  } catch {
    return errorResponse(500, "UPLOAD_FAILED", "视频保存失败，请重试");
  } finally {
    db.close();
  }
}
