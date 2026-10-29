import { useNavigate } from "react-router-dom";
import { Compass, Home, ScanLine } from "lucide-react";
import { Button } from "../components/ui/Button";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-ink-subtle ring-1 ring-line">
          <Compass size={22} aria-hidden="true" />
        </span>
        <p className="mt-4 text-label font-semibold uppercase tracking-[0.14em] text-ink-subtle">404</p>
        <h1 className="mt-1 text-display font-semibold tracking-tight text-ink">页面不存在</h1>
        <p className="mt-2 text-sm text-ink-muted">
          你访问的地址可能已被移除，或链接不完整。可以返回首页，或直接去扫描发票。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button leadingIcon={Home} onClick={() => navigate("/")}>
            返回首页
          </Button>
          <Button variant="ghost" leadingIcon={ScanLine} onClick={() => navigate("/invoices/scan")}>
            发票识别
          </Button>
        </div>
      </div>
    </div>
  );
}
