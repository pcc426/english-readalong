# 英文朗读评测 API 选型调研（2026-10）

> 场景：10-11 岁中国孩子（上海，沪教版牛津上海版，偏英式发音）跟读一句英语课文 → 服务端把录音发给评测 API → 拿到**句子级总分（0-100）**映射成星级反馈。MVP 为个人/家庭项目，每天几十到几百次调用。
>
> 调研日期：2026-10-16。价格与政策以官方页面为准，以下均为调研当日可查证的公开信息。

---

## 结论速览

| 结论 | 选择 |
|---|---|
| **首选** | 科大讯飞开放平台 · 语音评测 ISE（流式版） |
| **备选** | 腾讯云 · 智聆口语评测（新版 SOE-N） |
| **转码** | **必须**：iPadOS Safari MediaRecorder 产出 `audio/mp4`(AAC)，以上所有候选服务端都要用 ffmpeg 转 16kHz/16bit/单声道 WAV(PCM) |
| 不可用 | 火山引擎（无公开评测 API）、百度智能云（无公开评测 API） |

---

## 1. 科大讯飞开放平台 · 语音评测 ISE（流式版）

- 产品页：<https://www.xfyun.cn/services/ise>
- API 文档：<https://www.xfyun.cn/doc/Ise/IseAPI.html>
- FAQ：<https://www.xfyun.cn/doc/voiceservice/ise/ise_faq.html>

| 维度 | 情况 |
|---|---|
| 英文句子朗读 | 有。`read_sentence` 题型（英文支持 word / sentence / chapter；不支持自由说）。返回 0-100 的 `total_score` 及分项：`accuracy_score`（准确度）、`fluency_score`（流利度）、`standard_score`（标准度）、`integrity_score`（完整度%）。官方换算：`total = (0.6×准确度 + 0.3×流利度 + 0.1×标准度) × 完整度/100`。英文 engine 用 `ent=en_vip_sentence` |
| 英式/美式 | **文档未提供英/美口音选项**。英文评分不区分口音基准（参数里有音标显示相关开关，但评分引擎本身没有 accent 参数）。沪教版偏英式只能"凑合用"——句子级总分受口音基准影响较小，音素级纠错会偏通用/美式 |
| 童声 | 官方宣称"为各年龄段提供不同打分标准"；但**学段参数（group: pupils/junior/senior…）只对中文评测生效，英文无儿童专用模型参数**。讯飞是中高考口语考试技术供应商，对中小学生语音覆盖面广是行业默认认知 |
| 价格 | **新用户创建应用后默认免费 500 次/天**（流式版）。正式套餐：20 万次/1 年 = 1200 元（≈0.006 元/次）；100 万次/1 年 = 5800 元（≈0.0058 元/次） |
| 个人可用性 | 可以。注册讯飞开放平台 + 个人实名认证即可创建应用拿免费额度，无需企业认证 |
| 接入方式 | **WebSocket**（`wss://ise-api.xfyun.cn/v2/open-ise`），握手 URL 需用 APIKey/APIPassword 做 HMAC-SHA256 签名——**签名必须放服务端**（正好符合"服务端转发录音"的架构）。有 Java/iOS/Android/WebAPI demo |
| 音频格式 | 16kHz / 16bit / 单声道；`aue=raw`(PCM)、wav（PCM 加头）、mp3（lame）、speex-wb。**不支持 AAC/M4A** |
| 免费额度够用吗 | **够**。500 次/天 vs 需求几十~几百次/天，MVP 阶段大概率 0 成本 |

---

## 2. 腾讯云 · 智聆口语评测

两个版本，**基础版（SOE-B，文档产品号 884）已退市，只服务存量用户**（退市公告 <https://cloud.tencent.com/announce/detail/2267>），新用户必须用**新版（SOE-N，产品名 oen，文档产品号 1774）**。

- 新版产品页：<https://cloud.tencent.com/product/oen>
- 新版计费概述：<https://cloud.tencent.com/document/product/1774/107342>
- 新版使用限制：<https://cloud.tencent.com/document/product/1774/107339>
- 基础版计费（存档参考）：<https://cloud.tencent.com/document/product/884/44468>
- 基础版英式/美式参数（存档参考）：<https://cloud.tencent.com/document/product/884/19319>（`EngKind`：0=美式，1=英式）

