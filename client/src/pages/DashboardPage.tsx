import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getDashboard, getAlerts } from "../api/analytics";
import { Card } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { formatCurrency, formatDate, formatDateTime } from "../utils/formatters";
import { cn } from "../utils/classnames";
import type { DashboardAlert, DashboardData } from "../types";

const PIE_COLORS = ["#2f6a56", "#ec9f39", "#ef6f6c", "#1e7d9b", "#8b5a2b"];

/* ── helpers ─────────────────────────────────────────────── */

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function TrendBadge({ current, previous }: { current: number; previous: number }) {
  const pct = pctChange(current, previous);
  if (pct === null) return <span className="text-xs text-slate-400">-</span>;
  if (pct === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-slate-400"><Minus size={12} />持平</span>;
  const isUp = pct > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", isUp ? "text-emerald-600" : "text-danger")}>
      {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {isUp ? "+" : ""}{pct}%
    </span>
  );
}

const severityStyles: Record<string, string> = {
  high: "border-l-4 border-l-danger bg-danger-soft/60",
  medium: "border-l-4 border-l-amber-500 bg-amber-50/60",
  low: "border-l-4 border-l-slate-400 bg-slate-50/60",
};

const severityIcon: Record<string, typeof AlertTriangle> = {
  high: AlertTriangle,
  medium: Clock,
  low: CheckCircle2,
};

const severityBadgeTone: Record<string, "danger" | "warning" | "default"> = {
  high: "danger",
  medium: "warning",
  low: "default",
};

const alertTypeLabels: Record<string, string> = {
  stockout_risk: "库存风险",
  price_spike: "价格波动",
  pending_invoice: "待处理发票",
  expiring_batch: "临期批次",
  slow_mover: "滞销商品",
  cost_increase: "成本上升",
};

/* ── component ───────────────────────────────────────────── */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 递增即触发重新加载（供失败重试）
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    Promise.all([getDashboard(), getAlerts()])
      .then(([dash, alertList]) => {
        if (mounted) {
          setData(dash);
          setAlerts(alertList);
        }
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : "获取仪表盘数据失败");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [reloadKey]);

  const trendData = useMemo(
    () => [
      { label: "今日", amount: data?.today.totalAmount ?? 0 },
      { label: "本周", amount: data?.thisWeek.totalAmount ?? 0 },
      { label: "本月", amount: data?.thisMonth.totalAmount ?? 0 },
    ],
    [data]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (<SkeletonCard key={i} />))}
        </section>
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error)
    return (
      <Card className="flex items-center gap-3 text-danger">
        <span>仪表盘加载失败: {error}</span>
        <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
          重试
        </Button>
      </Card>
    );
  if (!data) return <Card>暂无数据</Card>;

  const highAlerts = alerts.filter((a) => a.severity === "high");
  const medLowAlerts = alerts.filter((a) => a.severity !== "high");

  return (
    <div className="space-y-4">

      {/* ── Alerts banner ───────────────────────────────── */}
      {alerts.length > 0 && (
        <section className="space-y-2">
          {highAlerts.length > 0 && (
            <Card className="border-line bg-danger-soft/40">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle size={18} className="text-danger" />
                <h2 className="text-sm font-bold text-danger">需要注意</h2>
                <Badge tone="danger">{highAlerts.length}</Badge>
              </div>
              <div className="space-y-2">
                {highAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
            </Card>
          )}

          {medLowAlerts.length > 0 && (
            <Card>
              <div className="mb-2 flex items-center gap-2">
                <Clock size={16} className="text-amber-600" />
                <h2 className="text-sm font-bold text-slate-700">提醒事项</h2>
                <Badge tone="warning">{medLowAlerts.length}</Badge>
              </div>
              <div className="space-y-2">
                {medLowAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </div>
            </Card>
          )}
        </section>
      )}

      {/* ── KPI cards with trend comparisons ────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">今日入库金额</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(data.today.totalAmount)}</p>
          <div className="mt-1 flex items-center gap-2">
            <TrendBadge current={data.today.totalAmount} previous={data.comparisons?.yesterday?.totalAmount ?? 0} />
            <span className="text-[11px] text-slate-400">vs 昨日</span>
          </div>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">今日发票数</p>
          <p className="mt-1 text-2xl font-bold">{data.today.invoiceCount}</p>
          <p className="mt-1 text-[11px] text-slate-400">本周 {data.thisWeek.invoiceCount} 张 · 本月 {data.thisMonth.invoiceCount} 张</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">待处理发票</p>
          <p className="mt-1 text-2xl font-bold">{data.today.pendingInvoices}</p>
          <div className="mt-1">
            {data.today.pendingInvoices > 0 ? (
              <Link to="/invoices" className="text-[11px] text-pine hover:underline">去处理 →</Link>
            ) : (
              <span className="text-[11px] text-emerald-600">已全部处理</span>
            )}
          </div>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">低库存告警</p>
          <p className="mt-1 text-2xl font-bold">{data.today.lowStockAlerts}</p>
          <div className="mt-1">
            {data.today.lowStockAlerts > 0 ? (
              <Link to="/inventory" className="text-[11px] text-pine hover:underline">查看详情 →</Link>
            ) : (
              <span className="text-[11px] text-emerald-600">库存充足</span>
            )}
          </div>
        </Card>
      </section>

      {/* ── Charts row ──────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">金额趋势</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><TrendingUp size={12} className="text-emerald-500" /> 周对比: <TrendBadge current={data.thisWeek.totalAmount} previous={data.comparisons?.prevWeek?.totalAmount ?? 0} /></span>
              <span className="flex items-center gap-1"><TrendingDown size={12} className="text-slate-400" /> 月对比: <TrendBadge current={data.thisMonth.totalAmount} previous={data.comparisons?.prevMonth?.totalAmount ?? 0} /></span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="amount" fill="#2f6a56" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h2 className="mb-2 text-lg font-bold">低库存产品占比</h2>
          <div className="h-64">
            {data.lowStockProducts.length === 0 ? (
              <p className="pt-8 text-center text-sm text-slate-500">当前无低库存产品</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.lowStockProducts.slice(0, 5).map((item) => ({
                      name: item.nameZh || item.nameEn,
                      value: Math.max(item.safeStock - item.quantity, 1),
                    }))}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    label
                  >
                    {data.lowStockProducts.slice(0, 5).map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── Lists row ───────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Recent invoices */}
        <Card>
          <h2 className="mb-3 text-lg font-bold">最近发票</h2>
          <div className="space-y-2">
            {data.recentInvoices.length === 0 ? (
              <p className="text-sm text-slate-500">暂无发票记录</p>
            ) : (
              data.recentInvoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  to={`/invoices?id=${invoice.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-pine/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-slate-500">
                        {invoice.supplierName || "未匹配供应商"} · {formatDateTime(invoice.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(invoice.grandTotal)}</p>
                      <Badge tone={invoice.status === "confirmed" ? "success" : invoice.status === "rejected" ? "danger" : "warning"}>
                        {invoice.status === "confirmed" ? "已确认" : invoice.status === "rejected" ? "已驳回" : "待处理"}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Low stock list */}
        <Card>
          <h2 className="mb-3 text-lg font-bold">低库存清单</h2>
          <div className="space-y-2">
            {data.lowStockProducts.length === 0 ? (
              <p className="text-sm text-slate-500">库存状态良好</p>
            ) : (
              data.lowStockProducts.map((item) => (
                <Link
                  key={item.productId}
                  to="/inventory"
                  className="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-pine/40 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.nameZh || item.nameEn}</p>
                    <Badge tone="warning">
                      {item.quantity} / {item.safeStock} {item.unit}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        {/* Expiring batches */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={18} className="text-amber-600" />
            <h2 className="text-lg font-bold">临期批次</h2>
          </div>
          <div className="space-y-2">
            {(data.expiringBatches ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">近 7 天无临期批次</p>
            ) : (
              (data.expiringBatches ?? []).map((batch, idx) => (
                <Link
                  key={`${batch.productId}-${idx}`}
                  to="/batches"
                  className={cn(
                    "block rounded-lg border p-3 transition hover:shadow-sm",
                    batch.expired
                      ? "border-danger/40 bg-danger-soft/50 hover:border-danger"
                      : "border-amber-200 bg-amber-50/50 hover:border-amber-400"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{batch.nameZh || batch.nameEn}</p>
                      <p className="text-xs text-slate-500">批次 {batch.batchNo} · 数量 {batch.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-xs font-medium", batch.expired ? "text-danger" : "text-amber-600")}>
                        {batch.expired ? "已过期" : `到期 ${formatDate(batch.expiryDate)}`}
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ── Alert row sub-component ──────────────────────────────── */

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const Icon = severityIcon[alert.severity] ?? AlertTriangle;
  const content = (
    <div className={cn("flex items-start gap-3 rounded-lg p-3 transition", severityStyles[alert.severity])}>
      <Icon size={16} className={cn("mt-0.5 shrink-0", alert.severity === "high" ? "text-danger" : alert.severity === "medium" ? "text-amber-600" : "text-slate-500")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{alert.title}</span>
          <Badge tone={severityBadgeTone[alert.severity]}>{alertTypeLabels[alert.type] ?? alert.type}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-slate-600">{alert.message}</p>
      </div>
      {alert.link && <ChevronRight size={16} className="shrink-0 text-slate-400" />}
    </div>
  );

  if (alert.link) {
    return <Link to={alert.link} className="block hover:opacity-90">{content}</Link>;
  }
  return content;
}
