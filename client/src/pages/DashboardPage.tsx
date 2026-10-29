import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSearch,
  FileText,
  Package,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { getDashboard, getAlerts } from "../api/analytics";
import { PageHeader } from "../components/ui/PageHeader";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { StatCard, Trend } from "../components/ui/StatCard";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton, SkeletonCard } from "../components/ui/Skeleton";
import {
  ChartTooltip,
  LegendChip,
  axisTick,
  chartColor,
  chartGrid,
  chartMargin,
} from "../components/charts/ChartKit";
import { formatCurrency, formatDate, formatDateTime } from "../utils/formatters";
import { parseISODate } from "../utils/date";
import { cn } from "../utils/classnames";
import type { DashboardAlert, DashboardData } from "../types";

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const alertTypeLabels: Record<string, string> = {
  stockout_risk: "库存风险",
  price_spike: "价格波动",
  pending_invoice: "待处理发票",
  expiring_batch: "临期批次",
  slow_mover: "滞销商品",
  cost_increase: "成本上升",
};

const severityMeta = {
  high: { tone: "danger" as const, icon: AlertTriangle, label: "紧急" },
  medium: { tone: "warning" as const, icon: Clock, label: "提醒" },
  low: { tone: "default" as const, icon: CheckCircle2, label: "提示" },
};

