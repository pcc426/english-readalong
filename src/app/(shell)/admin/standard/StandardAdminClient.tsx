"use client";

// 标准内容制作的客户端表单与草稿列表（票 12）。
// 上传走 POST /api/uploads（type=standard + unitId + moduleKind，服务端二次校验
// 管理员与教材单元）；定稿走 POST /api/drafts/[id]/publish（09 号票端点，
// standard 包落在公开标准目录，全账号可见）。UI 不做自动化测试，走手工验收清单。
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { STATUS_BADGES } from "@/components/shared/draft-ui";
import { MAX_MB } from "@/components/shared/upload-precheck";
import { VideoFileField } from "@/components/shared/video-file-field";

export interface TextbookCatalogUnit {
  unitId: string;
  title: string;
  modules: Array<{ moduleKind: string; title: string }>;
}

/** 服务端从教材数据取出的单元/模块清单（RSC props 传入） */
export type TextbookCatalog = TextbookCatalogUnit[];

// 与 GET /api/drafts 响应对应（壳只走 HTTP，不从 src/lib 引类型）
interface StandardDraftOverview {
  id: string;
  title: string;
  type: string;
  unitId: string | null;
  moduleKind: string | null;
  status: "transcribing" | "proofreading" | "published";
  sentenceCount: number;
  createdAt: string;
}

type AccessState = "loading" | "allowed" | "denied";

export default function StandardAdminClient({
  catalog,
}: {
  catalog: TextbookCatalog;
}) {
  const [access, setAccess] = useState<AccessState>("loading");
  const [drafts, setDrafts] = useState<StandardDraftOverview[] | null>(null);
  const [failed, setFailed] = useState(false);

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [unitId, setUnitId] = useState(catalog[0]?.unitId ?? "");
  const [moduleKind, setModuleKind] = useState(
    catalog[0]?.modules[0]?.moduleKind ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 管理员门禁（非管理员不渲染任何表单，与 /admin 同约定）
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { account?: { isAdmin?: boolean } } | null;
      })
      .then((body) => {
        if (!cancelled) setAccess(body?.account?.isAdmin ? "allowed" : "denied");
      })
      .catch(() => {
        if (!cancelled) setAccess("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      // 本页只管标准内容；type=standard 服务端过滤（V0.2 整改），
      // 管理员自己的自定义草稿归「自定义内容」页
      const res = await fetch("/api/drafts?type=standard");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const body = (await res.json()) as { drafts?: StandardDraftOverview[] };
      setDrafts(body.drafts ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (access === "allowed") void loadDrafts();
  }, [access, loadDrafts]);

  const selectedUnit = catalog.find((u) => u.unitId === unitId);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading) return;
    if (!title.trim()) {
      setError("请先给内容起个标题");
      return;
    }
    if (!unitId || !moduleKind) {
      setError("请选择教材单元与模块");
      return;
    }
    if (!file) {
      setError("请选择要上传的视频文件");
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("file", file);
      form.set("type", "standard");
      form.set("unitId", unitId);
      form.set("moduleKind", moduleKind);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (res.status === 201) {
        const body = (await res.json()) as { draft?: { id: string } };
        setTitle("");
        setFile(null);
        await loadDrafts();
        if (body.draft?.id) {
          setNotice("上传成功，转写完成后去校对文本。");
        }
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

  async function handlePublish(draft: StandardDraftOverview) {
    if (publishingId) return;
    if (
      !window.confirm(
        `确定把「${draft.title}」定稿发布吗？发布后所有账号可见。`
      )
    ) {
      return;
    }
    setPublishingId(draft.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/publish`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDrafts();
        setNotice("已定稿发布，所有账号的「教材内容」里都能看到。");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "定稿失败，请重试");
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setPublishingId(null);
    }
  }

  async function handleDelete(draft: StandardDraftOverview) {
    if (deletingId) return;
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

  if (access === "loading") {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <p className="text-lg text-slate-400">加载中…</p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">标准内容制作</h1>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          加载失败，请刷新重试
        </p>
      </div>
    );
  }

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-3xl font-bold tracking-tight">标准内容制作</h1>
        <p className="mt-8 rounded-3xl bg-white p-8 text-center text-lg text-slate-500 shadow-md ring-1 ring-slate-100" role="alert">
          此页面仅管理员可见。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <a href="/admin" className="text-lg text-emerald-700">
        ← 返回管理
      </a>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">标准内容制作</h1>
      <p className="mt-2 text-xl text-slate-500">
        上传对应教材模块的课堂视频，校对时对照教材原文，定稿后全账号可见
      </p>

      <form
        onSubmit={handleUpload}
        className="mt-6 rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100"
      >
        <label htmlFor="std-title" className="block text-lg font-semibold">
          标题
        </label>
        <input
          id="std-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="比如：五上 U2 Story time"
          className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

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
                const unit = catalog.find((u) => u.unitId === e.target.value);
                setModuleKind(unit?.modules[0]?.moduleKind ?? "");
              }}
              className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-lg ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {catalog.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.unitId} {u.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="std-module" className="block text-lg font-semibold">
              栏目
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
        {notice && (
          <p role="status" className="mt-4 text-lg text-emerald-600">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={uploading || !file}
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
        <div className="mt-8 space-y-6">
          <h2 className="text-2xl font-bold tracking-tight">我的标准草稿</h2>
          {drafts.length === 0 ? (
            <p className="rounded-3xl bg-white p-10 text-center text-xl text-slate-500 shadow-md ring-1 ring-slate-100">
              还没有制作中的标准内容，从上面开始吧
            </p>
          ) : (
            drafts.map((draft) => {
              const badge = STATUS_BADGES[draft.status];
              return (
                <div
                  key={draft.id}
                  className="rounded-3xl bg-white p-7 shadow-md ring-1 ring-slate-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-2xl font-bold">{draft.title}</h3>
                    <span
                      className={`shrink-0 rounded-full px-4 py-1 text-lg font-bold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1 text-lg text-slate-500">
                    {draft.unitId && draft.moduleKind
                      ? `${draft.unitId} · ${draft.moduleKind} · `
                      : ""}
                    {draft.sentenceCount} 句
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {draft.status === "proofreading" && (
                      <>
                        <a
                          href={`/drafts/${draft.id}/proofread`}
                          className="text-lg font-semibold text-emerald-700"
                        >
                          去校对 →
                        </a>
                        <a
                          href={`/drafts/${draft.id}/cutpoint`}
                          className="text-lg font-semibold text-emerald-700"
                        >
                          调切点 →
                        </a>
                        <button
                          type="button"
                          onClick={() => void handlePublish(draft)}
                          disabled={publishingId === draft.id}
                          className="rounded-2xl bg-emerald-500 px-5 py-2 text-lg font-semibold text-white shadow-sm active:bg-emerald-600 disabled:opacity-40"
                        >
                          {publishingId === draft.id ? "定稿中…" : "定稿发布"}
                        </button>
                      </>
                    )}
                    {draft.status === "published" && (
                      <a
                        href={`/units/${draft.id}`}
                        className="text-lg font-semibold text-emerald-700"
                      >
                        查看 →
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete(draft)}
                      disabled={deletingId === draft.id}
                      className="ml-auto rounded-2xl bg-slate-50 px-4 py-2 text-lg font-semibold text-slate-500 ring-1 ring-slate-200 active:bg-slate-100 disabled:opacity-40"
                    >
                      {deletingId === draft.id ? "删除中…" : "删除"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
