// 上传页 → 列表页的交接提示（V0.4.2）。
// 上传进度到 100% 就倒计时返回列表，此时服务端可能还没建好草稿；
// 列表页读到这条提示后会在短窗口内继续轮询，把随后出现的卡片接上。
export const UPLOAD_HINT_KEY = "ra:upload-at";

/** 提示的有效期：超过这个时间说明是上一次遗留的，忽略 */
export const UPLOAD_HINT_TTL_MS = 30_000;

/** 列表页读到提示后继续轮询的时长 */
export const UPLOAD_WATCH_MS = 20_000;

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** 上传页进入完成态时调用（只记时间戳，不阻塞跳转） */
export function markUploadStarted(
  now: number = Date.now(),
  store: Storage | null = storage()
): void {
  try {
    store?.setItem(UPLOAD_HINT_KEY, String(now));
  } catch {
    // 隐私模式等写不进去：退化成只靠「转写中」轮询
  }
}

/** 列表页挂载时读一次提示（不删除：StrictMode 下 effect 会跑两遍）；返回是否该继续短时轮询 */
export function readUploadHint(
  now: number = Date.now(),
  store: Storage | null = storage()
): boolean {
  try {
    const at = Number(store?.getItem(UPLOAD_HINT_KEY) ?? 0);
    return Number.isFinite(at) && at > 0 && now - at < UPLOAD_HINT_TTL_MS;
  } catch {
    return false;
  }
}
