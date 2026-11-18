import { categoryName } from "../i18n";
import { getLocale } from "../i18n";
import { productName, t, useLanguage } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
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
  ArrowUpRight,
  Banknote,
  Boxes,
  PackageSearch,
  Percent,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import {
  getCategoryDistribution,
  getProfitByCategory,
  getPriceChanges,
  getProductRanking,
  getProfitSummary,
  getPurchaseTrend,
  getReorderSuggestions,
  getSalesTrend,
  getSlowMovers,
  getSupplierDistribution,
  type ProfitByCategory,
  type ProfitSummary,
  type SlowMovers,
} from "../api/analytics";
import { Card, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { StatCard } from "../components/ui/StatCard";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { DateRangePicker } from "../components/ui/DatePicker";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import {
  ChartTooltip,
  LegendChip,
  axisTick,
  chartColor,
  chartGrid,
  chartMargin,
} from "../components/charts/ChartKit";
import { formatCurrency } from "../utils/formatters";
import { formatCompact, formatMonth, parseISODate, formatISO, type DateRange } from "../utils/date";

type Period = "day" | "week" | "month";

const compactCurrency = () => new Intl.NumberFormat(getLocale(), {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Truncate long product names for chart axes */
function shortName(name: string, max = 8): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

/** Color for reorder urgency */
function urgencyColor(u: string): string {
  if (u === "high") return chartColor(3);
  if (u === "medium") return chartColor(4);
  return chartColor(2);
}

function ChartEmpty({ message }: { message: string }) {
  useLanguage();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-body text-ink-muted">{message}</p>
      <p className="text-meta text-ink-subtle">{t("调整日期范围后再看看")}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const language = useLanguage();
  const [period, setPeriod] = useState<Period>("week");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [purchaseTrend, setPurchaseTrend] = useState<Array<{ date: string; amount: number; invoiceCount: number }>>([]);
  const [salesTrend, setSalesTrend] = useState<Array<{ date: string; amount: number; orderCount: number }>>([]);
  const [supplierDist, setSupplierDist] = useState<Array<{ supplierName: string; totalAmount: number; percentage: number }>>([]);
  const [categoryDist, setCategoryDist] = useState<Array<{ categoryName: string; totalAmount: number; percentage: number }>>([]);
  const [ranking, setRanking] = useState<Array<Record<string, unknown>>>([]);
  const [priceChanges, setPriceChanges] = useState<Array<Record<string, unknown>>>([]);
  const [reorders, setReorders] = useState<Array<Record<string, unknown>>>([]);
  const [profit, setProfit] = useState<ProfitSummary | null>(null);
  const [profitByCat, setProfitByCat] = useState<ProfitByCategory[]>([]);
  const [slowMovers, setSlowMovers] = useState<SlowMovers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 请求竞态守卫：每次 load 自增，setState 前比对，丢弃过期请求结果（FE-N3）
  const reqIdRef = useRef(0);

  const dateParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (dateRange.start) p.dateFrom = dateRange.start;
    if (dateRange.end) p.dateTo = dateRange.end;
    return p;
  }, [dateRange.start, dateRange.end]);

  const load = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [purchaseRes, salesRes, supplierRes, categoryRes, rankingRes, priceRes, reorderRes, profitRes, profitCatRes, slowRes] =
        await Promise.all([
          getPurchaseTrend({ period, ...dateParams }),
          getSalesTrend({ period, ...dateParams }),
          getSupplierDistribution(dateParams),
          getCategoryDistribution(dateParams),
          getProductRanking({ type: "top_selling", limit: 10, ...dateParams }),
          getPriceChanges({ threshold: 5, limit: 10, ...dateParams }),
          getReorderSuggestions(),
          getProfitSummary(dateParams),
          getProfitByCategory(dateParams),
          getSlowMovers({ days: 30, limit: 10 }),
        ]);
      // 过期请求（更晚发起的请求已抢占 reqId）直接丢弃结果，避免覆盖新数据（FE-N3）
      if (myReq !== reqIdRef.current) return;
      setPurchaseTrend(purchaseRes);
      setSalesTrend(salesRes);
      setSupplierDist(supplierRes);
      setCategoryDist(categoryRes);
      setRanking(rankingRes);
      setPriceChanges(priceRes);
      setReorders(reorderRes);
      setProfit(profitRes);
      setProfitByCat(profitCatRes);
      setSlowMovers(slowRes);
    } catch (err: unknown) {
      if (myReq !== reqIdRef.current) return;
      setError(err instanceof Error ? err.message : t("分析数据加载失败"));
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dateRange.start, dateRange.end]);

  /* ── computed ────────────────────────────────────────── */

  const mergedTrend = useMemo(() => {
    const map = new Map<string, { date: string; purchase: number; sales: number }>();
    for (const t of purchaseTrend) {
      map.set(String(t.date), { date: String(t.date), purchase: t.amount, sales: 0 });
    }
    for (const t of salesTrend) {
      const key = String(t.date);
      const existing = map.get(key);
      if (existing) {
        existing.sales = t.amount;
      } else {
        map.set(key, { date: key, purchase: 0, sales: t.amount });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [purchaseTrend, salesTrend]);

  const summaryStats = useMemo(() => {
    const totalPurchase = purchaseTrend.reduce((s, t) => s + t.amount, 0);
    const totalInvoices = purchaseTrend.reduce((s, t) => s + t.invoiceCount, 0);
    const avgOrder = totalInvoices > 0 ? totalPurchase / totalInvoices : 0;
    return { totalPurchase, avgOrder, supplierCount: supplierDist.length, reorderCount: reorders.length };
  }, [language, purchaseTrend, supplierDist, reorders]);

  // 后端日期可能是 "2026-08-17T00:00:00.000Z" / "2026-08-01" 两种形态：
  // 统一截取前 10 位再做展示，周/日显示 MM-DD，月显示 YYYY-MM。
  const trendLabel = (value: string | number) => {
    const day = String(value).slice(0, 10);
    const date = parseISODate(day);
    return date && period === "month" ? formatMonth(date) : formatCompact(day);
  };

  const topSuppliers = supplierDist.slice(0, 6);  const maxSupplier = Math.max(...topSuppliers.map((s) => s.percentage), 1);

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label={t("统计粒度")}
        value={period}
        onChange={(value) => setPeriod(value)}
        options={[
          { value: "day", label: t("按天") },
          { value: "week", label: t("按周") },
          { value: "month", label: t("按月") },
        ]}
      />
      <DateRangePicker
        value={dateRange}
        onChange={setDateRange}
        label={t("分析日期范围")}
        className="w-[15rem]"
      />
    </div>
  );

  /* ── render ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("数据分析")} description={t("采购、销售与毛利的趋势和结构分析。")} actions={headerActions} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface space-y-3 p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="surface xl:col-span-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-72 w-full" />
          </div>
          <div className="surface xl:col-span-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-72 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader title={t("数据分析")} description={t("采购、销售与毛利的趋势和结构分析。")} actions={headerActions} />
        <Card>
          <EmptyState
            icon={ArrowUpRight}
            title={t("分析数据加载失败")}
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>{t("重试")}</Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("数据分析")}
        description={t("看清采购与销售的走势，找出需要补货和滞销的商品。")}
        meta={
          dateRange.start && dateRange.end
            ? `${formatISO(dateRange.start)} – ${formatISO(dateRange.end)}`
            : t("全部时间 · 选择日期范围可缩小口径")
        }
        actions={headerActions}
      />

      {/* ── 采购概览 ─────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label={t("采购总额")}
          value={formatCurrency(summaryStats.totalPurchase)}
          icon={ShoppingCart}
          tone="accent"
          hint={t("所选区间内已确认发票")}
        />
        <StatCard
          label={t("平均单据金额")}
          value={formatCurrency(summaryStats.avgOrder)}
          icon={Banknote}
          tone="neutral"
          hint={t("{0} 张发票", purchaseTrend.reduce((s, t) => s + t.invoiceCount, 0))}
        />
        <StatCard
          label={t("活跃供应商")}
          value={summaryStats.supplierCount}
          icon={Truck}
          tone="neutral"
          hint={t("区间内有采购记录")}
        />
        <StatCard
          label={t("需补货商品")}
          value={summaryStats.reorderCount}
          icon={Boxes}
          tone={summaryStats.reorderCount > 0 ? "danger" : "success"}
          hint={t("当前库存低于安全库存")}
        />
      </section>

      {/* ── 利润概览 ─────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label={t("销售额（已完成）")}
          value={formatCurrency(profit?.revenue ?? 0)}
          icon={Wallet}
          tone="accent"
          hint={t("{0} 笔订单", profit?.orderCount ?? 0)}
        />
        <StatCard
          label={t("销售成本")}
          value={formatCurrency(profit?.cost ?? 0)}
          icon={PackageSearch}
          tone="neutral"
          hint={t("按批次成本计算")}
        />
        <StatCard
          label={t("毛利")}
          value={formatCurrency(profit?.grossProfit ?? 0)}
          icon={ArrowUpRight}
          tone={(profit?.grossProfit ?? 0) >= 0 ? "success" : "danger"}
          hint={t("销售额 − 销售成本")}
        />
        <StatCard
          label={t("毛利率")}
          value={`${profit?.margin ?? 0}%`}
          icon={Percent}
          tone={(profit?.margin ?? 0) >= 20 ? "success" : "warning"}
          hint={t("毛利 ÷ 销售额")}
        />
      </section>

      {/* ── 趋势 + 供应商占比 ─────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={t("采购与销售趋势")}
            description={t("按所选粒度汇总，金额为实际发生额。")}
            action={
              <div className="flex items-center gap-3">
                <LegendChip color={chartColor(1)}>{t("采购")}</LegendChip>
                <LegendChip color={chartColor(2)}>{t("销售")}</LegendChip>
              </div>
            }
          />
          <div className="mt-4 h-72">
            {mergedTrend.length === 0 ? (
              <ChartEmpty message={t("暂无趋势数据")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mergedTrend} margin={chartMargin}>
                  <defs>
                    <linearGradient id="pFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColor(1)} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={chartColor(1)} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="sFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColor(2)} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={chartColor(2)} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                    tickFormatter={trendLabel}
                  />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(value) => compactCurrency().format(Number(value))}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        valueFormatter={(value) => formatCurrency(value)}
                        labelFormatter={trendLabel}
                      />
                    }
                    cursor={{ stroke: chartGrid }}
                  />
                  <Area
                    type="monotone"
                    dataKey="purchase"
                    stroke={chartColor(1)}
                    strokeWidth={2}
                    fill="url(#pFill)"
                    name={t("采购金额")}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke={chartColor(2)}
                    strokeWidth={2}
                    fill="url(#sFill)"
                    name={t("销售金额")}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title={t("供应商采购占比")} description={t("按已确认发票金额计算。")} />
          <div className="mt-4 h-72">
            {supplierDist.length === 0 ? (
              <ChartEmpty message={t("暂无供应商数据")} />
            ) : (
              <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center xl:flex-col">
                <div className="relative h-40 w-full shrink-0 sm:w-1/2 xl:h-36 xl:w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={topSuppliers}
                        dataKey="totalAmount"
                        nameKey="supplierName"
                        innerRadius="62%"
                        outerRadius="88%"
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {topSuppliers.map((_, i) => (
                          <Cell key={i} fill={chartColor(((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6)} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-meta text-ink-subtle">{t("供应商")}</span>
                    <span className="text-title font-semibold tabular text-ink">{supplierDist.length}</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {topSuppliers.map((supplier, i) => (
                    <li key={supplier.supplierName} className="flex items-center gap-2 text-meta">
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: chartColor(((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-ink-muted">{supplier.supplierName}</span>
                      <span className="shrink-0 tabular text-ink-subtle">
                        {Math.round((supplier.totalAmount / Math.max(topSuppliers.reduce((s, x) => s + x.totalAmount, 0), 1)) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {supplierDist.length > 0 ? (
            <p className="mt-2 text-meta text-ink-subtle">{t("最大占比")} {Math.round(maxSupplier)}{t("% · 仅显示前 6 家")}</p>
          ) : null}
        </Card>
      </section>

      {/* ── 分类 ─────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("分类采购分布")} description={t("按商品分类汇总采购金额。")} />
          <div className="mt-4 h-72">
            {categoryDist.length === 0 ? (
              <ChartEmpty message={t("暂无分类数据")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={categoryDist.slice(0, 8).map(row => ({ ...row, categoryName: categoryName(row.categoryName) }))}
                  margin={{ ...chartMargin, left: 8 }}
                >
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrency().format(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="categoryName"
                    width={84}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />}
                    cursor={{ fill: "rgb(var(--surface-inset))" }}
                  />
                  <Bar dataKey="totalAmount" name={t("采购金额")} radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {categoryDist.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={chartColor(((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("分类毛利分析")}
            description={t("销售额与成本对照，差距即毛利。")}
            action={
              <div className="flex items-center gap-3">
                <LegendChip color={chartColor(1)}>{t("销售额")}</LegendChip>
                <LegendChip color={chartColor(6)}>{t("成本")}</LegendChip>
              </div>
            }
          />
          <div className="mt-4 h-72">
            {profitByCat.length === 0 ? (
              <ChartEmpty message={t("暂无销售数据")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={profitByCat.slice(0, 8).map(row => ({ ...row, category: categoryName(row.category) }))}
                  margin={{ ...chartMargin, left: 8 }}
                >
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrency().format(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    width={84}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />}
                    cursor={{ fill: "rgb(var(--surface-inset))" }}
                  />
                  <Bar dataKey="revenue" name={t("销售额")} fill={chartColor(1)} radius={[0, 4, 4, 0]} maxBarSize={14} />
                  <Bar dataKey="cost" name={t("成本")} fill={chartColor(6)} radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── 商品 ─────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("畅销产品 Top 10")} description={t("按销售金额排序。")} />
          <div className="mt-4 h-72">
            {ranking.length === 0 ? (
              <ChartEmpty message={t("暂无销售数据")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={ranking.map((r) => ({
                    name: shortName(String(productName(r.nameZh, r.nameEn) || "-")),
                    amount: Number(r.totalAmount || 0),
                  }))}
                  margin={{ ...chartMargin, left: 8 }}
                >
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrency().format(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />}
                    cursor={{ fill: "rgb(var(--surface-inset))" }}
                  />
                  <Bar dataKey="amount" name={t("销售金额")} fill={chartColor(1)} radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {ranking.map((_, i) => (
                      <Cell key={i} fill={chartColor(((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("价格波动对比")}
            description={t("近两次进价变动超过 5% 的商品。")}
            action={
              <div className="flex items-center gap-3">
                <LegendChip color={chartColor(6)}>{t("原价")}</LegendChip>
                <LegendChip color={chartColor(4)}>{t("现价")}</LegendChip>
              </div>
            }
          />
          <div className="mt-4 h-72">
            {priceChanges.length === 0 ? (
              <ChartEmpty message={t("暂无价格异常")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={priceChanges.map((p) => ({
                    name: shortName(String(productName(p.nameZh, p.nameEn) || "-")),
                    previous: Number(p.previousPrice || 0),
                    current: Number(p.currentPrice || 0),
                  }))}
                  margin={{ ...chartMargin, left: 8 }}
                >
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrency().format(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />}
                    cursor={{ fill: "rgb(var(--surface-inset))" }}
                  />
                  <Bar dataKey="previous" name={t("原价")} fill={chartColor(6)} radius={[0, 4, 4, 0]} maxBarSize={12} />
                  <Bar dataKey="current" name={t("现价")} fill={chartColor(4)} radius={[0, 4, 4, 0]} maxBarSize={12} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── 补货 + 毛利贡献 ──────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("补货需求一览")}
            description={t("当前库存与安全库存对照，颜色表示紧急程度。")}
            action={
              <div className="flex items-center gap-3">
                <LegendChip color={chartColor(3)}>{t("紧急")}</LegendChip>
                <LegendChip color={chartColor(4)}>{t("关注")}</LegendChip>
              </div>
            }
          />
          <div className="mt-4 h-80">
            {reorders.length === 0 ? (
              <ChartEmpty message={t("暂无缺货风险")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={reorders.slice(0, 12).map((r) => ({
                    name: shortName(String(productName(r.nameZh, r.nameEn) || "-")),
                    current: Number(r.currentStock || 0),
                    safe: Number(r.safeStock || 0),
                    urgency: String(r.urgency || "low"),
                  }))}
                  margin={{ ...chartMargin, left: 8 }}
                >
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--surface-inset))" }} />
                  <Bar dataKey="current" name={t("当前库存")} radius={[0, 4, 4, 0]} maxBarSize={12}>
                    {reorders.slice(0, 12).map((r, i) => (
                      <Cell key={i} fill={urgencyColor(String(r.urgency || "low"))} />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="safe"
                    name={t("安全库存")}
                    fill={chartColor(6)}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={12}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("毛利贡献 Top 10")}
            description={t("销售额与毛利的对照，找出真正赚钱的商品。")}
            action={
              <div className="flex items-center gap-3">
                <LegendChip color={chartColor(1)}>{t("销售额")}</LegendChip>
                <LegendChip color={chartColor(2)}>{t("毛利")}</LegendChip>
              </div>
            }
          />
          <div className="mt-4 h-80">
            {!profit || profit.topProducts.length === 0 ? (
              <ChartEmpty message={t("暂无销售数据")} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={profit.topProducts.map((p) => ({
                    name: shortName(productName(p.nameZh, p.nameEn) || "-"),
                    revenue: Math.round(p.revenue * 100) / 100,
                    profit: Math.round(p.profit * 100) / 100,
                  }))}
                  margin={{ ...chartMargin, left: 8 }}
                >
                  <CartesianGrid stroke={chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrency().format(Number(value))}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={84}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />}
                    cursor={{ fill: "rgb(var(--surface-inset))" }}
                  />
                  <Bar dataKey="revenue" name={t("销售额")} fill={chartColor(1)} radius={[0, 4, 4, 0]} maxBarSize={12} />
                  <Bar dataKey="profit" name={t("毛利")} fill={chartColor(2)} radius={[0, 4, 4, 0]} maxBarSize={12} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── 滞销 ─────────────────────────────────────── */}
      <Card>
        <CardHeader
          title={t("滞销预警（近 {0} 天）", slowMovers?.days ?? 30)}
          description={t("库存高但销量低的商品，建议促销或减少下单。")}
          action={
            <div className="flex items-center gap-3">
              <LegendChip color={chartColor(6)}>{t("当前库存")}</LegendChip>
              <LegendChip color={chartColor(4)}>{t("近 30 天售出")}</LegendChip>
            </div>
          }
        />
        <div className="mt-4 h-80">
          {!slowMovers || slowMovers.items.length === 0 ? (
            <ChartEmpty message={t("暂无滞销商品")} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={slowMovers.items.map((item) => ({
                  name: shortName(productName(item.nameZh, item.nameEn) || "-", 10),
                  stock: item.currentStock,
                  sold: item.soldQty,
                }))}
                margin={{ ...chartMargin, left: 8 }}
              >
                <CartesianGrid stroke={chartGrid} horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--surface-inset))" }} />
                <Bar dataKey="stock" name={t("当前库存")} fill={chartColor(6)} radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="sold" name={t("近 30 天售出")} fill={chartColor(4)} radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