| 维度 | 情况（新版 SOE-N） |
|---|---|
| 英文句子朗读 | 有。评测模式覆盖字/词/句/段落/自由说/多分支/关键词，句模支持中英。返回 overall（0-100）、发音准确度（GOP）、流利度、完整度，以及单词/音素级明细 |
| 英式/美式 | **新版使用限制文档明确写英文按"美式发音"（参考剑桥词典）**。基础版曾有 `EngKind=1` 英式参数，但已退市。新版可通过"指定音素/国际音标"对个别词强制英式发音，但整体基准是美式 |
| 童声 | 官方宣称"从儿童到成人全年龄覆盖"（儿童声学适配是卖点之一），无单独儿童计费 |
| 价格 | **无免费调用额度**。预付费资源包：1 万次/1 年 = **9.9 元**（限购 1 个，≈0.00099 元/次）；15 万次/1 年 = 600 元。后付费 0.005 元/次。并发数免费 50。注意：段落/自由说模式按每 20 词计 1 次（单词/句子模式 1 次=1 次） |
| 个人可用性 | 可以。注册腾讯云 + 个人实名认证，控制台开通即可，无需企业认证 |
| 接入方式 | 服务端**云 API**（TC3-HMAC-SHA256 签名，官方全语言 SDK `soe` 命名空间已封装；Go SDK：<https://cloud.tencent.com/document/product/1774/107362>），支持一次性提交整段录音（base64）与流式两种；另有 Android/iOS 客户端 SDK。纯服务端接入即可 |
| 音频格式 | **pcm / wav / mp3 / speex，16kHz 单声道**。不支持 AAC/M4A |
| 免费额度够用吗 | 没有免费额度，但 **9.9 元 = 1 万次**，按每天 300 次算能用 1 个月以上，成本可忽略 |

---

## 3. 网易有道智云 · 实时语音评测（口语评分）

- 产品页：<https://ai.youdao.com/new/product-assess.s>
- API 文档：<https://ai.youdao.com/DOCSIRMA/html/tts/api/ssyypc/index.html>
- 价格文档：<https://ai.youdao.com/DOCSIRMA/html/tts/price/yypc/index.html>

| 维度 | 情况 |
|---|---|
| 英文句子朗读 | 有。题型 word / sentence / paragraph（英语为主，也支持中文）。句子级返回 `overall`（综合 0-100）+ `integrity`（完整度）、`fluency`（流利度）、`pronunciation`（发音）分项，另有单词级、音素级明细 |
| 英式/美式 | **文档无英/美口音选项** |
| 童声 | 无英文儿童模式公开文档（中文有 `strictness=1` 儿童严格度参数） |
| 价格 | **新用户注册赠 10 元体验金**（价格页口径；部分旧文档写 50 元，以账户实际为准）。按量阶梯计费：月调用 ≤100 万次为 **50 元/万次 = 0.005 元/次**，失败不计费。资源包：5 万次/30 天 = 212 元（≈0.00424 元/次） |
| 个人可用性 | 可以。注册有道智云即可，个人可开通 |
| 接入方式 | **WebSocket**（`wss://openapi.youdao.com/stream_capt`），签名 = sha256(appKey + salt + curtime + secret)，**签名在服务端做** |
| 音频格式 | **只支持 16kHz / 16bit 的 wav（pcm_s16le）**，明确不支持 mp3/aac —— 各家中格式要求最严 |
| 免费额度够用吗 | 10 元 ≈ 2000 次按量调用，测 MVP 绰绰有余，之后 0.005 元/次也便宜 |

---

## 4. Azure AI Speech · Pronunciation Assessment

- 使用文档：<https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment>
- 支持语言：<https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support>
- 定价（国际）：<https://azure.microsoft.com/en-us/pricing/details/speech>
- 定价（中国区世纪互联）：<https://www.azure.cn/en-us/pricing/details/cognitive-services>

| 维度 | 情况 |
|---|---|
| 英文句子朗读 | 有。脚本朗读模式（scripted，带 ReferenceText）天然就是"句子朗读评测"。返回 `PronScore` 总分（HundredMark 0-100）+ Accuracy / Fluency / Completeness / Prosody 分项 |
| 英式/美式 | **唯一明确支持 en-GB（英式）的主流评测引擎**：33 个评测 locale 含 en-GB，官方 Q&A 建议评英式发音就用 en-GB locale（<https://learn.microsoft.com/en-us/answers/questions/5966025/>）。注意：韵律（prosody）评分、音节/音素名仅 en-US |
| 童声 | 无儿童专用模式/参数，通用声学模型 |
| 价格 | 按 STT 口径计费：实时转写约 **$1/小时音频** + prosody 特性 **$0.30/小时**。一句 6 秒的朗读 ≈ $0.002；每天 300 次 × 30 天 ≈ $5.4/月。**免费层 F0：每月 5 音频小时免费，评测消耗计入其中**（≈3000 次 5 秒朗读/月，评测功能在 F0 可用） |
| 中国大陆可用性 | 两条路：① **Azure 中国区（世纪互联运营）**有语音评测（¥3.05/小时/特性），但账号注册需实名、流程偏企业化，且功能/区域与国际区不完全一致；② **国际区**从上海可用（常选 East Asia/东南亚区），延迟略高、可接受，但需国际信用卡付款。对个人 MVP 是主要摩擦点 |
| 个人可用性 | 国际区：个人 + 信用卡即可。中国区世纪互联：个人注册可行但流程繁琐 |
| 接入方式 | **服务端 Speech SDK**（Python/Node/C# 等）+ API Key，一行配置即用，接入体验最好（PA 走 SDK/私有 WebSocket，不走普通 REST） |
| 音频格式 | SDK 实时链路：WAV/PCM 原生支持，MP3/OGG/FLAC 需装 GStreamer；**AAC/M4A 不在实时链路支持列表**（仅批量/快速转写 REST 支持 M4A/AAC，而发音评测没有批量模式）|
| 免费额度够用吗 | F0 的 5 小时/月 ≈ 3000 次短句评测，**量上够 MVP**；卡点在注册/付费而非额度 |

