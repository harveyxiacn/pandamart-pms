import { useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  ChevronDown,
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
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/classnames";
import { APP_NAME } from "../../utils/constants";
import { useAuth } from "../../hooks/useAuth";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "总览",
    items: [
      { to: "/", label: "仪表盘", icon: LayoutDashboard, end: true, adminOnly: true },
    ],
  },
  {
    label: "进货管理",
    items: [
      { to: "/invoices/scan", label: "发票识别", icon: FileSearch },
      { to: "/invoices", label: "发票列表", icon: Files, end: true },
    ],
  },
  {
    label: "销售与库存",
    items: [
      { to: "/sales", label: "销售出库", icon: ShoppingCart },
      { to: "/inventory", label: "库存管理", icon: Boxes },
      { to: "/batches", label: "批次保质期", icon: CalendarClock },
      { to: "/stocktake", label: "库存盘点", icon: ClipboardCheck, adminOnly: true },
    ],
  },
  {
    label: "商品与供应商",
    items: [
      { to: "/products", label: "产品管理", icon: Shield },
      { to: "/suppliers", label: "供应商", icon: Building2 },
      { to: "/payables", label: "应付账款", icon: Wallet, adminOnly: true },
    ],
  },
  {
    label: "经营分析",
    items: [
      { to: "/analytics", label: "数据分析", icon: BarChart3, adminOnly: true },
      { to: "/ai-assistant", label: "AI 助手", icon: MessageSquare, adminOnly: true },
      { to: "/exports", label: "数据导出", icon: Database, adminOnly: true },
    ],
  },
  {
    label: "系统管理",
    items: [
      { to: "/audit-logs", label: "审计日志", icon: ScrollText, adminOnly: true },
      { to: "/settings", label: "系统设置", icon: Settings, adminOnly: true },
      { to: "/users", label: "用户管理", icon: Users, adminOnly: true },
    ],
  },
];

export function Sidebar() {
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

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

      <nav className="space-y-1">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          const isCollapsed = collapsed[group.label] ?? false;

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
              >
                {group.label}
                <ChevronDown
                  size={12}
                  className={cn("transition-transform", isCollapsed && "-rotate-90")}
                />
              </button>

              {!isCollapsed && (
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        title={item.label}
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
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
