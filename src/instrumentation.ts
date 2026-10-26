import { xunfeiTranscriptionConfigured } from "./lib/drafts/transcription/env";

/**
 * Next.js 服务端启动钩子（Next 15 稳定特性，src 布局下放 src/）。
 *
 * 职责只有一件事（票 06 验收：进程重启后「转写中」的草稿恢复轮询，
 * 不会永久卡住）：服务进程起来时，把库里 status=transcribing 且有
 * transcribe_task_id 的草稿重新拉进退避轮询循环。
 *
 * 三道门槛（缺一不启动，均为进程环境判断，逻辑收在 shouldResumePolling）：
 * - 仅 nodejs runtime：轮询依赖 better-sqlite3 与 node fetch，edge 不适用；
 * - 非 next build 阶段：构建期的静态预收集不许碰运行库；
 * - 仅配了真实讯飞 LFASR 凭据：fake 模式没有远端任务可查。
 * 重模块（better-sqlite3 经 db 模块）动态导入，避免被 edge 打包器拉进去。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!xunfeiTranscriptionConfigured(process.env)) return;
  const [{ dbPath, openDb }, { resumeTranscriptionPolling }] = await Promise.all([
    import("./lib/db"),
    import("./lib/drafts/transcription/poller"),
  ]);
  const resumed = resumeTranscriptionPolling(openDb(dbPath()));
  if (resumed > 0) {
    console.log(`[lfasr] 已恢复 ${resumed} 个转写中草稿的轮询`);
  }
}