---

## 5. 字节跳动 · 火山引擎（豆包语音）

**结论：没有公开的语音评测/发音评测 API。**

火山引擎豆包语音产品线 = 豆包语音合成 TTS、豆包流式语音识别 ASR、端到端实时语音大模型、对话式 AI（<https://www.volcengine.com/product/tts>、<https://www.volcengine.com/docs/DoubaoVoice/Billinginstructions-21>）。截至 2026-10 检索不到公开发音评分/口语评测接口，只有 ASR 转写（无评分）。若要评测需 ASR + 自建评分，不适合本项目。

## 6. 百度智能云

**结论：没有公开的语音评测/发音评测产品。**

百度智能云语音产品线为识别/合成类（短语音识别、实时识别、端到端识别、TTS 等，<https://cloud.baidu.com/product/speech>），检索不到公开发音评测 API，也未找到历史下线公告。不可选。

## 7. 其他发现：阿里云 · 智能科教内容生成平台（SSECP）

- 产品页：<https://www.aliyun.com/product/ssecp>
- 公测公告（2026-03-25）：<https://www.aliyun.com/product/news/28228>
- 评测 FAQ：<https://help.aliyun.com/zh/document_detail/3002419.html>
- 英文句子跟读 API：<https://help.aliyun.com/zh/document_detail/2996314.html>；段落跟读：<https://help.aliyun.com/zh/document_detail/2996315.html>；儿童单词跟读：<https://help.aliyun.com/zh/document_detail/2996310.html>
- 提交/查询任务 API：<https://help.aliyun.com/zh/document_detail/3001031.html>

面向中国 3-18 岁、21 种跟读题型，句子跟读从准确度/完整度/流利度/韵律等 8 个维度评分，**有专门的儿童单词跟读模型（12 岁以下）**，接入为 REST 异步任务（提交+轮询）。目前**公测阶段，按量后付费，公测期基本免费，正式单价未公开**。作为"多一档选择"关注即可：等正式定价、稳定后再考虑；MVP 阶段不建议押注公测产品。

---

## 8. 对比总表

| 维度 | 讯飞 ISE 流式版 | 腾讯云 SOE 新版 | 有道智云 语音评测 | Azure Pronunciation Assessment | 火山引擎 | 百度智能云 | 阿里云 SSECP |
|---|---|---|---|---|---|---|---|
| 英文句子朗读 | ✅ read_sentence，total_score 0-100 | ✅ 句模式，overall 0-100 | ✅ sentence，overall 0-100 | ✅ scripted，PronScore 0-100 | ❌ 无此产品 | ❌ 无此产品 | ✅ 句子跟读（公测） |
| 英式发音支持 | ❌ 无口音选项 | ❌ 新版仅美式基准（旧基础版有英式，已退市） | ❌ 无口音选项 | ✅ **en-GB 明确支持** | — | — | 未说明 |
| 童声 | 宣称全年龄，英文无儿童参数 | 宣称全年龄覆盖（含儿童） | 无公开儿童模式 | 无儿童专用模式 | — | — | **有儿童单词跟读模型** |
| 免费额度 | **500 次/天（默认）** | 无（9.9 元=1 万次体验包） | 10 元体验金（≈2000 次） | **5 音频小时/月（F0）** | — | — | 公测期基本免费 |
| 付费单价 | 0.006 元/次（1200 元/20 万次/年） | 0.005 元/次；1 万次 9.9 元 | 0.005 元/次（50 元/万次） | ≈$1/hr + $0.30/hr prosody；6s 一句 ≈$0.002 | — | — | 未公布 |
| 个人开通 | ✅ 个人实名即可 | ✅ 个人实名即可 | ✅ 个人可开通 | 国际区需国际信用卡；中国区偏企业化 | — | — | ✅ 阿里云账号 |
| 服务端接入 | WebSocket + HMAC 签名 | 云 API + TC3 签名（SDK 封装） | WebSocket + SHA256 签名 | Speech SDK + API Key（最简） | — | — | REST 异步任务 |
| 音频格式 | wav/pcm/mp3/speex-wb, 16k 单声道 | pcm/wav/mp3/speex, 16k 单声道 | **仅 wav(pcm_s16le), 16k** | WAV/PCM（实时链路） | — | — | 16k wav/pcm（见 FAQ） |
| 接受 Safari 的 M4A/AAC | ❌ | ❌ | ❌ | ❌（实时链路） | — | — | ❌ |
| MVP 免费够用 | ✅ 完全够 | 折合 9.9 元起 | ✅ 体验金够 | ✅ 量够，注册麻烦 | — | — | 公测期够但不稳 |

