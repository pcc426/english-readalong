// 标准内容制作（票 12）：管理员用同一条 上传→转写→校对→定稿 管线制作沪教版教材内容。
// 教材目录在服务端取自构建期一次性提取的教材数据（运行时不解析 PDF，票面验收项），
// 以 RSC props 把单元/模块清单传给客户端表单，不把整份教材句子数据打进浏览器包。
// 页面在登录壳内（(shell) 布局），管理员判定由客户端组件经 /api/auth/me 做二次门禁。
import { textbook } from "@/lib/textbook/textbook";
import StandardAdminClient, {
  type TextbookCatalog,
} from "./StandardAdminClient";

export const dynamic = "force-dynamic";

export default function AdminStandardPage() {
  const catalog: TextbookCatalog = textbook.units.map((u) => ({
    unitId: u.unitId,
    title: u.title,
    modules: u.modules.map((m) => ({
      moduleKind: m.moduleKind,
      title: m.title,
    })),
  }));
  return <StandardAdminClient catalog={catalog} />;
}
