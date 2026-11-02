import { describe, it, expect, vi } from "vitest";
import { uploadWithProgress } from "./upload-with-progress";
function fakeXhr(script: {
  progress?: [number, number][];
  status?: number;
  responseText?: string;
  failNetwork?: boolean;
}) {
  const xhr = {
    open: vi.fn(),
    send: vi.fn(function (this: any) {
      queueMicrotask(() => {
        for (const [loaded, total] of script.progress ?? []) {
          this.upload.onprogress?.({ lengthComputable: true, loaded, total });
        }
        if (script.failNetwork) {
          this.onerror?.();
          return;
        }
        this.status = script.status ?? 201;
        this.responseText = script.responseText ?? "{}";
        this.onload?.();
      });
    }),
    abort: vi.fn(function (this: any) {
      this.onabort?.();
    }),
    upload: {},
    status: 0,
    responseText: "",
  };
  return xhr as unknown as XMLHttpRequest & {
    upload: { onprogress?: (e: any) => void };
    onprogress?: (e: any) => void;
    onload?: () => void;
    onabort?: () => void;
    onerror?: () => void;
  };
}

describe("uploadWithProgress", () => {
  it("上报进度并在 201 时解析 JSON body", async () => {
    const progress: [number, number][] = [];
    const xhr = fakeXhr({
      progress: [
        [300, 1000],
        [1000, 1000],
      ],
      status: 201,
      responseText: '{"draft":{"id":"d1"}}',
    });
    const { promise } = uploadWithProgress({
      url: "/api/uploads",
      body: new FormData(),
      onProgress: (l, t) => progress.push([l, t]),
      xhrFactory: () => xhr,
    });
    const res = await promise;
    expect(progress).toEqual([
      [300, 1000],
      [1000, 1000],
    ]);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ draft: { id: "d1" } });
  });

  it("非 201：状态码保留，body 原样交给调用方", async () => {
    const xhr = fakeXhr({ status: 413, responseText: '{"error":{"message":"TOO_LARGE"}}' });
    const { promise } = uploadWithProgress({
      url: "/api/uploads",
      body: new FormData(),
      xhrFactory: () => xhr,
    });
    const res = await promise;
    expect(res.status).toBe(413);
    expect((res.body as any).error.message).toBe("TOO_LARGE");
  });

  it("cancel() 触发 abort：resolve status 0（用户取消），不发 onload", async () => {
    const xhr = fakeXhr({});
    const { promise, cancel } = uploadWithProgress({
      url: "/api/uploads",
      body: new FormData(),
      xhrFactory: () => xhr,
    });
    cancel();
    const res = await promise;
    expect(res.status).toBe(0);
    expect((xhr as any).abort).toHaveBeenCalled();
  });

  it("网络失败：reject network-error", async () => {
    const xhr = fakeXhr({ failNetwork: true });
    const { promise } = uploadWithProgress({
      url: "/api/uploads",
      body: new FormData(),
      xhrFactory: () => xhr,
    });
    await expect(promise).rejects.toThrow("network-error");
  });

  it("响应非 JSON：body 为 null 不抛", async () => {
    const xhr = fakeXhr({ status: 201, responseText: "<html>" });
    const { promise } = uploadWithProgress({
      url: "/api/uploads",
      body: new FormData(),
      xhrFactory: () => xhr,
    });
    const res = await promise;
    expect(res.body).toBeNull();
  });
});
