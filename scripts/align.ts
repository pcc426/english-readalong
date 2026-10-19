// 一次性素材对齐工具（票 01）：whisper 词级转写 JSON + 教材权威句子清单
// → 每句的起止时间与对齐状态。
// 用法: npx tsx scripts/align.ts <whisper.json> <sentences.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { alignSentences, type WhisperWord } from "../src/lib/alignment/align.ts";

const [whisperPath, sentencesPath, outPath] = process.argv.slice(2);
if (!whisperPath || !sentencesPath || !outPath) {
  console.error("用法: node --experimental-strip-types scripts/align.ts <whisper.json> <sentences.json> <out.json>");
  process.exit(1);
}

const whisper = JSON.parse(readFileSync(whisperPath, "utf8"));
const { sentences } = JSON.parse(readFileSync(sentencesPath, "utf8"));

const words: WhisperWord[] = (whisper.transcription ?? []).map((s: { text: string; offsets: { from: number; to: number } }) => ({
  text: s.text.trim(),
  start: s.offsets.from / 1000,
  end: s.offsets.to / 1000,
}));

const result = alignSentences(sentences, words);
writeFileSync(outPath, JSON.stringify(result, null, 2));

const lines = result.map((r) => {
  const time = r.start == null || r.end == null ? "--" : `${r.start.toFixed(2)}–${r.end.toFixed(2)}s`;
  const flag = { matched: "✓", uncertain: "⚠", missing: "✗" }[r.status];
  const heard = r.heard ? ` | 音频: "${r.heard}"` : "";
  return `${flag} ${String(r.index + 1).padStart(2)}. [${time}] (相似度 ${r.similarity ?? "–"}) ${r.text}${heard}`;
});
console.log(lines.join("\n"));
