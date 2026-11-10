"use client";

// 自定义上传独立页（票 07，原型变体 C 分步向导）：三步 ① 选择视频 →
// ② 填写标题 → ③ 确认并开始转写。状态只在内存（刷新/前进后退不保留）。
// 提交与原内联表单完全一致：multipart POST /api/uploads（title、file，不带
// type）；201 后跳 /custom?tab=making，失败在步骤 3 内联显示、可重试不跳页。
// 文件选择复用 VideoFileField（预检 mp4/m4v/mov、200MB 内置；时长 5 分钟
// 由服务端校验）。步骤流转/校验的纯函数见同目录 upload-wizard。
// UI 不做自动化测试，走 iPad 真机手工验收清单（spec · Testing Decisions）。
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_MB } from "@/components/shared/upload-precheck";
import { VideoFileField } from "@/components/shared/video-file-field";
import {
  uploadWithProgress,
} from "@/components/shared/upload-with-progress";
import {
  useCountdown,
  percentOf,
  AUTO_NAVIGATE_SECONDS,
} from "@/components/shared/upload-countdown";
import { markUploadStarted } from "@/components/shared/upload-handoff";
import {
  STEP_TITLES,
  canGoNext,
  goNext,
  goPrev,
  submitBlocker,
  type WizardStep,
} from "./upload-wizard";

