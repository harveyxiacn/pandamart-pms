import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, Lock, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const authData = await login(username, password);
      const nextPath = authData.user.role === "admin" ? "/" : "/invoices/scan";
      navigate(nextPath, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-md animate-rise rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="mb-2 flex items-center gap-3">
          <img
            src="/logo-300x292.png"
            alt=""
            className="h-11 w-11 rounded-lg bg-surface object-contain p-1 ring-1 ring-line"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
            PandaMart PMS
          </p>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-ink">智能库存管理登录</h1>
        <p className="mt-1 text-sm text-slate-600">使用账号进入系统，开始发票识别与库存管理。</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">用户名</span>
            <div className="relative">
              <User
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
                size={16}
              />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">密码</span>
            <div className="relative">
              <Lock
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
                size={16}
              />
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-surface-inset hover:text-ink"
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </label>

          {error ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "登录中..." : "登录系统"}
          </Button>
        </form>
      </div>
    </div>
  );
}
