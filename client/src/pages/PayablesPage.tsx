import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Receipt, Wallet } from "lucide-react";
import {
  getPayables,
  getSupplierPayable,
  recordPayment,
  type PayableRow,
  type SupplierPayableDetail,
} from "../api/payables";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Table, Td, Th } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../utils/formatters";
import { cn } from "../utils/classnames";

export default function PayablesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [totalBilled, setTotalBilled] = useState(0);
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
      setTotalBilled(res.items.reduce((sum, row) => sum + row.billed, 0));
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

  const suppliersWithBalance = rows.filter((r) => r.outstanding > 0.001).length;
  const settledRate = totalBilled > 0 ? Math.round(((totalBilled - totalOutstanding) / totalBilled) * 100) : 100;

  return (
    <div className="space-y-5">
      <PageHeader
        title="应付账款"
        description="按供应商汇总已开票、已付款与未结清金额，并登记付款。"
        meta="数据来自已确认发票与付款记录"
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="未结清总额"
          value={formatCurrency(totalOutstanding)}
          icon={Wallet}
          tone={totalOutstanding > 0 ? "danger" : "success"}
          hint={`${suppliersWithBalance} 家供应商有待付金额`}
        />
        <StatCard label="累计已开票" value={formatCurrency(totalBilled)} icon={Receipt} tone="neutral" hint="全部供应商" />
        <StatCard
          label="结清比例"
          value={`${settledRate}%`}
          icon={CheckCircle2}
          tone={settledRate >= 80 ? "success" : "warning"}
          hint="已付金额占已开票金额"
        />
      </section>

      <Card padded={false} className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-title font-semibold tracking-tight text-ink">供应商账款</h2>
          <span className="text-meta text-ink-subtle">
            {rows.length} 家供应商
          </span>
        </div>
        {loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : error ? (
          <EmptyState
            icon={Wallet}
            title="加载失败"
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="暂无应付账款"
            description="确认采购发票后会在此累计应付，并可按供应商登记付款。"
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>供应商</Th>
                <Th numeric>已开票</Th>
                <Th numeric>已付</Th>
                <Th numeric>未结清</Th>
                <Th>状态</Th>
                <Th className="cell-actions">操作</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplierId}>
                  <Td>
                    <button
                      type="button"
                      onClick={() => void openDetail(r.supplierId)}
                      className="cell-strong text-left underline-offset-4 hover:text-accent hover:underline"
                    >
                      {r.supplierName}
                    </button>
                  </Td>
                  <Td numeric>{formatCurrency(r.billed)}</Td>
                  <Td numeric className="text-success">{formatCurrency(r.paid)}</Td>
                  <Td numeric>
                    <span className={cn("font-semibold", r.outstanding > 0.001 ? "text-danger" : "text-ink-subtle")}>
                      {formatCurrency(r.outstanding)}
                    </span>
                  </Td>
                  <Td>
                    {r.outstanding > 0.001 ? (
                      <Badge tone="warning">待付款</Badge>
                    ) : (
                      <Badge tone="success">已结清</Badge>
                    )}
                  </Td>
                  <Td className="cell-actions">
                    <Button variant="secondary" size="sm" onClick={() => void openDetail(r.supplierId)}>
                      明细 / 付款
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={detailOpen}
        title={detail ? `应付明细 · ${detail.supplier.name}` : "应付明细"}
        description={detail ? `未结清 ${formatCurrency(detail.outstanding)}` : undefined}
        onClose={() => setDetailOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
            <Button
              onClick={() => void submitPayment()}
              loading={saving}
              leadingIcon={Banknote}
              disabled={!detail || Number(payAmount) <= 0}
            >
              记录付款{payAmount ? ` · ${formatCurrency(Number(payAmount))}` : ""}
            </Button>
          </>
        }
      >
        {detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "已开票", value: detail.billed, tone: "text-ink" },
                { label: "已付", value: detail.paid, tone: "text-success" },
                { label: "未结清", value: detail.outstanding, tone: "text-danger" },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line bg-surface-muted p-3">
                  <p className="text-meta text-ink-subtle">{item.label}</p>
                  <p className={cn("mt-1 text-body-lg font-semibold tabular", item.tone)}>
                    {formatCurrency(item.value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-line p-3">
              <h4 className="mb-2 text-meta font-semibold uppercase tracking-wider text-ink-subtle">登记付款</h4>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="付款金额" htmlFor="pay-amount" className="w-40">
                  <Input
                    id="pay-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </Field>
                <Field label="方式" htmlFor="pay-method" className="w-44">
                  <Input
                    id="pay-method"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    placeholder="现金 / 转账"
                  />
                </Field>
                <p className="pb-2 text-meta text-ink-subtle">提交后会在下方付款记录中登记。</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-meta font-semibold uppercase tracking-wider text-ink-subtle">
                  付款记录
                </h4>
                {detail.payments.length === 0 ? (
                  <p className="rounded-lg border border-line px-3 py-6 text-center text-meta text-ink-subtle">
                    暂无付款记录
                  </p>
                ) : (
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {detail.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-meta"
                      >
                        <span className="text-ink-muted">
                          {formatDate(p.paidAt)}
                          {p.method ? ` · ${p.method}` : ""}
                        </span>
                        <span className="font-semibold tabular text-success">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-meta font-semibold uppercase tracking-wider text-ink-subtle">
                  已确认发票（近 100 张）
                </h4>
                {detail.invoices.length === 0 ? (
                  <p className="rounded-lg border border-line px-3 py-6 text-center text-meta text-ink-subtle">
                    暂无发票
                  </p>
                ) : (
                  <div className="max-h-52 space-y-1 overflow-y-auto">
                    {detail.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-meta"
                      >
                        <span className="min-w-0 truncate text-ink-muted">
                          {inv.invoiceNumber} · {formatDate(inv.invoiceDate)}
                        </span>
                        <span className="shrink-0 tabular text-ink">{formatCurrency(inv.grandTotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
