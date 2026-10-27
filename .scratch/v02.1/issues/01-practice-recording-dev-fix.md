# 01: 修复练习录音在开发模式下无法提交的缺陷

**What to build:** 修复一个 dev-only 缺陷：本地 `npm run dev` 下练习页录音点「读好了」后，提交请求根本不发出（网络零记录），录音被静默丢弃并自动重录，永远不出分。生产构建（`npm run build && npm start`）、iPad、VPS 均正常——不要去改服务端，服务端经真实音频验证是好的。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## 根因（已定位，照此修，勿另行猜测）

`src/app/(shell)/units/[id]/PracticeFlow.tsx` 约 272 行的挂载 effect 只有清理函数：

```tsx
// 卸载：按"丢弃"处理并释放麦克风
useEffect(() => {
  return () => {
    mountedRef.current = false;
    stopIntentRef.current = "discard";
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };
}, []);
```

effect 体内**缺少 `mountedRef.current = true;`**。React 18 严格模式（Next 15 默认开启、仅开发模式生效）在挂载时会预演一次清理 → `mountedRef` 从页面打开起恒为 false → `recorder.onstop`（约 119 行）的 `!mountedRef.current` 恒真 → 每段录音都按"组件已卸载"走 discard 分支（blob 置空、不提交），随后自动开录 effect 无限重录。

## 改法（两处，都在同一文件）

1. 上述 effect 体内补 `mountedRef.current = true;`（标准 isMounted 写法：挂载设 true、清理设 false）。
2. 同文件约 205–213 行的录音计时 effect：`stopRecording("submit")` 目前写在 `setRecordSeconds` 的 **updater 内部**——updater 在 dev 严格模式下会被双调用，第二次对已停止的 recorder 调 `stop()` 抛 InvalidStateError。把判断移到 updater 外（该 effect 每秒因 `recordSeconds` 变化重跑，闭包里拿到的是新值）：在 setTimeout 回调里直接 `if (recordSeconds + 1 >= MAX_RECORD_SECONDS) stopRecording("submit");` 然后 `setRecordSeconds(recordSeconds + 1)`。

## 验收（无需真麦克风：console 注入假音频流）

浏览器 console 先执行：

```js
const ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination();
const osc = ctx.createOscillator(); osc.connect(dest); osc.start();
navigator.mediaDevices.getUserMedia = async () => dest.stream;
```

再进练习页走流程。

- [x] `npm run dev`：播放示范 → 自动录音 → 点「读好了」→ 出分且 `practice_attempts` 落库（查库或刷新页面看最好成绩）
- [x] 录满 15 秒的自动提交路径同样能出分（上一条的 15s 超时分支）
- [x] `npm run build && npm start` 生产模式行为不回归
- [x] npm test / npm run typecheck 全绿（基线 382）
