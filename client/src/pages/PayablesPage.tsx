import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import {
  getPayables,
  getSupplierPayable,
  recordPayment,
  type PayableRow,
  type SupplierPayableDetail,
} from "../api/payables";
import { Card } from "../components/ui/Card";
import { Table } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../utils/formatters";

export default function PayablesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<SupplierPayableDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getPayables();
      setRows(res.items);
      setTotalOutstanding(res.totalOutstanding);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "应付账款加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function openDetail(supplierId: number) {
    try {
      const d = await getSupplierPayable(supplierId);
      setDetail(d);
      setPayAmount(d.outstanding > 0 ? String(d.outstanding) : "");
      setPayMethod("");
      setDetailOpen(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "加载明细失败");
    }
  }

  async function submitPayment() {
    if (!detail) return;
    if (!(Number(payAmount) > 0)) {
      toast.error("付款金额无效");
      return;
    }
    setSaving(true);
    try {
      await recordPayment({
        supplierId: detail.supplier.id,
        amount: Number(payAmount),
        method: payMethod || undefined,
      });
      toast.success("付款已记录");
      setDetailOpen(false);
      void load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "记录付款失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-slate-500">应付总额（未结清）</p>
          <p className="text-2xl font-bold text-rose-700">{formatCurrency(totalOutstanding)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">涉及供应商</p>
          <p className="text-2xl font-bold text-pine">{rows.filter((r) => r.outstanding > 0.001).length}</p>
        </Card>
      </section>

      <Card>
        <h2 className="mb-3 text-lg font-bold">供应商应付账款</h2>
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : error ? (
          <div className="space-y-2 text-sm">
            <p className="text-rose-600">{error}</p>
            <Button variant="ghost" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Wallet} title="暂无应付账款" description="确认采购发票后会在此累计应付。前往「发票列表」确认待处理的发票即可开始记录。" />
        ) : (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">供应商</th>
                <th className="px-3 py-2">已开票</th>
                <th className="px-3 py-2">已付</th>
                <th className="px-3 py-2">未结清</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplierId} className="border-t border-slate-100 text-sm">
                  <td className="px-3 py-2 font-medium">{r.supplierName}</td>
                  <td className="px-3 py-2">{formatCurrency(r.billed)}</td>
                  <td className="px-3 py-2">{formatCurrency(r.paid)}</td>
                  <td className="px-3 py-2">
                    {r.outstanding > 0.001 ? (
                      <Badge tone="danger">{formatCurrency(r.outstanding)}</Badge>
                    ) : (
                      <Badge tone="success">已结清</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" onClick={() => void openDetail(r.supplierId)}>
                      明细/付款
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={detailOpen}
        title={detail ? `应付明细 - ${detail.supplier.name}` : "应付明细"}
        onClose={() => setDetailOpen(false)}
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs text-slate-500">已开票</p>
                <p className="font-bold">{formatCurrency(detail.billed)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs text-slate-500">已付</p>
                <p className="font-bold text-emerald-700">{formatCurrency(detail.paid)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <p className="text-xs text-slate-500">未结清</p>
                <p className="font-bold text-rose-700">{formatCurrency(detail.outstanding)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
              <label className="text-sm">
                付款金额
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-32"
                />
              </label>
              <label className="text-sm">
                方式
                <Input
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  placeholder="现金/转账(可选)"
                  className="w-36"
                />
              </label>
              <Button onClick={() => void submitPayment()} disabled={saving}>
                {saving ? "记录中…" : "记录付款"}
              </Button>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold">付款记录</h4>
              {detail.payments.length === 0 ? (
                <p className="text-sm text-slate-500">暂无付款记录</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {detail.payments.map((p) => (
                    <div key={p.id} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                      <span>
                        {formatDate(p.paidAt)} {p.method ? `· ${p.method}` : ""}
                      </span>
                      <span className="font-semibold text-emerald-700">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-bold">已确认发票（近100张）</h4>
              <div className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {detail.invoices.map((inv) => (
                  <div key={inv.id} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                    <span>
                      {inv.invoiceNumber} · {formatDate(inv.invoiceDate)}
                    </span>
                    <span>{formatCurrency(inv.grandTotal)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
