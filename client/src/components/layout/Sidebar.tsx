import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  ClipboardCheck,
  Database,
  FileSearch,
  Files,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "../../utils/classnames";
import { APP_NAME } from "../../utils/constants";
import { useAuth } from "../../hooks/useAuth";

const navItems = [
  { to: "/", label: "仪表盘", icon: LayoutDashboard, end: true, adminOnly: true },
  { to: "/invoices/scan", label: "发票识别", icon: FileSearch },
  { to: "/invoices", label: "发票列表", icon: Files, end: true },
  { to: "/sales", label: "销售出库", icon: ShoppingCart },
  { to: "/inventory", label: "库存管理", icon: Boxes },
  { to: "/batches", label: "批次保质期", icon: CalendarClock },
  { to: "/stocktake", label: "库存盘点", icon: ClipboardCheck, adminOnly: true },
  { to: "/products", label: "产品管理", icon: Shield },
  { to: "/suppliers", label: "供应商", icon: Building2 },
  { to: "/payables", label: "应付账款", icon: Wallet, adminOnly: true },
  { to: "/analytics", label: "数据分析", icon: BarChart3, adminOnly: true },
  { to: "/ai-assistant", label: "AI 助手", icon: MessageSquare, adminOnly: true },
  { to: "/exports", label: "数据导出", icon: Database, adminOnly: true },
  { to: "/audit-logs", label: "审计日志", icon: ScrollText, adminOnly: true },
  { to: "/settings", label: "系统设置", icon: Settings, adminOnly: true },
  { to: "/users", label: "用户管理", icon: Users, adminOnly: true },
];

export function Sidebar() {
  const { isAdmin } = useAuth();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-rose-100 bg-white/90 p-4 backdrop-blur-md lg:block">
      <div className="mb-5 rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 text-rose-950 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src="/logo-300x292.png"
            alt="PandaMart Logo"
            className="h-12 w-12 rounded-lg bg-white object-contain p-1 ring-1 ring-rose-200"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-rose-500">PandaMart</p>
            <h1 className="text-lg font-bold">{APP_NAME}</h1>
          </div>
        </div>
      </div>

      <nav className="space-y-2">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive ? "bg-pine text-white" : "text-slate-700 hover:bg-slate-100"
                  )
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
      </nav>
    </aside>
  );
}
