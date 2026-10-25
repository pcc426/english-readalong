import { describe, expect, it } from "vitest";
import { lfasrSigna } from "./signa";

/**
 * 讯飞官方公式（https://www.xfyun.cn/doc/asr/ifasr_new/API.html）：
 * signa = base64( HmacSHA1(key=secretKey, data=MD5hex(appid + ts)) )。
 * 本向量为 node:crypto 手算的固定值——校验 md5 十六进制小写、
 * 拼接顺序（appid 在前 ts 在后）与 HMAC key 方向不被实现细节悄悄改坏。
 */
describe("lfasrSigna", () => {
  it("按官方公式对固定输入产出固定签名", () => {
    expect(lfasrSigna("app123", "sec456", "1700000000")).toBe(
      "6AEdkxcpIXevfzdpMSoq9uN8L3g="
    );
  });

  it("ts 变化则签名变化（时间戳进了被签内容）", () => {
    const a = lfasrSigna("app123", "sec456", "1700000000");
    const b = lfasrSigna("app123", "sec456", "1700000001");
    expect(a).not.toBe(b);
  });

  it("secret 变化则签名变化（secret 是 HMAC key 而非被签内容）", () => {
    const a = lfasrSigna("app123", "sec456", "1700000000");
    const b = lfasrSigna("app123", "other-secret", "1700000000");
    expect(a).not.toBe(b);
  });
});
