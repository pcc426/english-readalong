# 01: 视频封面（Poster）生成管线与服务

**What to build:** 列表卡片需要竖版视频首帧图（spec §封面）。所有素材都是 720×1280 竖屏，封面即 9:16，不裁剪。

1. ContentPack schema 加可选 `poster?: string`（与 video 同形的相对引用，如 `12ff…/abc….jpg`；shipped 内容用文件名）。Draft 列表/详情视图同样带 poster。
2. 新增 `src/lib/drafts/poster.ts`：用 child_process 调 ffmpeg（部署前置依赖，参照现有 xunfei payload 的 ffmpeg 执行器缝，允许单测注入假执行器）：
   - 抽帧时点优先 1.0s；失败（视频短于 1s）回退 0.2s
   - 输出 JPEG 宽 360px（`-frames:v 1 -vf scale=360:-2 -q:v 4`），9:16 即 360×640
   - 产物落 `data/uploads/<accountId>/<…>.jpg`（与视频同账号目录，复用 storage.ts 目录常量；不与视频同名）
   - ffmpeg 缺失/失败不阻断上传与转写，poster 回退 null（与现有 probe.ts 同策略：测试与低配环境可无 ffmpeg）
3. 触发时机：**上传成功后立即抽帧**（POST /api/uploads 创建草稿后，异步即可，草稿列表接口对 poster 缺失容忍）；标准草稿同步同一套。
4. /api/media 鉴权扩展：poster jpg 与视频同规则（本人目录、或被公开标准包引用则所有登录账号可见）；shipped 封面（`content/media/posters/*.jpg`）与 shipped 视频同校验（被标准包 poster 字段引用才放行）。
5. 一次性补抽脚本 `scripts/backfill-posters.*`：对全部 shipped 视频（`content/media/*.mp4`）及 `data/uploads/**/*.mp4` 补抽，输出到各自既定位置；更新/输出「视频→封面」映射供票 03 的包回填使用。shipped 封面落 `content/media/posters/`。

**Blocked by:** None

**Status:** ready-for-agent

## 实现要点

- 不新增 npm 依赖；ffmpeg 错误要吞得出错对象但不炸上传主流程
- 卡片宽度原型实测约 168–184px，360px 宽覆盖 2x 屏；文件预期 < 80KB
- owned-content 的 video URL 改写逻辑（owned-content.ts:41-49）对 poster 同样做一遍
- 补抽脚本要幂等：已有封面且更新时间新于视频则跳过

## 验收

- [ ] 新上传一个视频，草稿转写期间列表/详情已能显示封面
- [ ] ffmpeg 不可用时上传仍成功，封面位置优雅降级（无封面占位，不报错）
- [ ] /api/media 对他人账号的封面返回 403/404，本人 200，被标准包引用的上传封面其他账号 200
- [ ] 补抽脚本对仓库 2 个 shipped 视频 + 3 个上传视频全部生成封面，再跑一次幂等跳过
- [ ] 浏览器中封面 9:16 不变形（object-cover 容器）
- [ ] npm test / typecheck / build 全绿（基线 410 只增不减）
