import { t, useLanguage } from "../../i18n";
import { useCallback, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
import { Popover } from "../ui/Popover";

const primaryItems = [
  { to: "/", get label() { return t("首页"); }, icon: LayoutDashboard, end: true, adminOnly: true },
  { to: "/invoices/scan", get label() { return t("识别"); }, icon: FileSearch },
  { to: "/sales", get label() { return t("销售"); }, icon: ShoppingCart },
  { to: "/inventory", get label() { return t("库存"); }, icon: Boxes },
  { to: "/analytics", get label() { return t("分析"); }, icon: BarChart3, adminOnly: true },
];

// 「更多」菜单需覆盖全部已注册路由，否则移动端无法到达这些页面。
const overflowItems = [
  { to: "/invoices", get label() { return t("发票列表"); }, icon: Files },
  { to: "/products", get label() { return t("产品管理"); }, icon: Package },
  { to: "/suppliers", get label() { return t("供应商"); }, icon: Building2 },
  { to: "/batches", get label() { return t("批次保质期"); }, icon: CalendarClock },
  { to: "/notifications", get label() { return t("通知"); }, icon: Bell },
  { to: "/stocktake", get label() { return t("库存盘点"); }, icon: ClipboardCheck, adminOnly: true },
  { to: "/payables", get label() { return t("应付账款"); }, icon: Wallet, adminOnly: true },
  { to: "/ai-assistant", get label() { return t("智能助手"); }, icon: Sparkles, adminOnly: true },
  { to: "/exports", get label() { return t("数据导出"); }, icon: Download, adminOnly: true },
  { to: "/audit-logs", get label() { return t("审计日志"); }, icon: ScrollText, adminOnly: true },
  { to: "/users", get label() { return t("用户管理"); }, icon: Users, adminOnly: true },
  { to: "/settings", get label() { return t("设置"); }, icon: Settings, adminOnly: true },
];

export function MobileNav() {
  useLanguage();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => setMenuOpen(false), []);

  const visiblePrimary = primaryItems.filter((i) => !i.adminOnly || isAdmin);
  const visibleOverflow = overflowItems.filter((i) => !i.adminOnly || isAdmin);

  return (
    <nav
      aria-label={t("移动端导航")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-safe backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch px-1.5 pt-1">
        {visiblePrimary.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition-colors",
                    isActive ? "text-accent" : "text-ink-subtle hover:text-ink"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-accent-soft"
                      )}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}

        <li className="flex-1">
          <button
            ref={moreRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "flex w-full flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition-colors",
              menuOpen ? "text-accent" : "text-ink-subtle hover:text-ink"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-11 items-center justify-center rounded-full",
                menuOpen && "bg-accent-soft"
              )}
            >
              {menuOpen ? (
                <X size={18} aria-hidden="true" />
              ) : (
                <MoreHorizontal size={18} aria-hidden="true" />
              )}
            </span>{t("更多")}</button>
        </li>
      </ul>

      <Popover
        open={menuOpen}
        onClose={close}
        anchorRef={moreRef}
        align="end"
        role="menu"
        ariaLabel={t("更多页面")}
        className="mb-1 p-1.5"
      >
        <div className="grid grid-cols-3 gap-1">
          {visibleOverflow.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  navigate(item.to);
                }}
                className="flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </Popover>
    </nav>
  );
}
