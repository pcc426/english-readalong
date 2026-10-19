"use client";

import { useRef, useState } from "react";
import { adjustBounds, CALIBRATE_STEP, type ClipBounds } from "@/lib/domain/calibrate";
import { unitPackSchema } from "@/lib/content/schema";
import type { UnitDetail } from "@/lib/units";

type EditableSentence = {
  index: number;
  text: string;
  bounds: ClipBounds;
};

export default function Calibrator({ unit }: { unit: UnitDetail }) {
  const [sentences, setSentences] = useState<EditableSentence[]>(() =>
    unit.sentences.map((s) => ({
      index: s.index,
      text: s.text,
      bounds: { start: s.start ?? 0, end: s.end ?? 0 },
    }))
  );
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const sentence = sentences[current];

  const adjust = (field: "start" | "end", delta: number) => {
    setSentences((prev) =>
      prev.map((s, i) =>
        i === current ? { ...s, bounds: adjustBounds(s.bounds, field, delta) } : s
      )
    );
    setCopied(false);
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = sentence.bounds.start;
    video.play().catch(() => {});
  };
  const stop = () => videoRef.current?.pause();

  // 播到终点自动停
  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.currentTime >= sentence.bounds.end) video.pause();
  };

  const exportJson = async () => {
    const pack = {
      id: unit.id,
      title: unit.title,
      source: unit.source,
      video: unit.video.replace("/media/", ""),
      sentences: sentences.map((s) => ({
        text: s.text,
        start: Number(s.bounds.start.toFixed(2)),
        end: Number(s.bounds.end.toFixed(2)),
      })),
    };
    // 导出前用内容包 schema 自检，防止 UI 层形状与 schema 漂移
    const check = unitPackSchema.safeParse(pack);
    if (!check.success) {
      window.alert(`导出的 JSON 未通过内容包校验：${check.error.issues[0]?.message}`);
      return;
    }
    const json = JSON.stringify(check.data, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      // 剪贴板不可用时把 JSON 显示出来手动复制
      window.prompt("复制以下 JSON：", json);
    }
  };

  return (
    <div className="mt-5">
      <video
        ref={videoRef}
        src={encodeURI(unit.video)}
        playsInline
        preload="metadata"
        onTimeUpdate={onTimeUpdate}
        className="w-full rounded-2xl bg-black shadow-md"
      />

      <section className="mt-4 rounded-3xl bg-white p-5 shadow-md ring-1 ring-slate-100">
        <p className="text-xl font-semibold">
          {current + 1}. {sentence.text}
        </p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">
          {sentence.bounds.start.toFixed(2)}s → {sentence.bounds.end.toFixed(2)}s
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 text-lg font-bold">
          <button onClick={() => adjust("start", -CALIBRATE_STEP)} className="rounded-xl bg-slate-100 py-3 active:bg-slate-200">
            起点 −0.25s
          </button>
          <button onClick={() => adjust("start", CALIBRATE_STEP)} className="rounded-xl bg-slate-100 py-3 active:bg-slate-200">
            起点 ＋0.25s
          </button>
          <button onClick={() => adjust("end", -CALIBRATE_STEP)} className="rounded-xl bg-slate-100 py-3 active:bg-slate-200">
            终点 −0.25s
          </button>
          <button onClick={() => adjust("end", CALIBRATE_STEP)} className="rounded-xl bg-slate-100 py-3 active:bg-slate-200">
            终点 ＋0.25s
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-lg font-bold">
          <button onClick={replay} className="rounded-xl bg-emerald-500 py-3 text-white active:bg-emerald-600">
            ▶ 播放本句
          </button>
          <button onClick={stop} className="rounded-xl bg-slate-200 py-3 active:bg-slate-300">
            ⏹ 停止
          </button>
        </div>
      </section>

      <nav className="mt-4 grid grid-cols-7 gap-2">
        {sentences.map((s) => (
          <button
            key={s.index}
            onClick={() => setCurrent(s.index)}
            className={`rounded-xl py-3 text-xl font-bold shadow-sm ${
              current === s.index
                ? "bg-emerald-500 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {s.index + 1}
          </button>
        ))}
      </nav>

      <button
        onClick={exportJson}
        className="mt-5 w-full rounded-2xl bg-slate-700 py-4 text-xl font-bold text-white active:bg-slate-800"
      >
        {copied ? "✓ 已复制到剪贴板" : "📋 导出内容包 JSON（复制后发给 Claude）"}
      </button>
    </div>
  );
}
