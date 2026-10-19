# 校对清单：U2/U3 素材切分定稿（票 01）——✅ 已校对定稿（2026-10-19）

**家长校对决定：**
1. U2 第 1 句以听音为准，读完 "you" 约 5.5s 结束 → [0.00–5.50]；"Stop!" 顺延 [5.50–6.05]
2. U2 排除 8 句旁白：确认
3. U2 第 1 句文本含 "you!"
4. U3 第 3 句冲突句：**以教材原文为准**（音频读音可能带口音/偏差，仍以教材文本提交评测）
5. U3 第 5 句起点按听音约 19.6s → [19.60–23.30]；第 4 句收尾至 19.60

---

# 以下为原始对齐报告（存档）

生成方式：教材原文为权威句子清单 → whisper（base.en，词级时间戳）已知文本对齐 → 人工比对画面字幕。**⚠ 项需要你听音频确认；✗ 项默认从内容包排除。**

## U2《The dragon dance》（30 秒，视频只朗读了以下 7 句）

| # | 起止时间 | 教材原文 | 状态 |
|---|---|---|---|
| 1 | 0.00–4.71s | Head of the dragon, slow down! We can't keep up with you! | ⚠ 听 4.0–5.2s：结尾是否含 "you!"（whisper 词流停在 "with"） |
| 2 | 5.02–5.72s | Stop! | ✓ |
| 3 | 6.05–12.98s | To play well, all the students at the dragon's head, body and tail need to be in step. | ✓ |
| 4 | 14.54–17.58s | Minmin, listen to the music and follow it. | ✓ |
| 5 | 17.58–19.58s | Everyone, follow Minmin. | ✓ |
| 6 | 21.03–21.87s | Let's try again. | ✓ |
| 7 | 22.17–29.20s | This time, all the players keep the same pace and the long dragon comes to life. | ✓ |

**未入视频的教材句（默认排除，8 句）**：故事开头的旁白（"The students in the dragon dance team are training hard…"、"As the head of the dragon, Minmin runs very fast."、"Xiaopu calls out at the tail of the dragon."、"The background music is loud."、"Minmin can't hear Xiaopu."、"He runs even faster."、"The players at the tail of the dragon lose control of the sticks."、"Mr Zhong calls out."）。对齐器报告的 3 条 ⚠ 低相似度匹配（相似度 0.5 左右）经比对均为上述视频内句子的误配，已剔除。

## U3《Parts of plants》（23.3 秒，5 句全部命中）

| # | 起止时间 | 教材原文 | 状态 |
|---|---|---|---|
| 1 | 0.00–5.87s | The roots hold the plant in place, and take in food and water. | ✓ 相似度 1.0 |
| 2 | 5.87–12.60s | The stem moves water up the plant, and brings water to the leaves. | ✓ 相似度 1.0 |
| 3 | 12.60–17.63s | The leaves take in the sunlight, and grow bigger and bigger. | ⚠ **冲突句**。whisper 听到 "…tin the sunlight and grow in bigger"，视频画面字幕是 "turn the sunlight and growing bigger"，教材是 "take in the sunlight, and grow bigger"。三者不一致——请听 12.6–17.6s 判断音频实际读的是什么 |
| 4 | 17.63–23.31s | The flowers soon come out, and grow into a fruit holding seeds. | ✓ 相似度 1.0（但 4、5 句边界需复核，见下） |
| 5 | 23.31–23.31s | The seeds fall into the soil, and a new plant grows. | ⚠ 起止时间塌缩成同一点（视频结尾词时间戳退化）。估计真实边界约 20.5–23.3s，请听 19.5–23.3s 告诉我大致从哪开始（比如"flowers 那句结束后"） |

## 你需要做的决定

1. **U2 七句清单与时间**：抽查试听 1–2 句确认时间准不准（播放视频拖到对应秒数即可）。
2. **U2 排除 8 句**：同意默认排除吗？
3. **U2 第 1 句结尾**：有没有 "you!"？（决定该句文本）
4. **U3 第 3 句（冲突句）**：音频实际读的是什么？句子文本以哪个为准——(a) 教材原文（孩子读正确的英语，但和示范音频不一致会影响评分公平性）；(b) 音频实际读音（跟读体验一致，但英语本身不规范）。我的建议：**以音频实际读音为准**（跟读的文本必须和示范一致），教材原文保留在 `source` 里备查。你也可以干脆弃用这句。
5. **U3 第 5 句边界**：告诉我大概起点。

## 试听命令（可选）

```bash
ffplay -ss 12.6 -t 5 materials/五上_U3.mp4
```

（`-ss` 起点秒、`-t` 时长秒；U2 同理换文件名和时间。）
