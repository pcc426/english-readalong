# 03: 录音时改为视频正中央的大麦克风蒙版

**What to build:** 现在录音时视频左上角有个小号红色 `REC 3s` 角标，孩子在平板上不容易注意到。改成：录音时在视频**正中央**盖一个半透明蒙版 + 大号麦克风 + 「该你读了」+ 秒数，提醒孩子现在轮到自己读。

原型参考：`git show prototype/v03.4:src/app/prototype/v034/recording/page.tsx`（变体 A3）

**Blocked by:** None

**Status:** ready-for-agent

---

## 现状代码

`src/app/(shell)/units/[id]/PracticeFlow.tsx`（约 485-495 行，视频容器内）：

```tsx
{state.step === "recording" && recorderActive && (
  <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-lg font-bold text-white">
    <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white" />
    REC {recordSeconds}s
  </div>
)}
```

## 目标形态（用户定稿：变体 A3 石墨灰）

只在 `state.step === "recording" && recorderActive` 时渲染，覆盖**视频容器**（不是整页）：

```
绝对定位铺满视频区：inset-0，bg-black/55
居中纵向排列：
  1. 两道慢速脉冲光环（低亮度）
     - 外环：bg-white/5，animate-ping，animationDuration 2.6s
     - 内环：bg-slate-200/15，animate-ping，animationDuration 2.2s
  2. 主圆形：h-28 w-28 rounded-full bg-slate-800/85 ring-1 ring-white/20
            内放 🎙️（text-6xl），整体带柔和阴影
  3. 文案：「该你读了」 text-3xl font-extrabold text-white
  4. 秒数：{recordSeconds} 秒  text-lg font-bold tabular-nums text-slate-300
```

要点：
- **颜色**：主色石墨灰（`slate-800/85`），脉冲环白色/浅灰 5%–15%。不要红色（站内主色是 emerald/sky/slate/amber，红色突兀）
- **不要遮挡交互**：蒙版加 `pointer-events-none`，避免挡住视频控件或其他点击
- **不要覆盖右栏**：只在左列视频容器内绝对定位
- 删掉原来的左上角 REC 角标
- 无障碍：文案容器加 `role="status"` + `aria-live="polite"`，让读秒变化可被读出（可选但推荐）

## 注意

- `recordSeconds` 的计时逻辑在组件里已有，不要改它的行为（15 秒自动提交等逻辑与本票无关）
- 预览模式（`mode="preview"`）不会进 recording 步，本蒙版不会出现，天然安全
- 停止录音后蒙版必须立即消失，不能残留在出分视图上

## 验收

- [ ] 点【开始练习】进入录音：视频正中央出现麦克风蒙版 + 「该你读了」+ 秒数，左上角旧 REC 角标消失
- [ ] 秒数随录音递增；两道光环缓慢呼吸（不是快速闪烁）
- [ ] 点【读好了】或 15 秒自动提交：蒙版立即消失，出分视图正常
- [ ] 蒙版不遮挡右栏，也不影响视频控件/其他点击（pointer-events 生效）
- [ ] 1024×768 与手机宽度下都居中、不溢出
- [ ] npm test / typecheck / build 全绿；实测数据写进 `## Comments`

## Comments

- 2026-11-02 实施并验收（v0.3.4）：删除左上角红色 REC 角标，改为视频容器内绝对定位蒙版：bg-black/55 + pointer-events-none + role=status/aria-live=polite；中央两道慢速脉冲（bg-white/5@2.6s、bg-slate-200/15@2.2s）+ 石墨灰圆盘（slate-800/85、ring-white/20、🎙️ text-6xl）+「该你读了」(30px) + 「N 秒」。实测（伪造静音音轨绕过无头浏览器麦克风限制）：蒙版 400×699 盖满视频列、不盖右栏；录音结束立即消失；recordSeconds 计时逻辑未动。 全量 603 测试通过（v0.3.3 基线 594 + 9），typecheck / build（停 dev 后）绿。