function daysUntil(iso: string): number | null {
  const date = parseISODate(iso);
  if (!date) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((date.getTime() - start.getTime()) / 86_400_000);
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, alertList] = await Promise.all([getDashboard(), getAlerts()]);
      setData(dashboard);
      setAlerts(alertList);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "获取仪表盘数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const comparisonData = useMemo(
    () =>
      data
        ? [
            {
              label: "今日",
              current: data.today.totalAmount,
              previous: data.comparisons?.yesterday?.totalAmount ?? 0,
            },
            {
              label: "本周",
              current: data.thisWeek.totalAmount,
              previous: data.comparisons?.prevWeek?.totalAmount ?? 0,
            },
            {
              label: "本月",
              current: data.thisMonth.totalAmount,
              previous: data.comparisons?.prevMonth?.totalAmount ?? 0,
            },
          ]
        : [],
    [data]
  );

  const lowStockChart = useMemo(() => {
    if (!data) return [];
    return data.lowStockProducts.slice(0, 5).map((item) => ({
      name: item.nameZh || item.nameEn,
      value: Math.max(item.safeStock - item.quantity, 1),
      quantity: item.quantity,
      safeStock: item.safeStock,
      unit: item.unit,
    }));
  }, [data]);

  const highAlerts = alerts.filter((a) => a.severity === "high");
  const otherAlerts = alerts.filter((a) => a.severity !== "high");
  const visibleAlerts = showAllAlerts ? alerts : highAlerts;

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-5">
          <Skeleton className="h-80 xl:col-span-3" />
          <Skeleton className="h-80 xl:col-span-2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertTriangle size={22} aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold text-ink">仪表盘加载失败</p>
          <p className="mt-0.5 text-sm text-ink-muted">{error}</p>
        </div>
        <Button variant="secondary" leadingIcon={RefreshCw} onClick={() => void load()}>
          重试
        </Button>
      </Card>
    );
  }

  if (!data) return <Card>暂无数据</Card>;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        title="运营概览"
        description="今天需要处理的事、进货趋势和库存风险，一屏看完。"
        meta={
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} aria-hidden="true" />
            更新于{" "}
            {lastUpdated
              ? lastUpdated.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
              : "—"}
            <span className="mx-1 text-line-strong" aria-hidden="true">
              ·
            </span>
            数据来自已确认发票
          </span>
        }
        actions={
          <>
            <Button
              variant="secondary"
              leadingIcon={RefreshCw}
              loading={loading}
              onClick={() => void load()}
            >
              刷新
            </Button>
            <Button leadingIcon={BarChart3} onClick={() => navigate("/analytics")}>
              查看分析
            </Button>
          </>
        }
      />

      {/* ── attention ─────────────────────────────────────── */}
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-success/20 bg-success-soft/70 px-4 py-3 text-success">
          <CheckCircle2 size={18} aria-hidden="true" />
          <p className="text-sm font-medium">今天没有需要处理的异常，库存与价格均在正常范围。</p>
        </div>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger-soft text-danger">
                <AlertTriangle size={15} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">需要关注</h2>
                <p className="text-meta text-ink-subtle">
                  {highAlerts.length > 0
                    ? `${highAlerts.length} 项紧急`
                    : "没有紧急事项"}
                  {otherAlerts.length > 0 ? ` · ${otherAlerts.length} 项提醒` : ""}
                </p>
              </div>
            </div>
            {otherAlerts.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAllAlerts((v) => !v)}>
                {showAllAlerts ? "只看紧急" : "查看全部"}
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className={cn("transition-transform", showAllAlerts && "-rotate-90")}
                />
              </Button>
            ) : null}
          </div>
          <ul className="divide-y divide-line/70">
            {visibleAlerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        </Card>
      )}

      {/* ── KPIs ──────────────────────────────────────────── */}
      <section aria-label="关键指标" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="今日入库金额"
          value={formatCurrency(data.today.totalAmount)}
          icon={Wallet}
          tone="accent"
          delta={{
            current: data.today.totalAmount,
            previous: data.comparisons?.yesterday?.totalAmount ?? 0,
            label: "较昨日",
          }}
        />
        <StatCard
          label="今日发票"
          value={data.today.invoiceCount}
          icon={FileText}
          tone="neutral"
          hint={`本周 ${data.thisWeek.invoiceCount} 张 · 本月 ${data.thisMonth.invoiceCount} 张`}
        />
        <StatCard
          label="待处理发票"
          value={data.today.pendingInvoices}
          icon={FileSearch}
          tone={data.today.pendingInvoices > 0 ? "warning" : "success"}
          to="/invoices"
          hint={data.today.pendingInvoices > 0 ? "点击前往处理" : "已全部处理"}
        />
        <StatCard
          label="低库存商品"
          value={data.today.lowStockAlerts}
          icon={Package}
          tone={data.today.lowStockAlerts > 0 ? "danger" : "success"}
          to="/inventory"
          hint={data.today.lowStockAlerts > 0 ? "查看补货建议" : "库存充足"}
        />
      </section>

      {/* ── charts ────────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="进货金额对比"
            description="今日、本周、本月与上一周期的入库金额。"
            action={
              <div className="flex items-center gap-3">
                <LegendChip color={chartColor(1)}>本期</LegendChip>
                <LegendChip color="rgb(var(--line-strong))">上期</LegendChip>
              </div>
            }
          />
          <div
            className="mt-4 h-64"
            role="img"
            aria-label="进货金额对比柱状图：今日、本周、本月与上一周期"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={chartMargin} barGap={6}>
                <CartesianGrid stroke={chartGrid} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(value: number) => compactCurrency.format(value)}
                />
                <Tooltip
                  cursor={{ fill: "rgb(var(--surface-inset))", opacity: 0.6 }}
                  content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />}
                />
                <Bar dataKey="current" name="本期" fill={chartColor(1)} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar
                  dataKey="previous"
                  name="上期"
                  fill="rgb(var(--line-strong))"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3 text-meta text-ink-subtle">
            <span className="inline-flex items-center gap-1.5">
              本周较上周
              <Trend current={data.thisWeek.totalAmount} previous={data.comparisons?.prevWeek?.totalAmount ?? 0} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              本月较上月
              <Trend current={data.thisMonth.totalAmount} previous={data.comparisons?.prevMonth?.totalAmount ?? 0} />
            </span>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="低库存分布"
            description="距离安全库存的缺口，按商品排序。"
            action={
              <Link to="/inventory" className="text-meta font-medium text-accent hover:underline">
                查看全部
              </Link>
            }
          />
          {lowStockChart.length === 0 ? (
            <EmptyState
              icon={Package}
              title="库存状态良好"
              description="当前没有低于安全库存的商品。"
              size="sm"
              className="mt-4"
            />
          ) : (
            <>
              <div className="relative mt-2 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={lowStockChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="rgb(var(--surface))"
                      strokeWidth={2}
                    >
                      {lowStockChart.map((_, index) => (
                        <Cell key={index} fill={chartColor(((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6)} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[26px] font-semibold leading-none tabular text-ink">
                    {data.lowStockProducts.length}
                  </span>
                  <span className="mt-1 text-meta text-ink-subtle">项低库存</span>
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                {lowStockChart.map((item, index) => (
                  <li key={item.name} className="flex items-center gap-2 text-meta">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: chartColor(((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink-muted">{item.name}</span>
                    <span className="tabular text-ink-subtle">
                      缺 {item.value} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </section>

      {/* ── lists ─────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        <ListCard
          title="最近发票"
          description="最新录入的采购单据。"
          link="/invoices"
          linkLabel="全部发票"
          empty={data.recentInvoices.length === 0}
          emptyIcon={FileText}
          emptyTitle="暂无发票记录"
          emptyDescription="识别第一张供应商发票后，这里会显示最近记录。"
        >
          {data.recentInvoices.map((invoice) => (
            <Link
              key={invoice.id}
              to={`/invoices?id=${invoice.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{invoice.invoiceNumber}</p>
                <p className="truncate text-meta text-ink-subtle">
                  {invoice.supplierName || "未匹配供应商"} · {formatDateTime(invoice.createdAt)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-body font-semibold tabular text-ink">{formatCurrency(invoice.grandTotal)}</p>
                <Badge
                  size="sm"
                  tone={
                    invoice.status === "confirmed"
                      ? "success"
                      : invoice.status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {invoice.status === "confirmed" ? "已确认" : invoice.status === "rejected" ? "已驳回" : "待处理"}
                </Badge>
              </div>
            </Link>
          ))}
        </ListCard>

        <ListCard
          title="低库存清单"
          description="低于安全库存，建议尽快补货。"
          link="/inventory"
          linkLabel="库存管理"
          empty={data.lowStockProducts.length === 0}
          emptyIcon={Package}
          emptyTitle="库存状态良好"
          emptyDescription="所有商品都高于安全库存线。"
        >
          {data.lowStockProducts.slice(0, 5).map((item) => {
            const ratio = item.safeStock > 0 ? Math.min(100, Math.round((item.quantity / item.safeStock) * 100)) : 0;
            return (
              <Link
                key={item.productId}
                to="/inventory"
                className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-muted"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-body font-medium text-ink">{item.nameZh || item.nameEn}</p>
                  <p className="shrink-0 text-meta tabular text-ink-muted">
                    <span className="font-semibold text-danger">{item.quantity}</span>
                    <span className="text-ink-subtle"> / {item.safeStock} {item.unit}</span>
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-inset">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      ratio < 50 ? "bg-danger" : "bg-warning"
                    )}
                    style={{ width: `${Math.max(ratio, 4)}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </ListCard>

        <ListCard
          title="临期批次"
          description="按到期日排序，先到期的先处理。"
          link="/batches"
          linkLabel="批次管理"
          empty={(data.expiringBatches ?? []).length === 0}
          emptyIcon={CalendarClock}
          emptyTitle="近 7 天无临期批次"
          emptyDescription="暂没有需要优先处理的保质期商品。"
        >
          {(data.expiringBatches ?? []).map((batch, index) => {
            const days = daysUntil(batch.expiryDate);
            const urgent = batch.expired || (days !== null && days <= 3);
            return (
              <Link
                key={`${batch.productId}-${index}`}
                to="/batches"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-muted"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    urgent ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
                  )}
                >
                  <CalendarClock size={15} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{batch.nameZh || batch.nameEn}</p>
                  <p className="truncate text-meta text-ink-subtle">
                    批次 {batch.batchNo} · {batch.quantity} 件
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-meta font-medium text-ink-muted">{formatDate(batch.expiryDate)}</p>
                  <p className={cn("text-[11px]", urgent ? "text-danger" : "text-warning")}>
                    {batch.expired ? "已过期" : days === 0 ? "今天到期" : `${days} 天后`}
                  </p>
                </div>
              </Link>
            );
          })}
        </ListCard>
      </section>
    </div>
  );
}

/* ── sub-components ───────────────────────────────────────── */

function AlertRow({ alert }: { alert: DashboardAlert }) {
  const meta = severityMeta[alert.severity] ?? severityMeta.low;
  const Icon = meta.icon;
  const content = (
    <div className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/60">
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          alert.severity === "high"
            ? "bg-danger-soft text-danger"
            : alert.severity === "medium"
              ? "bg-warning-soft text-warning"
              : "bg-surface-inset text-ink-muted"
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-medium text-ink">{alert.title}</span>
          <Badge size="sm" tone={severityMeta[alert.severity]?.tone ?? "default"}>
            {alertTypeLabels[alert.type] ?? alert.type}
          </Badge>
        </div>
        <p className="mt-0.5 text-meta text-ink-muted">{alert.message}</p>
      </div>
      {alert.link ? (
        <ArrowRight size={15} className="mt-1 shrink-0 text-ink-subtle" aria-hidden="true" />
      ) : null}
    </div>
  );
  if (alert.link) {
    return (
      <li>
        <Link to={alert.link} className="block">
          {content}
        </Link>
      </li>
    );
  }
  return <li>{content}</li>;
}

interface ListCardProps {
  title: string;
  description?: string;
  link: string;
  linkLabel: string;
  empty: boolean;
  emptyIcon: typeof Package;
  emptyTitle: string;
  emptyDescription?: string;
  children: React.ReactNode;
}

function ListCard({
  title,
  description,
  link,
  linkLabel,
  empty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  children,
}: ListCardProps) {
  return (
    <Card padded={false} className="flex flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
        <div>
          <h2 className="text-title font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="text-meta text-ink-subtle">{description}</p> : null}
        </div>
        <Link
          to={link}
          className="shrink-0 whitespace-nowrap text-meta font-medium text-accent hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
      {empty ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          size="sm"
          className="flex-1"
        />
      ) : (
        <div className="mt-1 flex-1 space-y-0.5 px-2 pb-2">{children}</div>
      )}
    </Card>
  );
}
