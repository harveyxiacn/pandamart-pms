import { t, useLanguage } from "../../i18n";
import { useCallback, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
  LogOut,
  MessageSquare,
  ScrollText,
  Settings,
  ShoppingCart,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/classnames";
import { APP_NAME } from "../../utils/constants";
import { demoAsset } from "../../demo/constants";
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
    get label() { return t("总览"); },
    items: [{ to: "/", get label() { return t("仪表盘"); }, icon: LayoutDashboard, end: true, adminOnly: true }],
  },
  {
    get label() { return t("进货管理"); },
    items: [
      { to: "/invoices/scan", get label() { return t("发票识别"); }, icon: FileSearch },
      { to: "/invoices", get label() { return t("发票列表"); }, icon: Files, end: true },
    ],
  },
  {
    get label() { return t("销售与库存"); },
    items: [
      { to: "/sales", get label() { return t("销售出库"); }, icon: ShoppingCart },
      { to: "/inventory", get label() { return t("库存管理"); }, icon: Boxes },
      { to: "/batches", get label() { return t("批次保质期"); }, icon: CalendarClock },
      { to: "/stocktake", get label() { return t("库存盘点"); }, icon: ClipboardCheck, adminOnly: true },
    ],
  },
  {
    get label() { return t("商品与供应商"); },
    items: [
      { to: "/products", get label() { return t("产品管理"); }, icon: Tag },
      { to: "/suppliers", get label() { return t("供应商"); }, icon: Building2 },
      { to: "/payables", get label() { return t("应付账款"); }, icon: Wallet, adminOnly: true },
    ],
  },
  {
    get label() { return t("经营分析"); },
    items: [
      { to: "/analytics", get label() { return t("数据分析"); }, icon: BarChart3, adminOnly: true },
      { to: "/ai-assistant", get label() { return t("智能助手"); }, icon: MessageSquare, adminOnly: true },
      { to: "/exports", get label() { return t("数据导出"); }, icon: Database, adminOnly: true },
    ],
  },
  {
    get label() { return t("系统管理"); },
    items: [
      { to: "/audit-logs", get label() { return t("审计日志"); }, icon: ScrollText, adminOnly: true },
      { to: "/settings", get label() { return t("系统设置"); }, icon: Settings, adminOnly: true },
      { to: "/users", get label() { return t("用户管理"); }, icon: Users, adminOnly: true },
    ],
  },
];

function initials(name: string | undefined) {
  if (!name) return "?";
  return name.slice(0, 1).toUpperCase();
}

export function Sidebar() {
  useLanguage();
  const { isAdmin, user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
        <img
          src={demoAsset("logo-300x292.png")}
          alt=""
          className="h-9 w-9 rounded-lg bg-surface object-contain p-0.5 ring-1 ring-line"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-ink">{APP_NAME}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-subtle">{t("熊猫超市 · 运营后台")}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-2.5 py-4" aria-label={t("主导航")}>
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsed[group.label] ?? false;

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!isCollapsed}
                className="group flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle transition-colors hover:text-ink-muted"
              >
                {group.label}
                <ChevronDown
                  size={12}
                  aria-hidden="true"
                  className={cn(
                    "opacity-0 transition-[transform,opacity] group-hover:opacity-100",
                    isCollapsed && "-rotate-90"
                  )}
                />
              </button>

              {!isCollapsed ? (
                <div className="mt-1 space-y-0.5">
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
                            "relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-body font-medium transition-colors",
                            isActive
                              ? "bg-accent-soft text-accent"
                              : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive ? (
                              <span
                                aria-hidden="true"
                                className="absolute left-0 h-4 w-[3px] rounded-r-full bg-accent"
                              />
                            ) : null}
                            <Icon size={17} strokeWidth={isActive ? 2.1 : 1.8} aria-hidden="true" />
                            <span className="truncate">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-line p-2.5">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-inset text-body font-semibold text-ink-muted ring-1 ring-inset ring-line">
            {initials(user?.displayName || user?.username)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-medium text-ink">
              {user?.displayName || user?.username}
            </p>
            <p className="text-[10px] text-ink-subtle">
              {user?.role === "admin" ? t("管理员") : t("店员")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("退出登录")}
            title={t("退出登录")}
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-inset hover:text-danger"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}
