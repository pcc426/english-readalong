// 标准内容制作·草稿列表（V0.3.4 票 04 拆分后的默认页）。
// 上传表单在 /admin/standard/upload；本页只做 tab 列表 + 网格卡。
// catalog 只在上传页需要（RSC props），本页不再构建。
import StandardDraftList from "./StandardDraftList";

export const dynamic = "force-dynamic";

export default function AdminStandardPage() {
  return <StandardDraftList />;
}
