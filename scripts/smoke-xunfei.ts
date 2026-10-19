// 集成冒烟（联调点 A，票 03 验收）：固定原声样本 + 教材原文真实调用讯飞。
// 平时不进日常测试循环；需要密钥、网络，消耗免费额度。
// 用法: npx tsx --env-file=.env scripts/smoke-xunfei.ts [audio.m4a|wav] [教材原文]
// 不带参数时使用内置默认配对（testdata/u2-s04-reference.m4a：TTS 标准朗读）。
// 注意：素材原声带 BGM，分数会很低——评分只针对孩子在安静环境的录音，
// 冒烟样本必须是干净语音。
import { readFileSync } from "node:fs";
import path from "node:path";
import { transcodeTo16kWav } from "../src/lib/scoring/transcode.ts";
import { createScoringServiceFromEnv } from "../src/lib/scoring/xunfei/service.ts";

const DEFAULT_FIXTURE = path.join(
  import.meta.dirname,
  "../testdata/u2-s04-reference.m4a"
);
const DEFAULT_TEXT = "Minmin, listen to the music and follow it.";

const audioPath = process.argv[2] ?? DEFAULT_FIXTURE;
const text = process.argv[3] ?? DEFAULT_TEXT;

console.log(`教材原文: "${text}"`);
const input = readFileSync(audioPath);
console.log(`样本: ${audioPath}（${input.length} bytes）`);

async function main() {
  const wav = audioPath.endsWith(".wav") ? input : await transcodeTo16kWav(input);
  console.log(`转码后 WAV: ${wav.length} bytes（16kHz/16bit/mono）`);

  const service = createScoringServiceFromEnv();
  const { score } = await service.score({ text, audioWav: wav });
  console.log(`总分: ${score}`);

  // 固定样本是素材视频里的示范原声（对照教材原文朗读），期望高分；
  // 低于 60 说明协议、转码或评分基准出了问题。
  if (score < 60) {
    console.error(`SMOKE FAIL: 原声样本得分 ${score} < 60`);
    process.exit(1);
  }
  console.log("SMOKE PASS ✓");
}

main().catch((err) => {
  console.error("SMOKE FAIL:", (err as Error).message);
  process.exit(1);
});
