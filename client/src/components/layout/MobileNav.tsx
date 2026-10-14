import { useState, useRef, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Download,
  FileSearch,
  Files,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "../../utils/classnames";
import { useAuth } from "../../hooks/useAuth";

const primaryItems = [
  { to: "/", label: "首页", icon: LayoutDashboard, end: true, adminOnly: true },
  { to: "/invoices/scan", label: "识别", icon: FileSearch },
  { to: "/sales", label: "销售", icon: ShoppingCart },
  { to: "/inventory", label: "库存", icon: Boxes },
  { to: "/analytics", label: "分析", icon: BarChart3, adminOnly: true },
];

// 「更多」菜单需覆盖全部已注册路由，否则移动端无法到达这些页面。
const overflowItems = [
  { to: "/invoices", label: "发票列表", icon: Files },
  { to: "/products", label: "产品管理", icon: Package },
  { to: "/suppliers", label: "供应商", icon: Building2 },
  { to: "/batches", label: "批次保质期", icon: CalendarClock },
  { to: "/notifications", label: "通知", icon: Bell },
  { to: "/stocktake", label: "库存盘点", icon: ClipboardCheck, adminOnly: true },
  { to: "/payables", label: "应付账款", icon: Wallet, adminOnly: true },
  { to: "/ai-assistant", label: "AI 助手", icon: Sparkles, adminOnly: true },
  { to: "/exports", label: "数据导出", icon: Download, adminOnly: true },
  { to: "/audit-logs", label: "审计日志", icon: ScrollText, adminOnly: true },
  { to: "/users", label: "用户管理", icon: Users, adminOnly: true },
  { to: "/settings", label: "设置", icon: Settings, adminOnly: true },
];

export function MobileNav() {
  const { isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const visiblePrimary = primaryItems.filter((i) => !i.adminOnly || isAdmin);
  const visibleOverflow = overflowItems.filter((i) => !i.adminOnly || isAdmin);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/30 bg-white/90 p-2 backdrop-blur-md lg:hidden">
      <ul className="flex gap-1">
        {visiblePrimary.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center rounded-lg py-1 text-[11px] font-medium transition",
                    isActive ? "bg-pine text-white" : "text-slate-700 hover:bg-slate-100"
                  )
                }
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}

        {/* overflow button */}
        <li className="flex-1 relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full flex-col items-center rounded-lg py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100"
          >
            {menuOpen ? <X size={16} /> : <MoreHorizontal size={16} />}
            <span>更多</span>
          </button>

          {menuOpen && (
            <div className="absolute bottom-full right-0 mb-2 min-w-36 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {visibleOverflow.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition",
                        isActive ? "bg-pine text-white" : "text-slate-700 hover:bg-slate-50"
                      )
                    }
                  >
                    <Icon size={16} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          )}
        </li>
      </ul>
    </nav>
  );
}
