"use client";

// 「自定义内容」页（票 05）：上传表单 + 本账号草稿列表。
// V0.2 整改：按 type=custom 取数（管理员的标准草稿归「标准内容制作」页），
// 与现有草稿列表同页分区（校对中 / 已发布）——已发布的自定义内容带
// 「自定义」标签与进入练习的链接（走 /units/[id] 既有链路，spec 界面布局）。
// 前置提示只是体验层校验，真实大小/时长/格式校验以服务端为准（spec 用户故事 30）；
// UI 不做自动化测试，走 iPad 真机手工验收清单（spec · Testing Decisions）。
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

// 与 GET /api/drafts 响应对应（壳只走 HTTP，不从 src/lib 引类型）
interface DraftOverview {
  id: string;
  title: string;
  type: "custom" | "standard";
  status: "transcribing" | "proofreading" | "published";
  sentenceCount: number;
  createdAt: string;
}

const STATUS_BADGES: Record<DraftOverview["status"], { label: string; className: string }> = {
  transcribing: { label: "转写中", className: "bg-sky-100 text-sky-700" },
  proofreading: { label: "未校对", className: "bg-amber-100 text-amber-700" },
  published: { label: "已定稿", className: "bg-emerald-100 text-emerald-700" },
};

const MAX_MB = 200;
const OK_EXTENSIONS = ["mp4", "m4v", "mov"];

export default function CustomContentPage() {
  const [drafts, setDrafts] = useState<DraftOverview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDrafts = useCallback(async () => {
    try {
      // 本页只管自定义内容；管理员的标准草稿走「标准内容制作」页
      const res = await fetch("/api/drafts?type=custom");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { drafts?: DraftOverview[] };
      setDrafts(body.drafts ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  function precheck(f: File): string | null {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!OK_EXTENSIONS.includes(ext)) {
      return "仅支持 mp4 / m4v / mov 视频";
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      return `视频超过 ${MAX_MB}MB，请压缩后再上传`;
    }
    return null;
  }

  function handleFileChange(f: File | null) {
    setError(null);
    if (f) {
      const problem = precheck(f);
      if (problem) {
        setError(problem);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    setFile(f);
  }

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading) return;
    if (!title.trim()) {
      setError("请先给内容起个标题");
      return;
    }
    if (!file) {
      setError("请选择要上传的视频文件");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (res.status === 201) {
        setTitle("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadDrafts();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "上传失败，请重试");
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(draft: DraftOverview) {
    if (!window.confirm(`确定删除「${draft.title}」吗？视频文件会一并删除。`)) {
      return;
    }
    setDeletingId(draft.id);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      if (res.ok) await loadDrafts();
      else setError("删除失败，请重试");
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setDeletingId(null);
    }
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">自定义内容</h1>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          加载失败，请刷新重试
        </p>
      </div>
    );
  }

  const proofreading = (drafts ?? []).filter((d) => d.status !== "published");
  const published = (drafts ?? []).filter((d) => d.status === "published");

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h1 className="text-3xl font-bold tracking-tight">自定义内容</h1>
      <p className="mt-2 text-xl text-slate-500">上传家里的英语视频，做成跟读练习</p>

      <form
        onSubmit={handleUpload}
        className="mt-6 rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100"
      >
        <label htmlFor="draft-title" className="block text-lg font-semibold">
          标题
        </label>
        <input
          id="draft-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="比如：Peppa Pig S1E1"
          className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

        <label htmlFor="draft-file" className="mt-5 block text-lg font-semibold">
          视频文件
        </label>
        <input
          id="draft-file"
          ref={fileInputRef}
          type="file"
          accept=".mp4,.m4v,.mov,video/mp4,video/x-m4v,video/quicktime"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="mt-2 w-full text-lg text-slate-600 file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-100 file:px-4 file:py-3 file:text-lg file:font-semibold file:text-slate-700"
        />
        <p className="mt-3 text-base text-slate-400">
          支持 mp4 / m4v / mov，不超过 {MAX_MB}MB、5 分钟（最终以服务端校验为准）
        </p>

        {error && (
          <p role="alert" className="mt-4 text-lg text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={uploading}
          className="mt-5 w-full rounded-2xl bg-emerald-500 py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40"
        >
          {uploading ? "上传中…" : "上传并开始转写"}
        </button>
      </form>

      {drafts === null ? (
        <p className="mt-8 text-lg text-slate-400" role="status">
          加载中…
        </p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-2xl font-bold tracking-tight">校对中</h2>
            <div className="mt-4 space-y-6">
              {proofreading.length === 0 ? (
                <p className="rounded-3xl bg-white p-10 text-center text-xl text-slate-500 shadow-md ring-1 ring-slate-100">
                  还没有上传过内容，从上面开始吧
                </p>
              ) : (
                proofreading.map((draft) => {
                  const badge = STATUS_BADGES[draft.status];
                  // 未校对直达文本校对工具（票 07）；转写中不可点
                  const href = `/drafts/${draft.id}/proofread`;
                  const card = (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="text-2xl font-bold">{draft.title}</h3>
                          {typeBadge()}
                        </div>
                        <span className={`shrink-0 rounded-full px-4 py-1 text-lg font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-lg text-slate-500">{draft.sentenceCount} 句</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-lg font-semibold text-emerald-700">
                          {draft.status === "proofreading" ? "去校对 →" : "转写完成后可校对"}
                        </span>
                        {deleteButton(draft)}
                      </div>
                    </>
                  );
                  return draft.status === "proofreading" ? (
                    <a
                      key={draft.id}
                      href={href}
                      className="block rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100 active:bg-slate-50"
                    >
                      {card}
                    </a>
                  ) : (
                    <div
                      key={draft.id}
                      className="rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100"
                    >
                      {card}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight">已发布</h2>
            <div className="mt-4 space-y-6">
              {published.length === 0 ? (
                <p className="rounded-3xl bg-white p-10 text-center text-xl text-slate-500 shadow-md ring-1 ring-slate-100">
                  还没有已发布的内容，校对定稿后会出现在这里
                </p>
              ) : (
                published.map((draft) => {
                  const badge = STATUS_BADGES[draft.status];
                  return (
                    <a
                      key={draft.id}
                      href={`/units/${draft.id}`}
                      className="block rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100 active:bg-slate-50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="text-2xl font-bold">{draft.title}</h3>
                          {typeBadge()}
                        </div>
                        <span className={`shrink-0 rounded-full px-4 py-1 text-lg font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-lg text-slate-500">{draft.sentenceCount} 句</p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-lg font-semibold text-emerald-700">去练习 →</span>
                        {deleteButton(draft)}
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );

  /** spec 界面布局：内容列表卡片带「标准 / 自定义」标签；本页全是自定义内容。
   * 以普通函数渲染（非组件），避免每次渲染重建组件类型导致子树重挂。 */
  function typeBadge() {
    return (
      <span className="shrink-0 rounded-full bg-violet-100 px-3 py-0.5 text-base font-bold text-violet-700">
        自定义
      </span>
    );
  }

  function deleteButton(draft: DraftOverview) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleDelete(draft);
        }}
        disabled={deletingId === draft.id}
        className="rounded-2xl bg-slate-50 px-4 py-2 text-lg font-semibold text-slate-500 ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
      >
        {deletingId === draft.id ? "删除中…" : "删除"}
      </button>
    );
  }
}
