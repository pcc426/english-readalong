# 07: 自定义上传独立页（分步向导）

**What to build:** 原型 `src/app/prototype/upload/page.tsx` 变体 C（用户已确认，放弃现列表页内联表单）。

1. 新路由 `src/app/(shell)/custom/upload/page.tsx`（壳内页面，侧栏「自定义内容」高亮）。三步向导（client 组件，状态在内存，不持久）：
   - 步骤 1【选择视频】：复用现有 VideoFileField 交互与 upload-precheck（mp4/m4v/mov、200MB、5 分钟），选中后显示文件名，可重选；未选不能下一步
   - 步骤 2【填写标题】：标题输入（沿用现有非空校验）；上一步可回
   - 步骤 3【确认】：展示「文件名 + 标题」摘要与「上传后自动转写，约 1–3 分钟」说明；主按钮【上传并开始转写】
   - 顶部步骤指示条（编号 + 标题 + 连线，当前/已过态 emerald）
   - 顶部【‹ 返回自定义内容】链接
2. 提交：multipart POST /api/uploads（title、file，不带 type）——与现有完全相同；成功 201 后 `router.push('/custom?tab=making')`（不留在上传页）。
3. 列表页改造：删除 `src/app/(shell)/custom/page.tsx` 中内联上传表单（:122-159 区域）与相关提交 state；标题行右侧加【＋ 上传视频】按钮 → /custom/upload（实现以票 06 的页面为准，两票注意别冲突：建议 06 先落列表结构，本票只删表单+加入口+新页面）。
4. 上传/转写错误（现有错误提示路径）在步骤 3 内联展示，失败可重试、不跳页。

**Blocked by:** None（页面可独立做；与票 06 同文件，合并或按 06→07 顺序开发）

**Status:** ready-for-agent

## 实现要点

- 原型 C 是视觉参考；正式实现用真实 VideoFileField 组件，不要重造文件选择
- /custom/upload 需要登录（壳已兜底）；上传权限与 API 行为不变
- 浏览器前进/后退不强制保持向导步骤（内存态即可）

## 验收

- [ ] 侧栏/列表按钮进入 /custom/upload；三步来回切换，步骤条状态正确
- [ ] 未选文件/标题为空时不能进入下一步或提交
- [ ] 真实上传一个视频成功后跳到 /custom?tab=making，新卡第一位「转写中」（与票 06 联验）
- [ ] 返回链接回列表；上传失败在步骤 3 看到错误且可重试
- [ ] 列表页不再有内联表单
- [ ] npm test / typecheck / build 全绿；浏览器走一遍完整上传