---

## 9. Safari MediaRecorder 音频格式与转码结论

**事实：**

1. iPadOS/iOS Safari 的 `MediaRecorder` 稳定支持的音频封装是 **`audio/mp4`（AAC 编码）**（WebKit 官方：<https://webkit.org/blog/11353/mediarecorder-api/>）。
2. iOS/iPadOS **18.4**（2025-03）起 Safari 才支持录 WebM/Opus；Safari TP 另加了 `audio/mp4;codecs=pcm`，但不能指望孩子的旧 iPad 有这些（参考：<https://www.testmuai.com/learning-hub/mediarecorder-browser-support>）。
3. 四家候选评测引擎对音频的要求：
   - 讯飞 ISE：16k/16bit pcm、wav、mp3、speex-wb —— **无 AAC/M4A**
   - 腾讯 SOE 新版：pcm、wav、mp3、speex，16kHz 单声道 —— **无 AAC/M4A**
   - 有道智云：**仅 wav(pcm_s16le)** 16k
   - Azure 实时链路：WAV/PCM（MP3/OGG/FLAC 需 GStreamer）—— **无 AAC/M4A**（AAC/M4A 只有批量转写 REST 支持，而发音评测无批量模式）

**结论：必须转码。** 前端录 `audio/mp4`(AAC) 原样上传，服务端统一用 ffmpeg 转成 **16kHz / 16bit / 单声道 WAV(PCM)** 再调评测 API，一家都躲不开：

```bash
ffmpeg -i input.m4a -ac 1 -ar 16000 -sample_fmt s16 output.wav
```

- 输入按容器扩展名给 `.m4a` 或直接让 ffmpeg 探测，Safari 产出的 AAC-in-MP4 能直接解。
- 统一转码还有附带好处：各引擎对 16k/单声道的要求一次满足，分数口径也更一致（音量、时长可在此环节做归一化）。
- 一句 5-10 秒的 AAC 录音只有几十 KB，先传原文件、服务端转码，比在浏览器里硬解重采样（Safari 下 AudioContext 重采样坑多）更省事。

---

## 10. 选型建议

### 首选：科大讯飞 ISE（流式版）

- **免费 500 次/天，MVP 零成本**，量超了也就 0.006 元/次；
- 专做"课文跟读打分"这一件事，`read_sentence` 直接给 0-100 总分（还带准确度/流利度分项可做星级辅助），中高考同源技术，对"中国小学生读教材课文"这个分布最对口；
- 个人实名即可开通；WebSocket + 服务端签名与你"服务端转发录音"的架构一致。

注意点：
- 接入签名在服务端做（APIKey/APIPassword HMAC），别把密钥放前端；
- 英文评分无英式/美式开关——沪教版偏英式这点只能接受通用基准，对句子级总分级反馈影响不大；若后续发现孩子按英式读被判低分，可微调星级阈值（比如 88 分也算五星）。

### 备选：腾讯云智聆口语评测（新版 SOE-N）

- 无免费额度，但 **9.9 元 = 1 万次**，试错成本极低；纯服务端云 API + 官方 SDK，签名由 SDK 封装，接入比讯飞更"普通"（像调一个普通 REST 接口）；
- 缺点同样是美式基准（文档明确），且要留意基础版退市、只接新版。

### 什么时候考虑 Azure

如果孩子跟读效果对口音基准敏感、想要**真正的 en-GB 英式评分**，或者以后要做成可出国使用的产品：Azure 的 pronunciation assessment 是唯一原生支持 en-GB 的方案，F0 免费 5 小时/月也够用；代价是国际信用卡 + 大陆访问延迟 + SDK 依赖。可在 MVP 验证后再评估。

### 星级映射建议（通用）

0-100 总分 → 五星 ≥90；四星 80-89；三星 70-79；两星 60-69；一星 <60。上线后用真实童声数据校准阈值（各引擎分数分布不同，讯飞句子分通常偏宽松）。

---

## 变更记录

- 2026-10-16：首版调研。
