# 06: 讯飞 LFASR 转写适配器

**What to build:** 用真实讯飞录音文件转写替换假实现：提交文件、轮询任务、解析句子级 `bg`/`ed`（毫秒）与 `onebest`（文本）；转写失败时草稿保持可重试且不丢；进程重启后未完成任务可恢复轮询。配套固定小视频的集成冒烟测试；写 ADR-0004。

**Blocked by:** 05（上传与草稿）

**Status:** ready-for-agent

- [x] 确认 LFASR 是否接受视频格式；不接受则适配器先用 ffmpeg 抽音轨再提交
- [x] 真实上传视频后得到句子级文本与起止时间
- [x] 转写失败时草稿保持可重试状态并给出明确错误
- [x] pm2 重启进程后，处于「转写中」的草稿能恢复轮询，不会永久卡住
- [x] 集成冒烟测试通过（固定小视频 + 真实讯飞服务）
- [x] ADR-0004 落库，记录选型与 OCR、自托管 whisper 的否决理由

## Comments

- 代码侧已合入 `v02-integration`。剩余三项待真实 LFASR 凭据验证：mp4 是否直收、真实句子级转写、`npx tsx --env-file=.env scripts/smoke-lfasr.ts`。无凭据环境用假实现，上传→转写失败→重试→proofreading 已冒烟。

## Comments

- 2026-10-26 真实凭据冒烟通过：标准版（LFASR_MODE=standard）直接接受 mp4，无需抽轨；30 秒教材视频得到 2 句带毫秒起止的文本，`u2-s04.m4a` 亦通过。
- 实测修正三处实现假设：参数名必须驼峰 `appId`；`signa` 的 HMAC key 是 APISecret；标准版 `orderResult` 是明文 JSON（不是 base64，已兼容两形态）。大模型版适配器亦已实现（LFASR_MODE=llm，默认），供另一套凭据使用。
- 站内链路实测又修一处并发缺陷：后台轮询器持有上传请求作用域的数据库连接，请求结束连接关闭后轮询报 "database connection is not open" 永久卡住；改为连接已关闭时自动新开（每次轮询后释放），并加回归测试。
