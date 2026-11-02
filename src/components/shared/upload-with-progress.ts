// 上传能力（V0.3.4 票 01）：fetch 拿不到上传进度，改用 XMLHttpRequest，
// 监听 upload.onprogress 上报已发送字节；cancel() 走 xhr.abort()。
// xhrFactory 注入假实现供单测（进度顺序 / abort / 201 / 非 201）。

export interface UploadResult {
  /** HTTP 状态码；用户取消（abort）为 0 */
  status: number;
  /** 2xx 时解析出的 JSON；解析失败为 null */
  body: unknown;
}

export interface UploadWithProgressOptions {
  url: string;
  body: FormData;
  /** 已发送字节变化时回调（loaded/total 为字节；total 未知时为 0） */
  onProgress?: (loaded: number, total: number) => void;
  /** 单测注入假 XHR；默认 new XMLHttpRequest() */
  xhrFactory?: () => XMLHttpRequest;
}

export interface UploadHandle {
  promise: Promise<UploadResult>;
  cancel: () => void;
}

export function uploadWithProgress(options: UploadWithProgressOptions): UploadHandle {
  const xhr = options.xhrFactory ? options.xhrFactory() : new XMLHttpRequest();

  const promise = new Promise<UploadResult>((resolve, reject) => {
    xhr.open("POST", options.url);
    xhr.responseType = "text";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(e.loaded, e.total);
    };

    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };

    // abort 与网络错误都按 status 0 收场，调用方据此区分「用户取消」与「失败」
    xhr.onabort = () => resolve({ status: 0, body: null });
    xhr.onerror = () => reject(new Error("network-error"));
  });

  xhr.send(options.body);
  return { promise, cancel: () => xhr.abort() };
}
