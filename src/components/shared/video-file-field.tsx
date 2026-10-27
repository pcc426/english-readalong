"use client";

// 视频文件选择控件（票 02）：隐藏原生 input，中文「选择视频」按钮 + 选中后
// 文件名高亮，让用户明确知道已选中。客户端预检（大小/扩展名）内置在此处，
// 页面侧只接收通过预检的 File（或 null）。预检只是体验层，真实校验在服务端。
import { useEffect, useRef, useState } from "react";
import { precheckVideoFile } from "./upload-precheck";

export const VIDEO_ACCEPT =
  ".mp4,.m4v,.mov,video/mp4,video/x-m4v,video/quicktime";

export function VideoFileField({
  id,
  file,
  onChange,
}: {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [precheckError, setPrecheckError] = useState<string | null>(null);

  // 页面侧清空（如上传成功后）时同步重置原生 input，否则重选同一文件不触发 onChange
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  function handleChange(f: File | null) {
    setPrecheckError(null);
    if (f) {
      const problem = precheckVideoFile(f);
      if (problem) {
        setPrecheckError(problem);
        if (inputRef.current) inputRef.current.value = "";
        onChange(null);
        return;
      }
    }
    onChange(f);
  }

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => handleChange(e.target.files?.[0] ?? null)}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-2xl bg-slate-100 px-5 py-3 text-lg font-semibold text-slate-700 ring-1 ring-slate-200 active:bg-slate-200"
        >
          选择视频
        </button>
        {file ? (
          <span
            className="min-w-0 flex-1 truncate rounded-2xl bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-700 ring-1 ring-emerald-300"
            title={file.name}
          >
            ✓ {file.name}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate px-1 text-lg text-slate-400">
            还未选择视频
          </span>
        )}
      </div>
      {precheckError && (
        <p className="mt-2 text-base text-red-600">{precheckError}</p>
      )}
    </div>
  );
}
