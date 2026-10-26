import { createHash, createHmac } from "node:crypto";

/**
 * 讯飞 LFASR 签名（官方文档 ifasr_new/API.html 的生成公式）：
 *   signa = base64( HmacSHA1(key = apiSecret, data = MD5hex(appid + ts)) )
 * 即：先对 baseString（appid 拼 ts，十进制秒）做 MD5（十六进制小写字符串），
 * 再以 **apiSecret** 为 HMAC key 对该 MD5 字符串做 HMAC-SHA1，最后 base64 编码。
 * 方向别弄反：HMAC key 是 apiSecret，不是 apiKey——用反了服务端报 26610 appId illegal。
 * 不引入 SDK，node:crypto 三件套足够。
 */
export function lfasrSigna(appId: string, apiSecret: string, ts: string): string {
  const baseString = appId + ts;
  const md5Hex = createHash("md5").update(baseString, "utf8").digest("hex");
  return createHmac("sha1", apiSecret).update(md5Hex, "utf8").digest("base64");
}
