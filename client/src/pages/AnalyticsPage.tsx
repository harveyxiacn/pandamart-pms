import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
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
  getCategoryDistribution,
  getPriceChanges,
  getProductRanking,
  getProfitSummary,
  getPurchaseTrend,
  getReorderSuggestions,
  getSlowMovers,
  getSupplierDistribution,
  type ProfitSummary,
  type SlowMovers,
} from "../api/analytics";
import { Card } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Skeleton";
import { Select } from "../components/ui/Select";
import { formatCurrency } from "../utils/formatters";

const CHART_COLORS = ["#2f6a56", "#ec9f39", "#ef6f6c", "#1e7d9b", "#9a6d38", "#475569"];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("week");
  const [trend, setTrend] = useState<Array<{ date: string; amount: number; invoiceCount: number }>>([]);
  const [supplierDist, setSupplierDist] = useState<Array<{ supplierName: string; totalAmount: number; percentage: number }>>([]);
  const [categoryDist, setCategoryDist] = useState<Array<{ categoryName: string; totalAmount: number; percentage: number }>>([]);
  const [ranking, setRanking] = useState<Array<Record<string, unknown>>>([]);
  const [priceChanges, setPriceChanges] = useState<Array<Record<string, unknown>>>([]);
  const [reorders, setReorders] = useState<Array<Record<string, unknown>>>([]);
  const [profit, setProfit] = useState<ProfitSummary | null>(null);
  const [slowMovers, setSlowMovers] = useState<SlowMovers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [trendRes, supplierRes, categoryRes, rankingRes, priceRes, reorderRes, profitRes, slowRes] =
        await Promise.all([
          getPurchaseTrend({ period }),
          getSupplierDistribution(),
          getCategoryDistribution(),
          getProductRanking({ type: "top_selling", limit: 10 }),
          getPriceChanges({ threshold: 5, limit: 10 }),
          getReorderSuggestions(),
          getProfitSummary(),
          getSlowMovers({ days: 30, limit: 10 }),
        ]);
      setTrend(trendRes);
      setSupplierDist(supplierRes);
      setCategoryDist(categoryRes);
      setRanking(rankingRes);
      setPriceChanges(priceRes);
      setReorders(reorderRes);
      setProfit(profitRes);
      setSlowMovers(slowRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "分析数据加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  if (error) return <Card className="text-rose-700">加载失败: {error}</Card>;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">数据分析中心</h2>
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
            <option value="day">按天</option>
            <option value="week">按周</option>
            <option value="month">按月</option>
          </Select>
        </div>
      </Card>

      {/* 销售毛利汇总 */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">销售额（已完成）</p>
          <p className="text-2xl font-bold text-pine">{formatCurrency(profit?.revenue ?? 0)}</p>
          <p className="text-xs text-slate-400">{profit?.orderCount ?? 0} 笔订单</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">销售成本</p>
          <p className="text-2xl font-bold text-slate-700">{formatCurrency(profit?.cost ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">毛利</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(profit?.grossProfit ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">毛利率</p>
          <p className="text-2xl font-bold text-amber-600">{profit?.margin ?? 0}%</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">毛利贡献 Top 10</h3>
          <div className="space-y-2 text-sm">
            {!profit || profit.topProducts.length === 0 ? (
              <p className="text-slate-500">暂无销售数据</p>
            ) : (
              profit.topProducts.map((item, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.nameZh || item.nameEn || "-"}</p>
                    <p className="font-semibold text-emerald-700">{formatCurrency(item.profit)}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    销售额 {formatCurrency(item.revenue)} · 销量 {item.qty}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold">滞销预警（近 {slowMovers?.days ?? 30} 天）</h3>
          <div className="space-y-2 text-sm">
            {!slowMovers || slowMovers.items.length === 0 ? (
              <p className="text-slate-500">暂无滞销商品</p>
            ) : (
              slowMovers.items.map((item) => (
                <div key={item.productId} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.nameZh || item.nameEn || "-"}</p>
                    <p className={item.soldQty === 0 ? "font-semibold text-rose-700" : "text-slate-600"}>
                      售出 {item.soldQty}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">当前库存 {item.currentStock}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h3 className="mb-2 font-bold">采购趋势</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2f6a56" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#2f6a56" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                <Area type="monotone" dataKey="amount" stroke="#2f6a56" fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <h3 className="mb-2 font-bold">供应商采购占比</h3>
          <div className="h-64">
            {supplierDist.length === 0 ? (
              <p className="pt-10 text-center text-sm text-slate-500">暂无数据</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={supplierDist.slice(0, 6)} dataKey="totalAmount" nameKey="supplierName" label outerRadius={90}>
                    {supplierDist.slice(0, 6).map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">畅销产品 Top 10</h3>
          <div className="space-y-2 text-sm">
            {ranking.map((item) => (
              <div key={String(item.productId)} className="rounded-lg border border-slate-200 bg-white p-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{String(item.nameZh || item.nameEn || "-")}</p>
                  <p>{formatCurrency(Number(item.totalAmount || 0))}</p>
                </div>
                <p className="text-xs text-slate-500">数量: {String(item.totalQuantity || 0)} · 次数: {String(item.purchaseCount || 0)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold">价格波动预警</h3>
          <div className="space-y-2 text-sm">
            {priceChanges.length === 0 ? (
              <p className="text-slate-500">暂无价格异常</p>
            ) : (
              priceChanges.map((item) => (
                <div key={String(item.productId)} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{String(item.nameZh || item.nameEn || "-")}</p>
                    <p
                      className={
                        Number(item.changePercent || 0) > 0 ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"
                      }
                    >
                      {Number(item.changePercent || 0) > 0 ? "+" : ""}
                      {String(item.changePercent || 0)}%
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(Number(item.previousPrice || 0))} → {formatCurrency(Number(item.currentPrice || 0))}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">分类采购分布</h3>
          <div className="space-y-2 text-sm">
            {categoryDist.length === 0 ? (
              <p className="text-slate-500">暂无数据</p>
            ) : (
              categoryDist.map((item) => (
                <div key={item.categoryName} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.categoryName}</p>
                    <p>{item.percentage}%</p>
                  </div>
                  <p className="text-xs text-slate-500">{formatCurrency(item.totalAmount)}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-bold">智能订货建议</h3>
          <div className="space-y-2 text-sm">
            {reorders.length === 0 ? (
              <p className="text-slate-500">暂无缺货风险</p>
            ) : (
              reorders.map((item) => (
                <div key={String(item.productId)} className="rounded-lg border border-slate-200 bg-white p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{String(item.nameZh || item.nameEn || "-")}</p>
                    <p>建议: {String(item.suggestedQuantity || 0)}</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    当前 {String(item.currentStock || 0)} / 安全库存 {String(item.safeStock || 0)} · 预计 {formatCurrency(Number(item.estimatedCost || 0))}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
