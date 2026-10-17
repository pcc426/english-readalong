# 01: U2/U3 素材切分与校对定稿

**What to build:** 从两个素材视频（五上 U2、U3）和教材原文出发，产出两个单元的定稿内容包数据：每个句子（Sentence）的教材原文文本和视频内起止时间。方法：本地 whisper 已知文本对齐（教材 Story time《The dragon dance》与 Chant time《Parts of plants》为权威句子清单），与画面字幕交叉参考（字幕只作参考，非权威来源）；素材音频/字幕与教材原文冲突的句子在清单中标记。产出校对清单交家长校对，按校对意见定稿（含每处冲突句的取舍决定）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] U2、U3 每个句子有教材原文文本 + 起止时间（秒）
- [ ] 音频与教材原文不一致的句子已标记，家长对每处冲突给出处理决定
- [ ] 家长已确认校对清单，数据定稿
- [ ] 定稿数据以 spec 约定的内容包格式落盘，供内容包加载使用
