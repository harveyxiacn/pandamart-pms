import { LanguageSelector } from "../i18n/LanguageSelector";
import { t, useLanguage } from "../i18n";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Eye,
  EyeOff,
  Lock,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  User,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { DEMO_ACCOUNTS, DEMO_MODE, demoAsset } from "../demo/constants";

const highlights = [
  {
    icon: ScanLine,
    get title() { return t("发票识别入库"); },
    get description() { return t("上传采购发票，自动识别供应商、金额与商品行。"); },
  },
  {
    icon: Boxes,
    get title() { return t("批次与临期跟踪"); },
    get description() { return t("按保质期扣减库存，临期与过期批次提前提醒。"); },
  },
  {
    icon: ReceiptText,
    get title() { return t("账款清晰可查"); },
    get description() { return t("发票、付款与应付余额按供应商一屏对齐。"); },
  },
];

export default function LoginPage() {
  useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState(DEMO_MODE ? "admin" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "demo1234" : "");
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
      const destination = location.state?.destination;
      navigate(typeof destination === "string" && /^\/(?!\/)/.test(destination) ? destination : nextPath, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("登录失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface-muted lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel — hidden on small screens, where the form is the only task. */}
      <aside className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-[0.12]"
          style={{ background: "radial-gradient(circle, #38bdf8 0%, transparent 70%)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full opacity-[0.08]"
          style={{ background: "radial-gradient(circle, #34d399 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <img
            src={demoAsset("logo-300x292.png")}
            alt=""
            className="h-11 w-11 rounded-xl bg-white/95 object-contain p-1.5"
          />
          <div>
            <p className="text-body-lg font-semibold tracking-tight text-white">PandaMart</p>
            <p className="text-meta text-white/55">{t("进销存管理系统")}</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[32px] font-semibold leading-[1.15] tracking-tight text-white">{t("把进货、库存与账款")}<br />{t("放在同一张桌面上。")}</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">{t("面向社区超市与小型仓储团队，从收货到结算的每一步都有据可查。")}</p>

          <ul className="mt-9 space-y-5">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sky-300">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-body font-medium text-white">{item.title}</p>
                    <p className="mt-0.5 text-meta leading-5 text-white/50">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-meta text-white/40">
          <ShieldCheck size={14} aria-hidden="true" />{t("账号登录失败会自动记录审计日志")}</div>
      </aside>

      {/* Form */}
      <main className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img
              src={demoAsset("logo-300x292.png")}
              alt=""
              className="h-10 w-10 rounded-lg bg-surface object-contain p-1 ring-1 ring-line"
            />
            <div>
              <p className="text-body font-semibold text-ink">PandaMart</p>
              <p className="text-meta text-ink-subtle">{t("进销存管理系统")}</p>
            </div>
          </div>

          <div className="mb-4 flex justify-end"><LanguageSelector /></div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t("登录系统")}</h1>
          <p className="mt-1.5 text-sm text-ink-muted">{t("使用门店分配的账号继续，忘记密码请联系管理员。")}</p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <Field label={t("用户名")} htmlFor="login-username" required>
              <div className="relative">
                <User
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                  size={16}
                />
                <Input
                  id="login-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </div>
            </Field>

            <Field label={t("密码")} htmlFor="login-password" required>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                  size={16}
                />
                <Input
                  id="login-password"
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
                  aria-label={showPassword ? t("隐藏密码") : t("显示密码")}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-inset hover:text-ink"
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </Field>

            {error ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" loading={loading} disabled={loading}>{t("登录系统")}</Button>
          </form>

          {DEMO_MODE ? (
            <div className="mt-5 rounded-xl border border-line bg-surface-muted p-3">
              <p className="text-meta font-medium text-ink-muted">{t("演示账号 · 点击自动填入")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    onClick={() => {
                      setUsername(account.username);
                      setPassword(account.password);
                      setError(null);
                    }}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft/40"
                  >
                    <span className="block text-meta font-semibold text-ink">
                      {account.label} · {account.username}
                    </span>
                    <span className="block text-meta text-ink-subtle">{account.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-meta text-ink-subtle">{t("密码统一为 demo1234，数据仅保存在当前浏览器。")}</p>
            </div>
          ) : null}

          <p className="mt-8 text-meta leading-5 text-ink-subtle">{t("PandaMart PMS 仅限授权门店员工使用。所有登录与数据变更都会写入审计日志。")}</p>
        </div>
      </main>
    </div>
  );
}
