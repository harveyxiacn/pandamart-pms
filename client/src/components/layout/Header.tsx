import { Bell, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUnreadCount } from "../../api/notifications";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

export function Header() {
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    getUnreadCount()
      .then((res) => {
        if (mounted) setUnreadCount(res.count);
      })
      .catch(() => {
        if (mounted) setUnreadCount(0);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className="sticky top-0 z-20 mb-4 flex items-center justify-between rounded-xl border border-rose-100 bg-white/90 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <img
          src="/logo-300x292.png"
          alt="PandaMart Logo"
          className="h-9 w-9 rounded-lg bg-white object-contain p-1 ring-1 ring-rose-200"
        />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-rose-500">PandaMart</p>
          <p className="text-sm font-semibold text-ink">
            {user?.displayName || user?.username} · {user?.role === "admin" ? "管理员" : "店员"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="relative rounded-lg border border-slate-200 bg-white p-2"
          onClick={() => navigate("/notifications")}
          type="button"
        >
          <Bell size={18} />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-coral px-1 text-center text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
        <Badge tone="default">{user?.username}</Badge>
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
        >
          <LogOut size={16} className="mr-1" />
          退出
        </Button>
      </div>
    </header>
  );
}
