"use client";

// 标准内容制作的客户端表单与草稿列表（票 12 + 票 02）。
// 表单不再收自由标题：版本固定显示「沪教版（上教新版）」，学期/单元/栏目逐级联动，
// 选完栏目实时预览 主标题（课文名）+ 枚举串（生成器 buildEnumTitle，纯函数）。
// 提交只带 type + unitId + moduleKind + file；服务端查注册表后用课文名生成草稿标题，
// 枚举串由草稿字段现算（见 src/lib/textbook/title.ts）。
// 上传走 POST /api/uploads（服务端二次校验管理员与版本/书/单元/模块）；
// 定稿发布只从预览页发起（V0.3 票 09 / ADR 0005），此列表入口为「去预览」；
// standard 包定稿后落在公开标准目录，全账号可见。UI 不做自动化测试，走手工验收清单。
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { STATUS_BADGES, previewGate } from "@/components/shared/draft-ui";
import { MAX_MB } from "@/components/shared/upload-precheck";
import { VideoFileField } from "@/components/shared/video-file-field";
import { buildEnumTitle } from "@/lib/textbook/title";

export interface TextbookCatalogUnit {
  unitId: string;
  index: number;
  title: string;
  modules: Array<{ moduleKind: string; title: string; sentenceCount: number }>;
}

/** 注册表里的一册（学期下拉项）；units 是该册的单元/栏目清单 */
export interface TextbookCatalogBook {
  id: string;
  shortName: string;
  display: string;
  units: TextbookCatalogUnit[];
}

/** 服务端从教材注册表取出的版本 + 书目清单（RSC props 传入） */
export interface TextbookCatalog {
  series: { shortName: string; display: string };
  books: TextbookCatalogBook[];
}

// 与 GET /api/drafts 响应对应（壳只走 HTTP，不从 src/lib 引类型）
interface StandardDraftOverview {
  id: string;
  title: string;
  type: string;
  unitId: string | null;
  moduleKind: string | null;
  status: "transcribing" | "proofreading" | "published";
  sentenceCount: number;
  confirmedCount: number;
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

  const [file, setFile] = useState<File | null>(null);
  const [bookId, setBookId] = useState(catalog.books[0]?.id ?? "");
  const [unitId, setUnitId] = useState(
    catalog.books[0]?.units[0]?.unitId ?? ""
  );
  const [moduleKind, setModuleKind] = useState(
    catalog.books[0]?.units[0]?.modules[0]?.moduleKind ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // V0.2.4 票 04：退回校对的进行中反馈
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);

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

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (uploading) return;
    if (!bookId || !unitId || !moduleKind) {
      setError("请选择学期、教材单元与栏目");
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
      form.set("file", file);
      form.set("type", "standard");
      form.set("unitId", unitId);
      form.set("moduleKind", moduleKind);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (res.status === 201) {
        const body = (await res.json()) as { draft?: { id: string } };
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

  /** V0.2.4 票 04：退回校对。强确认写明清空后果；成功后刷新列表（卡片回校对态） */
  async function handleUnpublish(draft: StandardDraftOverview) {
    if (unpublishingId) return;
    if (
      !window.confirm(
        `确定把「${draft.title}」退回校对吗？\n\n` +
          `· 该内容会立即从所有家庭的练习列表中消失；\n` +
          `· 所有家庭在这条内容上的练习记录将被清空；\n` +
          `· 校对成果保留，改完后重新定稿即可（练习链接不变）。`
      )
    ) {
      return;
    }
    setUnpublishingId(draft.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/unpublish`, {
        method: "POST",
      });
      if (res.ok) {
        await loadDrafts();
        setNotice("已退回校对，改完句子重新确认并定稿即可重新发布。");
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(body?.error?.message ?? "退回失败，请重试");
    } catch {
      setError("网络开小差了，请重试");
    } finally {
      setUnpublishingId(null);
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

        {selectedModule && (
          <div className="mt-5 rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
            <p className="text-base text-slate-400">标题（自动生成，不可手改）</p>
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
              // 票 09：与校对页/custom 详情同一把尺（previewGate）
              const gate = previewGate(draft.sentenceCount, draft.confirmedCount);
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
                    {draft.status === "proofreading" &&
                      ` · 已确认 ${draft.confirmedCount}/${draft.sentenceCount}`}
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
                        {gate.canPreview ? (
                          /* V0.3 票 09 / ADR 0005：定稿发布只从预览页发起，此处只送人去预览 */
                          <button
                            type="button"
                            onClick={() => {
                              window.location.href = `/drafts/${draft.id}/preview`;
                            }}
                            className="rounded-2xl bg-emerald-500 px-5 py-2 text-lg font-semibold text-white shadow-sm active:bg-emerald-600 disabled:opacity-40"
                          >
                            去预览
                          </button>
                        ) : (
                          <span className="text-base text-slate-400">
                            还有 {gate.unconfirmedCount}{" "}
                            句未确认，确认完才能定稿
                          </span>
                        )}
                      </>
                    )}
                    {draft.status === "published" && (
                      <>
                        <a
                          href={`/units/${draft.id}`}
                          className="text-lg font-semibold text-emerald-700"
                        >
                          查看 →
                        </a>
                        <button
                          type="button"
                          onClick={() => void handleUnpublish(draft)}
                          disabled={unpublishingId === draft.id}
                          className="rounded-2xl bg-red-50 px-4 py-2 text-lg font-semibold text-red-600 ring-1 ring-red-100 active:bg-red-100 disabled:opacity-40"
                        >
                          {unpublishingId === draft.id ? "退回中…" : "退回校对"}
                        </button>
                      </>
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
