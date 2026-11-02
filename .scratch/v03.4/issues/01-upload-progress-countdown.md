# 01: 上传改为真实进度 + 取消 + 完成后 3 秒倒计时

**What to build:** 现在点【上传并开始转写】后按钮只是变灰显示「上传中…」，没有进度、不能取消，传完才跳转。改成：真实百分比进度条 + 可随时取消 + 上传完成后 3 秒自动跳转（也可点「立即前往」提前走）。

原型参考：`git show prototype/v03.4:src/app/prototype/v034/upload/page.tsx`

**Blocked by:** None

**Status:** ready-for-agent

---

## 现状代码

| 位置 | 说明 |
|---|---|
| `src/app/(shell)/custom/upload/page.tsx`：`handleUpload()`（约 32-61 行）、提交按钮（约 150-158 行） | 自定义三步向导第 3 步提交；用 `fetch` + `uploading` 布尔 |
| `src/app/(shell)/admin/standard/StandardAdminClient.tsx`：`handleUpload()`（约 133-171 行）、提交按钮（约 381-387 行） | 教材制作表单提交；结构相同 |

两处都要改，行为一致。

## 要做的事

### 1. 上传能力：换 XHR（fetch 拿不到上传进度）

新增 `src/components/shared/upload-with-progress.ts`：

```ts
export interface UploadResult { status: number; body: unknown }
export function uploadWithProgress(options: {
  url: string;
  body: FormData;
  onProgress?: (loaded: number, total: number) => void;
  xhrFactory?: () => XMLHttpRequest;   // 单测注入假 XHR
}): { promise: Promise<UploadResult>; cancel: () => void }
```

- 监听 `xhr.upload.onprogress` 上报已发送字节（这是"上传进度"，不是服务器处理进度）
- `cancel()` 调 `xhr.abort()`，promise 以 `{ status: 0 }` 或 reject 结束，由调用方区分「用户取消」与「网络失败」
- 响应 201 时解析 JSON（现在只用到 201；非 201 时把 `error.message` 交给 UI）
- 用 `xhrFactory` 注入假实现写单测（进度回调顺序、abort、201/400）

### 2. 交互状态机

```
idle ──点击──> uploading(pct) ──201──> done(3s 倒计时) ──到点/点按钮──> 跳转
                    │
                    └─取消/失败──> idle（保留已选文件与标题，可重试）
```

- **上传中**：主按钮 `disabled`，文案 `上传中… 45%`；按钮下方一条 progress bar；下面一个次按钮【取消上传】（可点，不能出现"只能干等"）
- **上传完成**：主按钮 `disabled`，文案 `上传完成 · 3 秒后自动前往`；次按钮【立即前往「制作中」】；3 秒到点自动跳
- **失败**：沿用现有错误文案（`role="alert"`），主按钮恢复成【上传并开始转写】可重试
- **取消**：回到 idle，可改文件/标题后重传；给一句轻提示（如「已取消上传」）

### 3. 倒计时抽纯函数

`src/components/shared/countdown.ts`（或放实现处同目录）：`createCountdown({ seconds, onTick, onDone, setTimer, clearTimer })`，单测用假定时器验证：依次 3→2→1、到 0 触发 onDone、`cancel()` 后不再触发。秒数取常量 `AUTO_NAVIGATE_MS = 3000`。

### 4. 跳转目标

- 自定义上传 → `/custom?tab=making`
- 教材上传 → `/admin/standard`（票 04 的列表页；票 04 未落地前先保持现状跳转）

## 不要做

- **不要动表单其余部分的样式**：步骤条、VideoFileField、标题输入、确认摘要 `dl`、错误提示位置——用户明确要求只改按钮相关区域
- 不要在上传完成前跳转（会中断 multipart 传输导致草稿丢失）
- 不加 Service Worker / 分片上传

## 验收

- [ ] 选一个大文件上传：百分比单调递增，进度条同步，按钮显示当前百分比
- [ ] 上传中点【取消上传】：请求中止（DevTools 里请求变 canceled），回到可重试状态，没有草稿残留
- [ ] 上传完成后：按钮显示「上传完成 · 3 秒后自动前往」，3 秒后自动进入列表页且新内容在「制作中」第一位
- [ ] 上传完成后点【立即前往】：立刻跳转，不等 3 秒
- [ ] 上传失败（如断网/超大文件）：错误提示出现，按钮可再次点击重试
- [ ] 与改动前截图对比：除按钮区域外无任何样式差异
- [ ] 新增单测（XHR 进度/abort/倒计时）通过；npm test 594 → N 全绿、typecheck、build 通过
- [ ] 1024×768 浏览器实测，并在 `## Comments` 记录实测数据

## Comments

- 2026-11-02 实施并验收（v0.3.4）：新增 upload-with-progress.ts（XHR + onprogress + abort→status 0，xhrFactory 注入，5 例单测）与 upload-countdown.ts（createCountdown 纯函数 + useCountdown hook，4 例单测，挂载即显满秒）。custom/upload/page.tsx 与 StandardUploadForm.tsx 均接入：上传中＝主按钮「上传中… N%」+ 进度条 + 【取消上传】；完成＝「上传完成 · N 秒后自动前往」+【立即前往】；取消/失败回 idle 保留文件与标题。表单其余区域零改动（对照截图确认）。 全量 603 测试通过（v0.3.3 基线 594 + 9），typecheck / build（停 dev 后）绿。
