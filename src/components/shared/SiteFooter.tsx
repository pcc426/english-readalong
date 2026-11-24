// 全站 ICP 备案页脚（V0.4.3 阶段二）：根布局挂载，登录页与登录后各页均展示。
// 未配置 READALONG_ICP_NUMBER 时不渲染；纯服务端组件，备案号不进客户端 bundle。
import { getIcpNumber, ICP_BEIAN_URL } from "./icp-config";

export default function SiteFooter() {
  const icpNumber = getIcpNumber();
  if (!icpNumber) return null;

  return (
    <footer className="fixed inset-x-0 bottom-0 z-10 flex justify-center pb-3 pt-2 text-xs text-slate-400">
      <a
        href={ICP_BEIAN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-slate-600"
      >
        {icpNumber}
      </a>
    </footer>
  );
}
