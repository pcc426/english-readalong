# V0.3.4 交接文档（给实现代理）

日期：2026-11-02 · 状态：UI 原型已由用户定稿，等待实现
基线：`main` @ `3cbf766`（594 测试全绿，typecheck / build 通过）

---

## 1. 这个项目是什么

`english-readalong` 是家庭英语跟读应用（Next.js 15 App Router + TypeScript + Tailwind + SQLite/better-sqlite3）。家长上传视频 → 服务端调讯飞 LFASR 转写 → 逐句校对 → 预览 → 定稿 → 孩子跟读并获评分星级。内容分「标准内容」（教材，管理员制作，全账号可见）与「自定义内容」（家长上传，仅本人可见）。

**动手前必读**：
- `AGENTS.md` — 仓库导航
- `GLOSSARY.md` — 领域词汇（术语以它为准：定稿/预览/模块/一次练习…）
- `docs/adr/0005-preview-gate-ui-only.md` — 预览门禁只做 UI 收敛
- `.scratch/v03/spec.md` — V0.3 的 30 条既定决策

**硬约束**：
- 测试基线 594 只增不减；`npm test`、`npm run typecheck`、`npm run build` 必须全绿
- UI 没有组件渲染测试设施（vitest 无 jsdom）：把可测逻辑抽成同目录纯函数并写单测，其余走浏览器人工验收
- 不要顺手改与票无关的样式/文案；每张票只动票面列出的区域

## 2. 原型在哪

UI 原型放在 **throwaway 分支 `prototype/v03.4`**，**不要合并进 main**，参考方式：

```bash
git show prototype/v03.4:src/app/prototype/v034/upload/page.tsx      # 变更 1
git show prototype/v03.4:src/app/prototype/v034/recording/page.tsx   # 变更 3
git show prototype/v03.4:src/app/prototype/v034/standard/page.tsx    # 变更 4
```

原型是**视觉与交互参考**，正式实现要按票重写（不复制原型代码、不把 prototype 目录带进 main）。

## 3. 四张票

| # | 变更 | 票 |
|---|---|---|
| 1 | 上传：真实进度条 + 取消上传 + 完成后 3 秒倒计时自动跳转 | `issues/01-upload-progress-countdown.md` |
| 2 | 校对页「本句已确认」按钮置灰，不再显示可点击高亮 | `issues/02-confirmed-button-muted.md` |
| 3 | 录音中改为视频正中央的大麦克风蒙版（石墨灰 A3 配色） | `issues/03-recording-overlay.md` |
| 4 | 教材制作拆成「制作中列表（默认）+ 独立上传页」，卡片样式对齐自定义列表 | `issues/04-standard-split-and-cards.md` |

票之间的依赖：**04 依赖 01**（拆出来的上传页要复用同一套「进度 + 取消 + 倒计时」交互）。01、02、03 互不相干，可并行。

## 4. 用户在设计评审中明确过的点

- 变更 1：**只改上传按钮相关区域**（进度条、取消、倒计时），表单其余部分（步骤条、文件选择、标题输入、确认摘要）**样式一律不动**
- 变更 1：倒计时**在上传完成之后**才开始（不要在未传完时跳转——跳转会中断 multipart 传输、草稿丢失）
- 变更 1：上传过程中**必须始终有可点的按钮**（取消上传），不能出现"只能干等"的界面
- 变更 2：已确认的句子按钮要**置灰**，不能是 emerald 高亮（用户分不清"确认本句"和"本句已确认"）
- 变更 3：胶囊/圆形的**主色用石墨灰（slate-800/85）**，脉冲环用白色/浅灰的低透明度（5%–15%），速度放慢到 2.2–2.6 秒一圈；不用红色（与站内 emerald/sky/slate/amber 配色不搭）
- 变更 4：教材卡片**原有按钮一个不能少**：`去校对 →`、`去预览 →`（全部确认后）、`查看 →`、`退回校对 →`、`删除`
- 变更 4：`去预览 →` 与 `退回校对 →` 都是**无框文字 + 箭头**，位置在 `去校对 → / 查看 →` 的**正下方**（不是并排）；颜色分别是翡翠绿、红色
- 变更 4：`删除` 是**小号灰字**（`text-xs text-slate-400`，hover 变红、无下划线），与自定义列表一致
- 变更 4：未全部确认时**不显示**"还有 N 句未确认…"的提示文字（进度条已经表达进度）

## 5. 验收方式

每张票完成后在浏览器实测（用户主要在 iPad 横屏 1024×768 使用，务必在这个尺寸下看一遍），并把实测数据（尺寸/字号/文案）写进票的 `## Comments`。最后统一跑：

```bash
npm test && npx tsc --noEmit && npm run build
```

> 注意：**不要在 dev server 运行时跑 `npm run build`**——两者共用 `.next`，会把 dev 产物覆盖掉（之前踩过）。
