import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md animate-rise rounded-2xl border border-rose-100 bg-white/90 p-6 shadow-card backdrop-blur-md">
        <div className="mb-2 flex items-center gap-3">
          <img
            src="/logo-300x292.png"
            alt="PandaMart Logo"
            className="h-11 w-11 rounded-lg bg-white object-contain p-1 ring-1 ring-rose-200"
          />
          <p className="text-xs uppercase tracking-[0.2em] text-rose-500">PandaMart PMS</p>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-ink">智能库存管理登录</h1>
        <p className="mt-1 text-sm text-slate-600">使用账号进入系统，开始发票识别与库存管理。</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">用户名</span>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
              <Input value={username} onChange={(e) => setUsername(e.target.value)} className="pl-9" required />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">密码</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="mr-1 inline" size={14} />
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
