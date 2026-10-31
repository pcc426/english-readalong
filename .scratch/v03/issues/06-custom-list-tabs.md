# 06: 自定义内容列表改版：tabs + 紧凑封面网格

**What to build:** 原型 `src/app/prototype/custom/page.tsx` 变体 A（用户已确认）。改 `src/app/(shell)/custom/page.tsx`——上传表单从本页移除（票 07），本页只做列表。

1. 容器与网格同票 05：max-w-7xl、`repeat(auto-fill,minmax(168px,1fr))`、gap-4。
2. 顶部行：页面标题「自定义内容」＋右上【＋ 上传视频】→ `/custom/upload`。
3.  tabs：「可练习 (N)」＝status=published；「制作中 (N)」＝proofreading+transcribing。默认 tab 由 `?tab=making` 决定（票 07 上传成功跳来带此参），否则默认「可练习」。
4. 卡片结构（紧凑封面卡，正式代码重写，勿复制原型）：
   - 封面 9:16（draft 列表 API 需返回 posterUrl，依赖票 01；draft 在 transcribing 时封面可能已好——上传后立即抽帧，转写期间显示 real poster，转写中卡图加 opacity-60）
   - 左上 violet「自定义」胶囊、右上状态徽标（现有 STATUS_BADGES 配色保留：转写中 sky / 待校对 amber / 已定稿 emerald）
   - p-3 文本区：标题 text-base bold；published 显示 N 句；proofreading 显示「已确认 N/M 句」+ 琥珀进度条（confirmedCount/sentenceCount API 已返回，见 drafts route）；transcribing 「视频转写中，完成后可校对…」
   - 底行加大：published 且有星数 `🌟N` **24px font-extrabold** +「上次练习获得」注释，没练过留空；CTA 18px font-extrabold：published【去练习 →】emerald（→ /units/{id}，注意自定义练习也走 /units）；proofreading【去校对 →】amber（→ /drafts/{id}/proofread）；transcribing 底部「转写完成后可校对」slate-400 不可点
   - 删除按钮保留（confirm + DELETE /api/drafts/{id}）；transcribing/proofreading/published 都能删
5. 空态：tab 内空显示「这里还没有内容」白卡。

**Blocked by:** 01, 04

**Status:** ready-for-agent

## 实现要点

- 现状两个 <section> 堆叠（page.tsx:169/222）改为单 tab 容器；fetch /api/drafts?type=custom 的轮询/刷新行为沿用现状
- 自定义 published 内容的 latestStars：overview 走 ownedContent（custom 包按账号可见），latestRunStars 同票 04 对 custom 内容同源生效；需要把 draft 与 content 的星数在本页合并（published 卡片数据可能要从 /api/units 类 overview 拿星，或扩展 drafts API 关联 attempts——实现时选小改动方案并在 Comments 记录）
- 原型里 published 卡同时有封面、🌟、去练习；制作中卡来自 /api/drafts，两类数据同源策略在实现时统一（drafts API 已含 published 行，优先扩展它）

## 验收

- [ ] 默认进 /custom 看到「可练习」tab；`?tab=making` 直接打开制作中
- [ ] 制作中按 created 倒序，新上传卡在第一位，转写中卡不可点、不裂图
- [ ] 待校对卡进度条与确认数正确；定稿后卡移到可练习 tab
- [ ] 🌟 24px、CTA 18px 加粗，视觉上明显大于正文（原型已确认字号）
- [ ] iPad 横屏 4 列左右自适应，删除确认与删除后列表刷新正常
- [ ] npm test / typecheck / build 全绿；浏览器实测 tab 切换/删除/空态

## Comments

- 2026-10-30 实施：commit 122b868（合入 7ddeb57）；浏览器实测（v03，1024×768）：tab 为「可练习 (N)/制作中 (N)」，?tab=making 直达制作中；新上传内容出现在制作中首位，带 9:16 封面与「已确认 N/M 句」进度；列表无内联上传表单，右上【＋ 上传视频】指向 /custom/upload。
- 2026-10-30 code-review 修复：commit 234c27c（迁移/补抽实跑、预览副标题接线、预览门槛三处统一、saving 即时、文案与术语、注册表查找与媒体 URL 收敛、GLOSSARY 补 run 词条）。
