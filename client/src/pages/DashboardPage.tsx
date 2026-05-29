import { useEffect, useMemo, useState } from "react";
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
import { getDashboard } from "../api/analytics";
import { Card } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Skeleton";
import { Badge } from "../components/ui/Badge";
import { formatCurrency, formatDateTime } from "../utils/formatters";
import type { DashboardData } from "../types";

const PIE_COLORS = ["#2f6a56", "#ec9f39", "#ef6f6c", "#1e7d9b", "#8b5a2b"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getDashboard()
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : "获取仪表盘数据失败");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const trendData = useMemo(
    () => [
      { label: "今日", amount: data?.today.totalAmount ?? 0 },
      { label: "本周", amount: data?.thisWeek.totalAmount ?? 0 },
      { label: "本月", amount: data?.thisMonth.totalAmount ?? 0 },
    ],
    [data]
  );

  if (loading)
    return (
      <div className="space-y-4">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </section>
        <SkeletonCard />
      </div>
    );
  if (error) return <Card className="text-rose-700">仪表盘加载失败: {error}</Card>;
  if (!data) return <Card>暂无数据</Card>;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">今日入库金额</p>
          <p className="mt-2 text-2xl font-bold">{formatCurrency(data.today.totalAmount)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">今日发票数</p>
          <p className="mt-2 text-2xl font-bold">{data.today.invoiceCount}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">待处理发票</p>
          <p className="mt-2 text-2xl font-bold">{data.today.pendingInvoices}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">低库存告警</p>
          <p className="mt-2 text-2xl font-bold">{data.today.lowStockAlerts}</p>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <h2 className="mb-2 text-lg font-bold">金额趋势</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
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

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-bold">最近发票</h2>
          <div className="space-y-2">
            {data.recentInvoices.length === 0 ? (
              <p className="text-sm text-slate-500">暂无发票记录</p>
            ) : (
              data.recentInvoices.map((invoice) => (
                <div key={invoice.id} className="rounded-lg border border-slate-200 bg-white p-3">
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
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold">低库存清单</h2>
          <div className="space-y-2">
            {data.lowStockProducts.length === 0 ? (
              <p className="text-sm text-slate-500">库存状态良好</p>
            ) : (
              data.lowStockProducts.map((item) => (
                <div key={item.productId} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.nameZh || item.nameEn}</p>
                    <Badge tone="warning">
                      {item.quantity} / {item.safeStock} {item.unit}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
