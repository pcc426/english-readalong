// 集成冒烟（票 06 验收）：固定小视频 + 真实讯飞 LFASR。
// 平时不进日常测试循环；需要密钥、网络，按音频时长计费。
// 用法: npx tsx --env-file=.env scripts/smoke-lfasr.ts [video-or-audio-file]
// 不带参数时用 testdata/u2-s04.m4a（教材课文原声，约 9 秒）。
// 未配置 LFASR_APP_ID / LFASR_API_KEY / LFASR_API_SECRET 时打印 SKIP 退出 0。
//
// 断言：得到句子级文本与起止时间（毫秒），0 ≤ start < end 且文本非空。
// 若传 mp4/mov/m4v 且 LFASR 拒收视频：按 ADR-0004 用 LFASR_EXTRACT_AUDIO=1
// 重试（ffmpeg 先抽音轨）。
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createUploadPayloadBuilder } from "../src/lib/drafts/transcription/xunfei/payload.ts";
import {
  XunfeiTranscriptionService,
} from "../src/lib/drafts/transcription/xunfei/service.ts";

const DEFAULT_FIXTURE = path.join(
  import.meta.dirname,
  "../testdata/u2-s04.m4a"
);
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 小文件 10 分钟足够（讯飞 SLA 5 小时）

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v"]);

async function main() {
  const appId = process.env.LFASR_APP_ID;
  const apiKey = process.env.LFASR_API_KEY;
  const apiSecret = process.env.LFASR_API_SECRET;
  if (!appId || !apiKey || !apiSecret) {
    console.log(
      "SKIP: 未配置 LFASR_APP_ID / LFASR_API_KEY / LFASR_API_SECRET（.env），不跑真实冒烟"
    );
    return;
  }

  const filePath = process.argv[2] ?? DEFAULT_FIXTURE;
  const ext = path.extname(filePath).toLowerCase();
  if (VIDEO_EXTS.has(ext)) {
    console.log(
      `提示：${ext} 是视频容器，LFASR 是否直接接受待真机确认；` +
        `若被拒收，用 LFASR_EXTRACT_AUDIO=1 重试（ffmpeg 抽音轨）`
    );
  }

  // 适配器按 uploads 根相对路径读文件：把样本拷进临时 uploads 目录再提交
  const uploadsDir = mkdtempSync(path.join(tmpdir(), "smoke-lfasr-"));
  process.env.UPLOADS_DIR = uploadsDir;
  mkdirSync(path.join(uploadsDir, "smoke"), { recursive: true });
  const relPath = `smoke/sample${ext}`;
  copyFileSync(filePath, path.join(uploadsDir, relPath));
  try {
    const extractAudio = process.env.LFASR_EXTRACT_AUDIO === "1";
    const buildPayload = createUploadPayloadBuilder({ extractAudio });
    const payload = await buildPayload(relPath);
    console.log(
      `样本: ${filePath}（${payload.data.length} bytes，时长约 ${payload.durationSec}s）`
    );

    const service = new XunfeiTranscriptionService(
      { appId, apiKey, apiSecret },
      { buildPayload }
    );

    const { taskId } = await service.submit({ videoPath: relPath });
    console.log(`已提交，任务 id: ${taskId}，开始轮询…`);

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    for (;;) {
      if (Date.now() > deadline) {
        console.error(`SMOKE FAIL: ${POLL_TIMEOUT_MS / 1000}s 内未转写完成`);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const result = await service.poll(taskId);
      if (result.state === "pending") {
        process.stdout.write(".");
        continue;
      }
      if (result.state === "failed") {
        console.error(`\nSMOKE FAIL: 讯飞返回失败——${result.error}`);
        process.exit(1);
      }
      const sentences = result.sentences;
      console.log(`\n识别到 ${sentences.length} 句：`);
      for (const s of sentences) {
        console.log(`  [${s.startMs}–${s.endMs}ms] ${s.text}`);
      }
      if (sentences.length === 0) {
        console.error("SMOKE FAIL: 未得到任何句子");
        process.exit(1);
      }
      for (const s of sentences) {
        if (!s.text.trim() || s.startMs < 0 || s.endMs <= s.startMs) {
          console.error(`SMOKE FAIL: 句子不合法 ${JSON.stringify(s)}`);
          process.exit(1);
        }
      }
      const last = sentences[sentences.length - 1];
      console.log(`语音覆盖到 ${last.endMs}ms`);
      console.log("SMOKE PASS ✓");
      return;
    }
  } finally {
    rmSync(uploadsDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("SMOKE FAIL:", (err as Error).message);
  process.exit(1);
});
