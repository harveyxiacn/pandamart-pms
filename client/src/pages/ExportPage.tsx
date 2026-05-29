import { useEffect, useState } from "react";
import {
  exportFullBackup,
  exportInventory,
  exportInvoices,
  exportPurchases,
  exportSuppliers,
} from "../api/export";
import { getSuppliers } from "../api/suppliers";
import type { Supplier } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";

export default function ExportPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSuppliers({ pageSize: 200 })
      .then((result) => setSuppliers(result.items))
      .catch(() => setSuppliers([]));
  }, []);

  const runExport = async (handler: () => Promise<void>, successMessage: string) => {
    setLoading(true);
    setMessage(null);
    try {
      await handler();
      setMessage(successMessage);
    } catch (err: unknown) {
      setMessage(`导出失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg font-bold">数据导出中心</h2>
        <p className="text-sm text-slate-600">支持导出发票、库存、供应商、采购明细和全量备份。</p>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="text-sm">
            开始日期
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            结束日期
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="text-sm">
            发票状态
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="confirmed">已确认</option>
              <option value="rejected">已驳回</option>
            </Select>
          </label>
          <label className="text-sm">
            供应商
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">全部</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-bold">标准导出</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button
            disabled={loading}
            onClick={() =>
              void runExport(
                () => exportInvoices({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, status: (status as "pending" | "confirmed" | "rejected") || undefined }),
                "发票导出已开始。"
              )
            }
          >
            导出发票
          </Button>
          <Button disabled={loading} onClick={() => void runExport(() => exportInventory(), "库存导出已开始。")}>
            导出库存
          </Button>
          <Button disabled={loading} onClick={() => void runExport(() => exportSuppliers(), "供应商导出已开始。")}>
            导出供应商
          </Button>
          <Button
            disabled={loading || !dateFrom || !dateTo}
            onClick={() =>
              void runExport(
                () => exportPurchases({ dateFrom, dateTo, supplierId: supplierId ? Number(supplierId) : undefined }),
                "采购明细导出已开始。"
              )
            }
          >
            导出采购明细
          </Button>
          <Button
            variant="secondary"
            disabled={loading}
            onClick={() => void runExport(() => exportFullBackup(), "全量备份导出已开始。")}
          >
            导出全量备份
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </Card>
    </div>
  );
}
