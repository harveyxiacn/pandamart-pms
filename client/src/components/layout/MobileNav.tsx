import { NavLink } from "react-router-dom";
import { BarChart3, Boxes, FileSearch, LayoutDashboard, Settings, ShoppingCart } from "lucide-react";
import { cn } from "../../utils/classnames";
import { useAuth } from "../../hooks/useAuth";

const mobileItems = [
  { to: "/", label: "首页", icon: LayoutDashboard, end: true, adminOnly: true },
  { to: "/sales", label: "销售", icon: ShoppingCart },
  { to: "/invoices/scan", label: "识别", icon: FileSearch },
  { to: "/inventory", label: "库存", icon: Boxes },
  { to: "/analytics", label: "分析", icon: BarChart3, adminOnly: true },
  { to: "/settings", label: "设置", icon: Settings, adminOnly: true },
];

export function MobileNav() {
  const { isAdmin } = useAuth();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/30 bg-white/90 p-2 backdrop-blur-md lg:hidden">
      <ul className="flex gap-1">
        {mobileItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
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
      </ul>
    </nav>
  );
}
