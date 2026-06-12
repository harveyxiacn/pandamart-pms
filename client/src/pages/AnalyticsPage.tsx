import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { Card } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Skeleton";
import { Select } from "../components/ui/Select";
import { formatCurrency } from "../utils/formatters";
import { cn } from "../utils/classnames";

const CHART_COLORS = ["#2f6a56", "#ec9f39", "#ef6f6c", "#1e7d9b", "#9a6d38", "#475569"];
const PURCHASE_COLOR = "#2f6a56";
const SALES_COLOR = "#ec9f39";

/* ── helpers ─────────────────────────────────────────── */

/** Truncate long product names for chart axes */
function shortName(name: string, max = 8): string {
  return name.length > max ? name.slice(0, max) + "\u2026" : name;
}

/** Color for reorder urgency */
function urgencyColor(u: string): string {
  if (u === "high") return "#ef6f6c";
  if (u === "medium") return "#ec9f39";
  return "#2f6a56";
}

/* ── component ───────────────────────────────────────── */

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("week");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  const dateParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    return p;
  }, [dateFrom, dateTo]);

  const load = async () => {
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
      setError(err instanceof Error ? err.message : "\u5206\u6790\u6570\u636e\u52a0\u8f7d\u5931\u8d25");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, dateFrom, dateTo]);

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
  }, [purchaseTrend, supplierDist, reorders]);

  /* ── render ──────────────────────────────────────────── */

  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  if (error) return <Card className="text-rose-700">{error}</Card>;

  return (
    <div className="space-y-4">
      {/* ── Header: period + date range picker ──────────── */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">\u6570\u636e\u5206\u6790\u4e2d\u5fc3</h2>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-32">
            <option value="day">\u6309\u5929</option>
            <option value="week">\u6309\u5468</option>
            <option value="month">\u6309\u6708</option>
          </Select>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500">\u4ece</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <label className="text-slate-500">\u81f3</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-pine hover:underline">
                \u6e05\u9664
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Summary KPIs ─────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">\u91c7\u8d2d\u603b\u989d</p>
          <p className="text-2xl font-bold text-pine">{formatCurrency(summaryStats.totalPurchase)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">\u5e73\u5747\u5355\u636e\u91d1\u989d</p>
          <p className="text-2xl font-bold text-slate-700">{formatCurrency(summaryStats.avgOrder)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">\u6d3b\u8dc3\u4f9b\u5e94\u5546</p>
          <p className="text-2xl font-bold text-teal-700">{summaryStats.supplierCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">\u9700\u8865\u8d27\u5546\u54c1</p>
          <p className={cn("text-2xl font-bold", summaryStats.reorderCount > 0 ? "text-rose-600" : "text-emerald-600")}>
            {summaryStats.reorderCount}
          </p>
        </Card>
      </section>

      {/* ── Profit KPIs ──────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">\u9500\u552e\u989d\uff08\u5df2\u5b8c\u6210\uff09</p>
          <p className="text-2xl font-bold text-pine">{formatCurrency(profit?.revenue ?? 0)}</p>
          <p className="text-xs text-slate-400">{profit?.orderCount ?? 0} \u7b14\u8ba2\u5355</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">\u9500\u552e\u6210\u672c</p>
          <p className="text-2xl font-bold text-slate-700">{formatCurrency(profit?.cost ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">\u6bdb\u5229</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(profit?.grossProfit ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">\u6bdb\u5229\u7387</p>
          <p className="text-2xl font-bold text-amber-600">{profit?.margin ?? 0}%</p>
        </Card>
      </section>

      {/* ── Dual trend + Supplier pie ───────────────────── */}
      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h3 className="mb-2 font-bold">\u91c7\u8d2d & \u9500\u552e\u8d8b\u52bf</h3>
          <div className="h-72">
            {mergedTrend.length === 0 ? (
              <p className="pt-10 text-center text-sm text-slate-500">\u6682\u65e0\u6570\u636e</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mergedTrend}>
                  <defs>
                    <linearGradient id="pFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PURCHASE_COLOR} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={PURCHASE_COLOR} stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="sFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SALES_COLOR} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={SALES_COLOR} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Legend />
                  <Area type="monotone" dataKey="purchase" stroke={PURCHASE_COLOR} fill="url(#pFill)" name="\u91c7\u8d2d\u91d1\u989d" />
                  <Area type="monotone" dataKey="sales" stroke={SALES_COLOR} fill="url(#sFill)" name="\u9500\u552e\u91d1\u989d" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h3 className="mb-2 font-bold">\u4f9b\u5e94\u5546\u91c7\u8d2d\u5360\u6bd4</h3>
          <div className="h-72">
            {supplierDist.length === 0 ? (
              <p className="pt-10 text-center text-sm text-slate-500">\u6682\u65e0\u6570\u636e</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={supplierDist.slice(0, 6)} dataKey="totalAmount" nameKey="supplierName" label outerRadius={90}>
                    {supplierDist.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── Category bar + Profit-by-category bar ────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-bold">\u5206\u7c7b\u91c7\u8d2d\u5206\u5e03</h3>
          <div className="h-72">
            {categoryDist.length === 0 ? (
              <p className="text-center text-sm text-slate-500">\u6682\u65e0\u6570\u636e</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={categoryDist.slice(0, 8)} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="categoryName" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Bar dataKey="totalAmount" name="\u91c7\u8d2d\u91d1\u989d" radius={[0, 4, 4, 0]}>
                    {categoryDist.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 font-bold">\u5206\u7c7b\u6bdb\u5229\u5206\u6790</h3>
          <div className="h-72">
            {profitByCat.length === 0 ? (
              <p className="text-center text-sm text-slate-500">\u6682\u65e0\u9500\u552e\u6570\u636e</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={profitByCat.slice(0, 8)} margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="category" width={80} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="revenue" name="\u9500\u552e\u989d" fill={PURCHASE_COLOR} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="cost" name="\u6210\u672c" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── Product ranking bar + Price changes grouped bar */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-bold">\u7545\u9500\u4ea7\u54c1 Top 10</h3>
          <div className="h-72">
            {ranking.length === 0 ? (
              <p className="text-center text-sm text-slate-500">\u6682\u65e0\u6570\u636e</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={ranking.map((r) => ({
                    name: shortName(String(r.nameZh || r.nameEn || "-")),
                    amount: Number(r.totalAmount || 0),
                  }))}
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Bar dataKey="amount" name="\u91c7\u8d2d\u91d1\u989d" radius={[0, 4, 4, 0]}>
                    {ranking.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 font-bold">\u4ef7\u683c\u6ce2\u52a8\u5bf9\u6bd4</h3>
          <div className="h-72">
            {priceChanges.length === 0 ? (
              <p className="text-center text-sm text-slate-500">\u6682\u65e0\u4ef7\u683c\u5f02\u5e38</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={priceChanges.map((p) => ({
                    name: shortName(String(p.nameZh || p.nameEn || "-")),
                    previous: Number(p.previousPrice || 0),
                    current: Number(p.currentPrice || 0),
                  }))}
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="previous" name="\u539f\u4ef7" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="current" name="\u73b0\u4ef7" fill={SALES_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── Reorder urgency + Profit top products ────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-bold">\u8865\u8d27\u9700\u6c42\u4e00\u89c8</h3>
          <div className="h-80">
            {reorders.length === 0 ? (
              <p className="text-center text-sm text-slate-500">\u6682\u65e0\u7f3a\u8d27\u98ce\u9669</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={reorders.slice(0, 12).map((r) => ({
                    name: shortName(String(r.nameZh || r.nameEn || "-")),
                    current: Number(r.currentStock || 0),
                    safe: Number(r.safeStock || 0),
                    urgency: String(r.urgency || "low"),
                  }))}
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="current" name="\u5f53\u524d\u5e93\u5b58" radius={[0, 4, 4, 0]}>
                    {reorders.slice(0, 12).map((r, i) => (
                      <Cell key={i} fill={urgencyColor(String(r.urgency || "low"))} />
                    ))}
                  </Bar>
                  <Bar dataKey="safe" name="\u5b89\u5168\u5e93\u5b58" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 font-bold">\u6bdb\u5229\u8d21\u732e Top 10</h3>
          <div className="h-80">
            {!profit || profit.topProducts.length === 0 ? (
              <p className="text-center text-sm text-slate-500">\u6682\u65e0\u9500\u552e\u6570\u636e</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={profit.topProducts.map((p) => ({
                    name: shortName(p.nameZh || p.nameEn || "-"),
                    revenue: Math.round(p.revenue * 100) / 100,
                    profit: Math.round(p.profit * 100) / 100,
                  }))}
                  margin={{ left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="revenue" name="\u9500\u552e\u989d" fill={PURCHASE_COLOR} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="profit" name="\u6bdb\u5229" fill="#1e7d9b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      {/* ── Slow movers ─────────────────────────────────── */}
      <Card>
        <h3 className="mb-2 font-bold">{`\u6ede\u9500\u9884\u8b66\uff08\u8fd1 ${slowMovers?.days ?? 30} \u5929\uff09`}</h3>
        <div className="h-64">
          {!slowMovers || slowMovers.items.length === 0 ? (
            <p className="text-center text-sm text-slate-500">\u6682\u65e0\u6ede\u9500\u5546\u54c1</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={slowMovers.items.map((item) => ({
                  name: shortName(item.nameZh || item.nameEn || "-", 10),
                  stock: item.currentStock,
                  sold: item.soldQty,
                }))}
                margin={{ left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="stock" name="\u5f53\u524d\u5e93\u5b58" fill="#475569" radius={[0, 4, 4, 0]} />
                <Bar dataKey="sold" name="\u8fd130\u5929\u552e\u51fa" fill={SALES_COLOR} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
