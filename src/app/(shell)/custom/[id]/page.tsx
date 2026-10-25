"use client";

// 草稿详情（票 05）：只读展示转写句子与起止时间 + 鉴权视频播放。
// 文本/切点校对编辑属 07/08 号票，这里先给校对入口的落点。
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface DraftSentenceView {
  index: number;
  text: string;
  startMs: number;
  endMs: number;
  proofread: string;
}

interface DraftDetail {
  id: string;
  title: string;
  status: "transcribing" | "proofreading" | "published";
  videoUrl: string;
  transcribeError: string | null;
  sentences: DraftSentenceView[];
}

const STATUS_BADGES: Record<DraftDetail["status"], { label: string; className: string }> = {
  transcribing: { label: "转写中", className: "bg-sky-100 text-sky-700" },
  proofreading: { label: "待校对", className: "bg-amber-100 text-amber-700" },
  published: { label: "已定稿", className: "bg-emerald-100 text-emerald-700" },
};

/** 毫秒 → m:ss.s（校对页也按这个口径展示起止） */
function formatMs(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export default function DraftDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/drafts/${id}`);
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const body = (await res.json()) as { draft?: DraftDetail };
        if (!cancelled) setDraft(body.draft ?? null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (failed || draft === null) {
    return (
      <div className="mx-auto max-w-xl px-5 py-8">
        <a href="/custom" className="text-lg text-emerald-700">
          ← 返回自定义内容
        </a>
        <p className="mt-8 text-lg text-slate-400" role="alert">
          {failed ? "加载失败，请刷新重试" : "加载中…"}
        </p>
      </div>
    );
  }

  const badge = STATUS_BADGES[draft.status];
  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <a href="/custom" className="text-lg text-emerald-700">
        ← 返回自定义内容
      </a>
      <div className="mt-4 flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{draft.title}</h1>
        <span className={`rounded-full px-4 py-1 text-lg font-bold ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {draft.status === "transcribing" && (
        <p className="mt-4 rounded-2xl bg-sky-50 px-5 py-4 text-lg text-sky-700">
          正在转写，完成后回来校对句子。
        </p>
      )}
      {draft.transcribeError && (
        <p className="mt-4 rounded-2xl bg-red-50 px-5 py-4 text-lg text-red-600" role="alert">
          转写失败：{draft.transcribeError}
        </p>
      )}

      {draft.videoUrl && (
        <video
          controls
          src={draft.videoUrl}
          className="mt-6 w-full rounded-3xl bg-black shadow-md"
        />
      )}

      <h2 className="mt-8 text-xl font-bold text-slate-700">
        句子（{draft.sentences.length}）
      </h2>
      <ol className="mt-3 space-y-3">
        {draft.sentences.map((s) => (
          <li
            key={s.index}
            className="rounded-2xl bg-white p-5 shadow-md ring-1 ring-slate-100"
          >
            <p className="text-lg font-semibold leading-relaxed">{s.text}</p>
            <p className="mt-1 text-base text-slate-400">
              {formatMs(s.startMs)} – {formatMs(s.endMs)}
            </p>
          </li>
        ))}
      </ol>
      {draft.sentences.length === 0 && draft.status !== "transcribing" && (
        <p className="mt-3 text-lg text-slate-400">暂无句子</p>
      )}
      {draft.status === "proofreading" && (
        <a
          href={`/drafts/${draft.id}/proofread`}
          className="mt-6 block rounded-2xl bg-emerald-500 py-4 text-center text-xl font-bold text-white shadow-md active:bg-emerald-600"
        >
          去校对 →
        </a>
      )}
      <p className="mt-8 text-base text-slate-400">
        切点校对工具即将上线，本页暂为只读预览。
      </p>
    </div>
  );
}
