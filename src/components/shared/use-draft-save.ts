"use client";

// 校对/切点两页共享的「单句保存」hook（V0.2 整改）。
// 两页的 commitSave 骨架完全同构：saving/saved/error 三态 + 已保存提示
// 定时清除 + 「没变不发请求」（服务端基线比对）+ 防抖自动保存；
// 差异只在比对键（文本 vs 起止毫秒）与请求体，经 keyOf/bodyFor 注入。
// 行为约束（与抽取前逐条对应）：
// - 没变不发请求，但要把该句的残留提示清掉；
// - 带 overrides（确认/采用教材原文）时跳过比对直接发；
// - 成功后以服务端返回的句子为准更新基线与页面状态；
// - saved 提示 SAVED_HINT_MS 后清除（期间若变回 saving/saved 之外的
//   状态则不动）；失败置 error，等下一次操作覆盖。
import { useCallback, useRef, useState } from "react";
import type {
  DraftSentenceView,
  SentenceUpdateResponse,
} from "@/components/proofread/types";

export const DEBOUNCE_MS = 800;
export const SAVED_HINT_MS = 1500;

export type SentenceSaveState = "saving" | "saved" | "error";

export interface SentenceSaveOverrides {
  /** 跳过「没变不发请求」（确认/采用等带指定内容的保存） */
  force?: boolean;
  /** 覆盖请求体（如采用教材原文时的 { text }） */
  body?: Record<string, unknown>;
}

interface SentenceSaveOptions {
  draftId: string | undefined;
  /** 服务端比对键：与基线相同则不发请求 */
  keyOf: (s: DraftSentenceView) => string;
  /** PUT 请求体（缺省保存当前句的写法） */
  bodyFor: (s: DraftSentenceView) => Record<string, unknown>;
  /** 把服务端返回的句子应用到页面状态 */
  applySentence: (sentence: DraftSentenceView) => void;
  /** 当前句子（页面自己的 sentences 镜像 ref 里找） */
  getSentence: (index: number) => DraftSentenceView | undefined;
}

export function useSentenceSave(options: SentenceSaveOptions) {
  const [saveStates, setSaveStates] = useState<Record<number, SentenceSaveState>>({});
  /** 每句最近一次服务端确认的比对键 */
  const serverKeys = useRef<Record<number, string>>({});
  /** 每句的防抖保存定时器 */
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // 函数型 options 每次渲染都是新引用，经 ref 转发保持 commitSave 等稳定
  const optionsRef = useRef(options);
  optionsRef.current = options;

  function clearOne(index: number) {
    setSaveStates((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  /** 初始装载 / 删除合并换血后：以服务端数组重建基线 */
  const seedServerState = useCallback((sentences: DraftSentenceView[]) => {
    serverKeys.current = Object.fromEntries(
      sentences.map((s) => [s.index, optionsRef.current.keyOf(s)])
    );
  }, []);

  /** 清掉全部未触发的防抖定时器（换血、整页确认前） */
  const clearTimers = useCallback(() => {
    for (const t of Object.values(timers.current)) clearTimeout(t);
    timers.current = {};
  }, []);

  /** 清单句的未触发定时器（失焦立即保存、切句补存前） */
  const cancelTimer = useCallback((index: number) => {
    clearTimeout(timers.current[index]);
    delete timers.current[index];
  }, []);

  /** 清空全部保存态提示（换血后现场重置） */
  const clearSaveStates = useCallback(() => setSaveStates({}), []);

  /** 保存一句：没变不发请求；overrides.force 跳过比对、body 覆盖请求体 */
  const commitSave = useCallback(
    async (index: number, overrides?: SentenceSaveOverrides) => {
      const { getSentence, keyOf, bodyFor, applySentence, draftId } =
        optionsRef.current;
      const target = getSentence(index);
      if (!target || !draftId) return;
      if (!overrides?.force && keyOf(target) === serverKeys.current[index]) {
        clearOne(index);
        return;
      }
      setSaveStates((prev) => ({ ...prev, [index]: "saving" }));
      try {
        const res = await fetch(`/api/drafts/${draftId}/sentences/${index}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(overrides?.body ?? bodyFor(target)),
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as SentenceUpdateResponse;
        serverKeys.current[index] = keyOf(body.sentence);
        applySentence(body.sentence);
        setSaveStates((prev) => ({ ...prev, [index]: "saved" }));
        setTimeout(() => {
          setSaveStates((prev) => {
            if (prev[index] !== "saved") return prev;
            const next = { ...prev };
            delete next[index];
            return next;
          });
        }, SAVED_HINT_MS);
      } catch {
        setSaveStates((prev) => ({ ...prev, [index]: "error" }));
      }
    },
    []
  );

  /** 防抖自动保存（文本改动 / 起止微调共用） */
  const scheduleSave = useCallback(
    (index: number) => {
      clearTimeout(timers.current[index]);
      timers.current[index] = setTimeout(
        () => void commitSave(index),
        DEBOUNCE_MS
      );
    },
    [commitSave]
  );

  /** 整页确认等绕过 commitSave 的路径：记录服务端基线并应用返回句子 */
  const noteServerSentence = useCallback((sentence: DraftSentenceView) => {
    serverKeys.current[sentence.index] = optionsRef.current.keyOf(sentence);
    optionsRef.current.applySentence(sentence);
  }, []);

  return {
    saveStates,
    commitSave,
    scheduleSave,
    seedServerState,
    clearTimers,
    cancelTimer,
    clearSaveStates,
    noteServerSentence,
  };
}
