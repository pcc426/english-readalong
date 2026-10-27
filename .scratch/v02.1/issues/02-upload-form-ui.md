# 02: 上传表单 UI（中文选择按钮 / 文件名高亮 / 选好即亮起）

**What to build:** 改造两处上传表单（`/custom` 家长上传 与 `/admin/standard` 管理员标准内容上传）的文件选择交互：

1. 原生 `<input type="file">` 隐藏，换成自定义中文按钮 **「选择视频」**（点击触发隐藏 input；`accept` 限制与既有客户端预检逻辑保持，见 `src/components/shared/upload-precheck.ts` 的 MAX_MB / OK_EXTENSIONS / precheckVideoFile）
2. 选中视频后，**文件名以高亮样式醒目显示**（如绿色徽标/chip），让用户明确知道已选中；未选中时显示「还未选择视频」类占位提示
3. 「上传并开始转写」按钮：**只要选中了视频就亮起**（disabled 解除），不等标题——标题为空时点提交仍走现有「请输入标题」错误提示；上传过程中保持置灰显示「上传中…」

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 实现要点

- 两处表单分别在 `src/app/(shell)/custom/page.tsx` 与 `src/app/(shell)/admin/standard/StandardAdminClient.tsx`，重复度高；建议提取共享组件（如 `src/components/shared/UploadForm.tsx`），两处复用
- 管理员表单额外有「教材单元 / 栏目」两个下拉，提取时用 props/slot 保留差异，不要丢
- 文案与既有校验行为（错误提示逐字）保持不变；只改控件样式与亮起条件
- 不改任何 API；不加依赖
- 标准内容页（admin/standard）的草稿列表部分**不要动**——04 号票会用它

## 验收

- [ ] 两处表单均为中文「选择视频」按钮；选择后文件名高亮显示
- [ ] 未选视频时「上传并开始转写」置灰，选中即亮起；不填标题提交仍提示输入标题
- [ ] `/custom` 与 `/admin/standard` 表现一致
- [ ] iPad 竖屏（768px 宽）不破版
- [ ] npm test / npm run typecheck 全绿（基线 382）
