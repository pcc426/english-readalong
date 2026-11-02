"use client";

// 教材内容制作·上传页（V0.3.4 票 04，拆自 StandardAdminClient）。
// 表单字段与样式完全沿用拆分前（版本固定只读 / 学期 / 单元+模块两列 / 标题预览 /
// 视频文件 / 提交按钮）；提交按票 01 改：XHR 真实进度 + 取消上传 +
// 完成后 3 秒倒计时（可「立即前往」提前走），跳回本列表页。
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MAX_MB } from "@/components/shared/upload-precheck";
import { VideoFileField } from "@/components/shared/video-file-field";
import {
  uploadWithProgress,
} from "@/components/shared/upload-with-progress";
import {
  useCountdown,
  percentOf,
} from "@/components/shared/upload-countdown";
import { buildEnumTitle } from "@/lib/textbook/title";
import {
  AccessGate,
  useAdminAccess,
  type TextbookCatalog,
} from "./types";

export default function StandardUploadForm({
  catalog,
}: {
  catalog: TextbookCatalog;
}) {
  const router = useRouter();
  const access = useAdminAccess();
  const [file, setFile] = useState<File | null>(null);
  const [bookId, setBookId] = useState(catalog.books[0]?.id ?? "");
  const [unitId, setUnitId] = useState(
    catalog.books[0]?.units[0]?.unitId ?? ""
  );
  const [moduleKind, setModuleKind] = useState(
    catalog.books[0]?.units[0]?.modules[0]?.moduleKind ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // V0.3.4 票 01：上传进度（百分比）、取消句柄、完成后的 3 秒倒计时
  const [percent, setPercent] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const navigatedRef = useRef(false);

  const selectedBook = catalog.books.find((b) => b.id === bookId);
  const selectedUnit = selectedBook?.units.find((u) => u.unitId === unitId);
  const selectedModule = selectedUnit?.modules.find(
    (m) => m.moduleKind === moduleKind
  );
  // 枚举串预览：句数此时取教材模块句数占位（校对可增删句，以草稿确认后为准）
  const enumPreview =
    selectedBook && selectedUnit && selectedModule
      ? buildEnumTitle({
          seriesShortName: catalog.series.shortName,
          bookShortName: selectedBook.shortName,
          unitIndex: selectedUnit.index,
          moduleKind: selectedModule.moduleKind,
          sentenceCount: selectedModule.sentenceCount,
        })
      : null;

  function navigateToList() {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push("/admin/standard");
  }

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading) return;
    if (!bookId || !unitId || !moduleKind) {
      setError("请选择学期、教材单元与模块");
      return;
    }
    if (!file) {
      setError("请选择要上传的视频文件");
      return;
    }
    setUploading(true);
    setError(null);
    navigatedRef.current = false;
    const form = new FormData();
    form.set("file", file);
    form.set("type", "standard");
    form.set("unitId", unitId);
    form.set("moduleKind", moduleKind);
    const handle = uploadWithProgress({
      url: "/api/uploads",
      body: form,
      onProgress: (loaded, total) => setPercent(percentOf(loaded, total)),
    });
    cancelRef.current = handle.cancel;
    try {
      const res = await handle.promise;
      if (res.status === 201) {
        // 成功不留在上传页：3 秒倒计时后跳回制作列表（可提前点按钮前往）
        setCountdown(3);
        return;
      }
      if (res.status === 0) {
        // 用户取消：回 idle 可重试
        setError("已取消上传");
        return;
      }
      const body = res.body as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "上传失败，请重试");
    } catch {
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
    <AccessGate access={access}>
      <div className="mx-auto max-w-xl px-5 py-8">
        <button
          type="button"
          onClick={navigateToList}
          className="text-lg text-emerald-700"
        >
          ← 返回制作列表
        </button>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          上传教材视频
        </h1>
        <p className="mt-2 text-xl text-slate-500">
          上传对应教材模块的课堂视频，校对时对照教材原文，定稿后全账号可见
        </p>

        <form
          onSubmit={handleUpload}
          className="mt-6 rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100"
        >
          <label htmlFor="std-series" className="block text-lg font-semibold">
            版本
          </label>
          <p
            id="std-series"
            className="mt-2 w-full rounded-2xl bg-slate-100 px-4 py-3 text-lg text-slate-500"
          >
            {catalog.series.display}
          </p>
          <p className="mt-1 text-base text-slate-400">教材版本固定，不可选择</p>

          <label htmlFor="std-book" className="mt-5 block text-lg font-semibold">
            学期
          </label>
          <select
            id="std-book"
            value={bookId}
            onChange={(e) => {
              const book = catalog.books.find((b) => b.id === e.target.value);
              setBookId(e.target.value);
              setUnitId(book?.units[0]?.unitId ?? "");
              setModuleKind(book?.units[0]?.modules[0]?.moduleKind ?? "");
            }}
            className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            {catalog.books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.display}
              </option>
            ))}
          </select>
          <p className="mt-1 text-base text-slate-400">
            只开放已有教材数据的学期，其余学期拿到教材后自动开放
          </p>

          <div className="mt-5 flex gap-4">
            <div className="flex-1">
              <label htmlFor="std-unit" className="block text-lg font-semibold">
                教材单元
              </label>
              <select
                id="std-unit"
                value={unitId}
                onChange={(e) => {
                  setUnitId(e.target.value);
                  const unit = selectedBook?.units.find(
                    (u) => u.unitId === e.target.value
                  );
                  setModuleKind(unit?.modules[0]?.moduleKind ?? "");
                }}
                className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {(selectedBook?.units ?? []).map((u) => (
                  <option key={u.unitId} value={u.unitId}>
                    {u.unitId} {u.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="std-module" className="block text-lg font-semibold">
                模块
              </label>
              <select
                id="std-module"
                value={moduleKind}
                onChange={(e) => setModuleKind(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                {(selectedUnit?.modules ?? []).map((m) => (
                  <option key={m.moduleKind} value={m.moduleKind}>
                    {m.moduleKind}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedModule && (
            <div className="mt-5 rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
              <p className="text-base text-slate-400">
                标题（自动生成，不可手改）
              </p>
              <p className="mt-1 text-xl font-bold">
                主标题：{selectedModule.title}
              </p>
              <p className="mt-1 text-lg text-slate-500">副标题：{enumPreview}</p>
              <p className="mt-1 text-base text-slate-400">
                句数以校对确认后的句数为准
              </p>
            </div>
          )}

          <label htmlFor="std-file" className="mt-5 block text-lg font-semibold">
            视频文件
          </label>
          <VideoFileField id="std-file" file={file} onChange={setFile} />
          <p className="mt-3 text-base text-slate-400">
            支持 mp4 / m4v / mov，不超过 {MAX_MB}MB、5 分钟；校对页会按该模块的教材原文预填参照
          </p>

          {error && (
            <p role="alert" className="mt-4 text-lg text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={uploading || countdown !== null || !file}
            className="mt-5 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
          >
            {uploading
              ? `上传中… ${percent}%`
              : countdown !== null
                ? `上传完成 · ${countdown} 秒后自动前往`
                : "上传并开始转写"}
          </button>

          {/* V0.3.4 票 01：上传中的进度与取消；完成后的立即前往 */}
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
              <AutoNavigate onDone={navigateToList} onTick={setCountdown} />
              <button
                type="button"
                onClick={navigateToList}
                className="mt-3 w-full rounded-2xl py-2.5 text-base font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
              >
                立即前往「制作中」
              </button>
            </>
          )}
        </form>
      </div>
    </AccessGate>
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
