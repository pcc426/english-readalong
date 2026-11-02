// 标准内容制作·上传页（V0.3.4 票 04 拆分）：表单样式沿用拆分前，提交按票 01。
import { buildCatalog } from "../catalog";
import StandardUploadForm from "../StandardUploadForm";

export const dynamic = "force-dynamic";

export default function AdminStandardUploadPage() {
  const catalog = buildCatalog();
  return <StandardUploadForm catalog={catalog} />;
}
