# 04: 教材内容制作拆成「制作中列表（默认）+ 独立上传页」并改卡片样式

**What to build:** 现在 `/admin/standard` 一页里既有上传表单又有草稿列表。拆成两个页面：默认进列表（样式对齐「自定义内容·制作中」卡片），右上角【＋ 上传教材视频】才进上传页。

原型参考：`git show prototype/v03.4:src/app/prototype/v034/standard/page.tsx`

**Blocked by:** 01（上传页要复用同一套「进度 + 取消 + 3 秒倒计时」交互）

**Status:** ready-for-agent

---

## 现状结构

```
src/app/(shell)/admin/standard/
  page.tsx                  ← server：构建 catalog（版本/学期/单元/模块清单）→ 渲染 client
  StandardAdminClient.tsx   ← client：管理员门禁 + 上传表单 + 草稿列表（490 行，混在一起）
```

`/admin` 页面里的 hero 卡按钮指向 `/admin/standard`（URL 不变，仍是列表页，无需改）。

## 目标结构

```
src/app/(shell)/admin/standard/
  page.tsx                  ← server：catalog → <StandardDraftList catalog={catalog} />   （默认页）
  upload/page.tsx           ← server：catalog → <StandardUploadForm catalog={catalog} />
  catalog.ts                ← server：把 page.tsx 里构建 catalog 的那段抽出来（两个页面共用）
  StandardDraftList.tsx     ← client：管理员门禁 + 列表（拆自 StandardAdminClient）
  StandardUploadForm.tsx    ← client：管理员门禁 + 上传表单（拆自 StandardAdminClient，按票 01 加进度/取消/倒计时）
  useAdminAccess.ts         ← client：抽出现有的 /api/auth/me 三态（loading/allowed/denied）
```

`StandardAdminClient.tsx` 拆分完成后删除。

## 列表页（`/admin/standard`，默认）

- 容器 `mx-auto max-w-6xl px-6 py-8`
- 头部：`h1 教材内容制作` + 副标题「校对时对照教材原文，定稿后全账号可见」+ 右侧【＋ 上传教材视频】（emerald 实心，跳 `/admin/standard/upload`）
- Tab：`制作中 (N)` = transcribing + proofreading；`已定稿 (N)` = published。默认「制作中」；样式与自定义列表一致
- 网格：`grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]`
- 空态：白卡「这里还没有内容」

### 卡片（保持现有全部按钮，只改外观）

```
[封面 9:16]  左上「标准」sky 胶囊 / 右上状态徽标（沿用 STATUS_BADGES：转写中 sky、待校对 amber、已定稿 emerald）
标题（draft.title，课文名）text-base font-bold
枚举串 text-xs slate-500        ← 需服务端提供，见下
[待校对] 已确认 N/M 句 + 琥珀进度条（bg-amber-400，宽度 = confirmed/sentenceCount）
[转写中] 视频转写中，完成后可校对…
── 以下为主操作，纵向排列，全部无框文字 + 箭头，text-lg font-extrabold ──
待校对:  去校对 →            (text-amber-600)
         去预览 →            (text-emerald-600)   ← 仅当 previewGate.canPreview
已定稿:  查看 →              (text-emerald-600)
         退回校对 →          (text-red-600)
转写中:  转写完成后可校对     (text-slate-400)
── 底部 ──
                                 删除   (小号灰字，右对齐)
```

**按钮行为必须与现在一致**（照抄现有实现，不要改语义）：

| 状态 | 行为 |
|---|---|
| 待校对 | `去校对 →` → `/drafts/{id}/proofread`；`去预览 →` → `/drafts/{id}/preview`，条件是 `previewGate(sentenceCount, confirmedCount).canPreview` |
| 未全部确认 | **不显示**「还有 N 句未确认…」的提示文字（用户明确要求删掉，进度条已表达） |
| 已定稿 | `查看 →` → `/units/{id}`；`退回校对 →` 调 `POST /api/drafts/{id}/unpublish`（保留「退回中…」禁用态与强确认弹窗） |
| 所有状态 | `删除` 调 `DELETE /api/drafts/{id}`，`window.confirm("确定删除「标题」吗？视频文件会一并删除。")`，保留「删除中…」禁用态；删除后刷新列表 |

