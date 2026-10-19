# 03: 评测服务接口 + 讯飞适配器 + 集成冒烟

**What to build:** 实现 ScoringService 窄接口（教材原文文本 + WAV 音频 → 0-100 句子总分）及两个实现：可编程假实现（测试注入用）；讯飞 ISE read_sentence 真实现——服务端 ffmpeg 将 Safari 录音（AAC）转 16kHz/16bit 单声道 WAV（ADR-0001）、WebSocket + HMAC 签名、密钥走环境变量、评分调用基本日志（成功/失败/耗时）。配套集成冒烟套件：固定 WAV 样本 + 教材原文文本真实调用讯飞，断言返回合法分数且在预期区间；该套件平时不进日常测试循环，作为本票验收执行（联调点 A）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

注意：联调点 A 需要家长先在讯飞开放平台完成个人实名认证、创建应用、把 APPID/APIKey/APISecret 配到环境变量——这是只有人能做的一步，做到该验收项时向家长要。

- [x] 假实现可编程返回指定分数，供领域测试注入
- [x] 签名/参数生成等纯函数离线单测绿
- [x] AAC→WAV 转码在冒烟中验证可用
- [x] 冒烟套件对固定样本真实调用讯飞返回合理分数（联调点 A）
- [x] 评分调用日志记录成功/失败/耗时
