# ADR-0004: 转写引擎选用讯飞录音文件转写（LFASR）

**Status**: accepted

自定义内容管线需要把家长上传的英语视频变成「句子文本 + 起止毫秒」的草稿句子，才能进入文本校对与切点校对（spec 转写缝小节）。调研对比见 spec Further Notes（LFASR 实证结论），决定采用**讯飞开放平台「录音文件转写」LFASR（标准版 WebAPI，raasr.xfyun.cn/v2/api）**，经 `TranscriptionService` 唯一新缝接入（06 号票落地适配器）。

**选择理由**：已在讯飞开放平台体系内（发音评测 ISE 同一账号，ADR-0001）；按音频时长计费、新用户礼包最多 50 小时/年免费，覆盖用量；句子级 `bg`/`ed`（毫秒）+ `onebest`（文本）**默认返回**，无需开词级 `has_participle`（时间戳不额外计费），与跟读切点所需粒度正好匹配；异步任务制（提交拿 orderId → 轮询结果）天然贴合「上传后慢慢转」的节奏；全托管免运维。

**否决的备选**：
- **OCR 烧录字幕**（抽帧 + PaddleOCR 类工具）：素材视频字幕是画面烧录的，抽帧识别在 VPS CPU 上慢，且准确率随字幕字体/描边/位置波动；OCR 只能给行级粗时间戳，切点校对要的毫秒级起止仍需另想办法。转写音频比识别画面更本质——孩子要跟读的是语音不是字幕排版。
- **VPS 自托管 whisper**：需升配内存、引入 Python 运行时与任务队列，运维面扩大；本项目部署前置依赖只有 ffmpeg，不想为一个功能加一整条运行时栈。whisper 的输出也需再做句子切分与时间戳对齐。

**实现约束**：
- 签名与请求手写（`signa = base64(HmacSHA1(key=apiKey, data=MD5hex(appid+ts)))`，node:crypto），不引讯飞 SDK；HTTP 用全局 fetch。
- 凭据走环境变量 `LFASR_APP_ID` / `LFASR_API_KEY` / `LFASR_API_SECRET`（与评测的 `XFYUN_*` 是同一平台的两套服务凭据，不混用）；三项齐全才启用真实转写，否则回落假实现（开发环境链路可走通）。
- 异步节奏：上传 → 建草稿（transcribing）→ 提交拿 orderId 落库 → 服务端退避轮询（5s 起指数退避，60s 封顶，有轮询上限防无限转）→ 完成落 `draft_sentences` 置 proofreading。轮询只发生在真实 provider 下；**进程重启后由 `src/instrumentation.ts` 把 transcribing 且有任务引用的草稿重新拉回轮询**（仅 nodejs runtime、非 build 阶段、有凭据时）。
- 失败语义：引擎侧确定失败（failType/`type=1`）→ 错误落 `transcribe_error`，草稿保持 transcribing 可重试；完成但零句子同样按失败处理（空校对页没有意义）；转写中网络抖动只记错误继续退避，任务不丢。
- 视频格式：LFASR 标准版格式表列有 mp4，但 FAQ 的格式清单未列，**对 mp4 视频的直收与否待真机冒烟确认**（`scripts/smoke-lfasr.ts`）。确认前如被拒收，可开 `LFASR_EXTRACT_AUDIO=1` 让适配器先 ffmpeg 抽 16kHz 单声道音轨再提交（ffmpeg 缺失或抽轨失败会给出明确错误，不静默降级）。
- 结果解析对两份官方文档的形态都兼容（Java SDK 归一化的 `bg`/`ed`/`onebest` 与 WebAPI 原始 lattice/data 包络），真实生产形态以冒烟实跑为准。
