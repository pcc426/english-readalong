// 标准内容制作（票 12 + 票 02）：管理员用同一条 上传→转写→校对→定稿 管线制作沪教版教材内容。
// 教材目录在服务端取自教材注册表（registry.ts）加载的构建期产物（运行时不解析 PDF，
// 票面验收项），以 RSC props 把版本/学期/单元/模块清单传给客户端表单，
// 不把整份教材句子数据打进浏览器包（模块只带句数，句子在服务端校对时按 module 接口取）。
// 页面在登录壳内（(shell) 布局），管理员判定由客户端组件经 /api/auth/me 做二次门禁。
import { registeredBooks, series } from "@/lib/textbook/textbook";
import StandardAdminClient, {
  type TextbookCatalog,
} from "./StandardAdminClient";

export const dynamic = "force-dynamic";

export default function AdminStandardPage() {
  const catalog: TextbookCatalog = {
    series: { shortName: series.shortName, display: series.display },
    books: registeredBooks.map(({ book, data }) => ({
      id: book.id,
      shortName: book.shortName,
      display: book.display,
      units: data.units.map((u) => ({
        unitId: u.unitId,
        index: u.index,
        title: u.title,
        modules: u.modules.map((m) => ({
          moduleKind: m.moduleKind,
          title: m.title,
          sentenceCount: m.sentences.length,
        })),
      })),
    })),
  };
  return <StandardAdminClient catalog={catalog} />;
}
