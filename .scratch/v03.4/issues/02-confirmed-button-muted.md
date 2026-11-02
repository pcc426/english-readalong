# 02: 校对页「本句已确认」按钮置灰

**What to build:** 校对页底部确认按钮在句子已确认时，现在仍是翡翠绿实心（`bg-emerald-600` + 白字 + 阴影），看起来像还能点。改成置灰的不可点样式，避免和「确认本句」这个可点状态混淆。

**Blocked by:** None

**Status:** ready-for-agent

---

## 现状代码

`src/app/(shell)/drafts/[id]/proofread/page.tsx`（约 666-678 行）：

```tsx
<button
  type="button"
  onClick={confirmSentence}
  disabled={mutating || currentSaveState === "saving"}
  className={`mt-3 w-full rounded-2xl py-4 text-xl font-bold text-white shadow-md active:bg-emerald-600 disabled:opacity-40 ${
    current.proofread === "confirmed" ? "bg-emerald-600" : "bg-emerald-500"
  }`}
>
  {current.proofread === "confirmed" ? "本句已确认 ✓" : "✓ 确认本句"}
</button>
```

## 要改的

`current.proofread === "confirmed"` 时：

- `disabled`（真正的 disabled，不只是颜色）
- 样式：`bg-slate-200 text-slate-500 shadow-none`，去掉 `active:*`
- 文案保持 `本句已确认 ✓`
- 未确认时保持现在的翡翠绿实心 + 可点

可读性微调（可选）：已确认态的 `✓` 用 `text-emerald-600` 单独着色、文字灰，视觉上更像"完成状态"而不是"按钮"。

## 注意

- 句子被编辑后服务端会把 `proofread` 打回 `edited`，按钮应自动回到可点的「✓ 确认本句」——这是现有行为，别破坏
- 状态条（同页上方）已有「句子已修改，请重新确认」，两者语义不要重复冲突

## 验收

- [ ] 未确认句：按钮翡翠绿可点，点击后显示「本句已确认 ✓」
- [ ] 已确认句：按钮灰底灰字、无阴影、确实不可点（Tab 聚焦不到、点击无请求）
- [ ] 改文本触发 autosave 后：按钮自动回到可点的「✓ 确认本句」，状态条显示「句子已修改，请重新确认」
- [ ] 左侧/右侧其他元素不受影响；npm test / typecheck / build 全绿
- [ ] 1024×768 浏览器实测，记录颜色与尺寸到 `## Comments`