样式细节（用户逐条定稿过）：
- 三个操作链接都是**无框文字**（不要胶囊底），带 `→`
- `去预览 →` 与 `退回校对 →` 必须排在 `去校对 → / 查看 →` 的**正下方**（纵向），不能并排
- `删除`：`text-xs font-semibold text-slate-400`，`hover:text-red-500 hover:bg-slate-50`，**无下划线**，右对齐

### 数据

- 列表仍走 `GET /api/drafts?type=standard`（已返回 `posterUrl`、`sentenceCount`、`confirmedCount`、`unitId`、`moduleKind`）
- **枚举串**：建议在 `/api/drafts` 响应里给标准草稿补 `subtitle` 字段，服务端用 `src/lib/textbook/enum-subtitle.ts` 的 `standardEnumSubtitleForModule(unitId, moduleKind, sentenceCount)` 生成（与首页同源）。不要在卡片里手拼字符串
- 封面：`draft.posterUrl`；无封面用 `bg-slate-200` 占位（不裂图）

## 上传页（`/admin/standard/upload`）

- **表单字段与样式完全沿用现在的 `StandardAdminClient`**：`← 返回制作列表`、`h1 上传教材视频`、副标题、白卡表单（版本固定只读行 / 学期下拉 / 教材单元 + 模块两列 / 标题预览绿框 / 视频文件 / 提交按钮）。不要重新设计
- 提交按钮按**票 01** 改：上传中显示百分比 + 进度条 + 【取消上传】；完成后 3 秒倒计时 +【立即前往「制作中」】
- 上传成功跳转目标：`/admin/standard`

## 注意

- 管理员门禁（`/api/auth/me` 的 loading/denied/allowed 三态、非管理员「无权限」卡）两个页面都要保留，抽成 hook 复用
- catalog 是 RSC props（教材句子不进浏览器包），两个页面都在服务端构建，别让 client 去 import 教材 JSON
- 不要改 `/admin` 页面本身，也不要改上传/转写/定稿的 API

## 验收

- [ ] 进入 `/admin/standard` 默认是「制作中」列表；`/admin/standard/upload` 是上传表单
- [ ] 【＋ 上传教材视频】从列表进上传页；上传页左上角「← 返回制作列表」可回
- [ ] 上传成功后按票 01 的 3 秒倒计时回到列表，新内容在「制作中」第一位
- [ ] 卡片：封面、标准徽标、状态徽标、课文名、枚举串、进度条齐全；无封面的卡不裂图
- [ ] 待校对卡片：`去校对 →`（琥珀）在上、`去预览 →`（翡翠绿）在其正下方，都无边框、都带箭头
- [ ] 未全部确认：没有 `去预览`，也**没有**「还有 N 句未确认」的提示文字
- [ ] 已定稿卡片：`查看 →` + `退回校对 →`（红色，同样无框带箭头）
- [ ] `删除` 是小号灰字、hover 变红、无下划线，确认后删除并刷新
- [ ] 非管理员访问两个页面都看到「无权限」卡；未登录跳登录页
- [ ] npm test / typecheck / build 全绿（若改 `/api/drafts` 响应需补测试）；1024×768 实测并记录到 `## Comments`

## Comments

- 2026-11-02 实施并验收（v0.3.4）：拆分：page.tsx（列表，server）+ upload/page.tsx（上传，server）+ catalog.ts + types.tsx（catalog 类型 + useAdminAccess + AccessGate）+ StandardDraftList.tsx + StandardUploadForm.tsx；StandardAdminClient.tsx 删除。/api/drafts 标准草稿补 subtitle（服务端 standardEnumSubtitleForModule，与首页同源）。列表：max-w-6xl、tab 制作中/已定稿、auto-fill 180px 网格卡（封面+标准/状态徽标+课文名+枚举串+进度条）；主操作纵向无框带箭头（去校对琥珀 / 去预览翡翠绿 / 查看翡翠绿 / 退回校对红色）；删除＝小号灰字 hover 变红；未确认提示文字按用户要求删除。上传页字段样式与拆分前一致，跳转 /admin/standard。实测：空态文案、上传→3 秒倒计时回列表新内容第一位、全确认卡（去校对+去预览 30px 纵向 18px）、已定稿卡（查看+退回校对+删除）、非管理员/未登录门禁待用户真机复验（无头浏览器以临时管理员账号完成主链路）。 全量 603 测试通过（v0.3.3 基线 594 + 9），typecheck / build（停 dev 后）绿。