export default function CustomUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(0);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // V0.3.4 票 01：上传进度（百分比）、取消句柄、完成后的 3 秒倒计时
  const [percent, setPercent] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  // V0.4.2：进度到 100% 就倒计时回列表，服务端转写过程交给列表页异步等待
  const resultRef = useRef<"pending" | "ok" | "error">("pending");
  const completionStartedRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const navigatedRef = useRef(false);

  function navigateToList() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push("/custom?tab=making");
  }

  /** 进入完成态并开始倒计时（只一次）：进度到 100% 或 201 到达时调用 */
  function startCountdownOnce() {
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    // 告诉列表页「刚上传过」，它会在随后 20 秒内继续轮询把卡片接上
    markUploadStarted();
    setCountdown(AUTO_NAVIGATE_SECONDS);
  }

  /** 倒计时走完：没出错就直接回列表；转写、建卡片交给列表页异步等待 */
  function handleCountdownDone() {
    if (resultRef.current !== "error") navigateToList();
  }

  /** 201 到达：只记成功；倒计时若没启动过（拿不到总字节）在这里兜底启动 */
  function handleUploaded() {
    resultRef.current = "ok";
    startCountdownOnce();
  }

  /** 上传失败/取消：撤掉可能已经开始的倒计时，避免带着错误跳页 */
  function handleUploadFailed() {
    resultRef.current = "error";
    completionStartedRef.current = false;
    setCountdown(null);
  }

  async function handleUpload() {
    if (uploading) return;
    const blocker = submitBlocker({ file, title });
    if (blocker || !file) {
      // !file 仅是类型收窄兜底：blocker 已含文件缺失文案
      setError(blocker ?? "请选择要上传的视频文件");
      return;
    }
    setUploading(true);
    setError(null);
    setPercent(0);
    setCountdown(null);
    navigatedRef.current = false;
    completionStartedRef.current = false;
    resultRef.current = "pending";
    const form = new FormData();
    form.set("title", title.trim());
    form.set("file", file);
    const handle = uploadWithProgress({
      url: "/api/uploads",
      body: form,
      onProgress: (loaded, total) => {
        const next = percentOf(loaded, total);
        setPercent(next);
        // V0.4.2：进度条一显示 100% 就开始 3 秒倒计时；真正跳转仍等服务端 201
        if (next >= 100) startCountdownOnce();
      },
    });
    cancelRef.current = handle.cancel;
    try {
      const res = await handle.promise;
      if (res.status === 201) {
        handleUploaded();
        return;
      }
      if (res.status === 0) {
        // 用户取消：回 idle 可重试，已选文件与标题保留
        handleUploadFailed();
        setError("已取消上传");
        return;
      }
      handleUploadFailed();
      const body = res.body as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "上传失败，请重试");
    } catch {
      handleUploadFailed();
      setError("网络开小差了，请重试");
    } finally {
      setUploading(false);
      cancelRef.current = null;
    }
  }

  function cancelUpload() {
    cancelRef.current?.();
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <Link href="/custom" className="text-base font-semibold text-slate-500">
        ‹ 返回自定义内容
      </Link>

      <div className="mt-4 rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100">
        <StepIndicator current={step} />

        <div className="mt-8 min-h-52">
          {step === 0 && (
            <div>
              <span className="text-base font-bold text-slate-700">
                视频文件
              </span>
              <VideoFileField id="upload-file" file={file} onChange={setFile} />
              <p className="mt-3 text-base text-slate-400">
                支持 mp4 / m4v / mov，不超过 {MAX_MB}MB、5 分钟（最终以服务端校验为准）
              </p>
            </div>
          )}

          {step === 1 && (
            <label htmlFor="upload-title" className="block">
              <span className="text-base font-bold text-slate-700">标题</span>
              <input
                id="upload-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="比如：Peppa Pig S1E1"
                className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </label>
          )}

          {step === 2 && (
            <div>
              <p className="text-base font-bold text-slate-700">确认上传</p>
              <dl className="mt-3 space-y-2 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <div className="flex gap-3">
                  <dt className="shrink-0 text-base text-slate-500">文件名</dt>
                  <dd className="min-w-0 flex-1 truncate text-right text-base font-semibold text-slate-700" title={file?.name}>
                    {file?.name ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="shrink-0 text-base text-slate-500">标题</dt>
                  <dd className="min-w-0 flex-1 truncate text-right text-base font-semibold text-slate-700" title={title.trim()}>
                    {title.trim() || "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-base text-slate-400">
                上传后自动转写，约 1–3 分钟；完成后会出现在「制作中」，届时按「校对 → 预览 → 定稿」流程完成。
              </p>
            </div>
          )}
        </div>

        {step === 2 && error && (
          <p role="alert" className="mt-4 text-lg text-red-600">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between gap-3">
          <button
            type="button"
            disabled={step === 0 || uploading || countdown !== null}
            onClick={() => {
              setError(null);
              setStep((s) => goPrev(s));
            }}
            className="rounded-2xl px-5 py-3 text-base font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30"
          >
            上一步
          </button>
          {step < 2 ? (
            <button
              type="button"
              disabled={!canGoNext(step, { file, title })}
              onClick={() => setStep((s) => goNext(s, { file, title }))}
              className="rounded-2xl bg-emerald-500 px-8 py-3 text-base font-bold text-white shadow-md hover:bg-emerald-600 disabled:opacity-40"
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              disabled={uploading || countdown !== null}
              onClick={() => void handleUpload()}
              className="rounded-2xl bg-emerald-500 px-8 py-3 text-base font-bold text-white shadow-md hover:bg-emerald-600 disabled:opacity-40"
            >
              {countdown !== null
                ? `上传完成 · ${countdown} 秒后自动前往`
                : uploading
                  ? `上传中… ${percent}%`
                  : "上传并开始转写"}
            </button>
          )}
        </div>

        {/* V0.3.4 票 01：上传中的进度与取消；完成后的立即前往。
            倒计时由挂载在完成态的 <AutoNavigate/> 驱动 */}
        {uploading && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <button
              type="button"
              onClick={cancelUpload}
              className="mt-3 w-full rounded-2xl py-2.5 text-base font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              取消上传
            </button>
          </div>
        )}
        {countdown !== null && (
          <>
            <AutoNavigate onDone={handleCountdownDone} onTick={setCountdown} />
            <button
              type="button"
              onClick={navigateToList}
              className="mt-3 w-full rounded-2xl py-2.5 text-base font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
            >
              立即前往「制作中」
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 挂载即开始 3-2-1，到 0 调 onDone（导航）；卸载即取消 */
function AutoNavigate({
  onDone,
  onTick,
}: {
  onDone: () => void;
  onTick: (n: number) => void;
}) {
  useCountdown({ onDone, onTick });
  return null;
}

/** 顶部步骤指示条：编号圆点 + 标题 + 连线；已过态 ✓、当前与已过态 emerald（原型 C） */
function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center justify-between">
      {STEP_TITLES.map((label, i) => (
        <div key={label} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span
              aria-current={i === current ? "step" : undefined}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                i <= current
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < current ? "✓" : i + 1}
            </span>
            <span
              className={`text-xs font-semibold ${
                i <= current ? "text-emerald-700" : "text-slate-400"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEP_TITLES.length - 1 && (
            <div
              className={`mx-2 h-0.5 flex-1 rounded ${
                i < current ? "bg-emerald-400" : "bg-slate-100"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
