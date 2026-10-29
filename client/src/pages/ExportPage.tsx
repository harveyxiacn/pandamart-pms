import { useEffect, useState } from "react";
import {
  Boxes,
  Building2,
  Database,
  Download,
  FileText,
  Lightbulb,
  ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  exportFullBackup,
  exportInventory,
  exportInvoices,
  exportPurchases,
  exportReorderSuggestions,
  exportSuppliers,
} from "../api/export";
import { getAllSuppliers } from "../api/suppliers";
import type { Supplier } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Field } from "../components/ui/Field";
import { DateRangePicker } from "../components/ui/DatePicker";
import { useToast } from "../components/ui/Toast";
import type { DateRange } from "../utils/date";

interface ExportAction {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  run: () => Promise<void>;
  disabled?: boolean;
  disabledHint?: string;
}

export default function ExportPage() {
  const toast = useToast();
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [status, setStatus] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    getAllSuppliers()
      .then((items) => setSuppliers(items))
      .catch(() => setSuppliers([]));
  }, []);

  const run = async (key: string, handler: () => Promise<void>, success: string) => {
    setRunning(key);
    try {
      await handler();
      toast.success(success);
    } catch (err: unknown) {
      toast.error(`导出失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setRunning(null);
    }
  };

  const hasRange = Boolean(dateRange.start && dateRange.end);

  const actions: ExportAction[] = [
    {
      key: "invoices",
      title: "发票明细",
      description: "按开票日期与状态导出采购发票抬头与金额。",
      icon: FileText,
      run: () =>
        exportInvoices({
          dateFrom: dateRange.start || undefined,
          dateTo: dateRange.end || undefined,
          status: (status as "pending" | "confirmed" | "rejected") || undefined,
        }),
    },
    {
      key: "inventory",
      title: "库存快照",
      description: "当前所有商品的数量、安全库存与单位。",
      icon: Boxes,
      run: () => exportInventory(),
    },
    {
      key: "suppliers",
      title: "供应商名录",
      description: "供应商联系方式与编号，便于线下对账。",
      icon: Building2,
      run: () => exportSuppliers(),
    },
    {
      key: "purchases",
      title: "采购明细",
      description: "按日期范围与供应商导出逐行采购记录。",
      icon: ShoppingCart,
      run: () =>
        exportPurchases({
          dateFrom: dateRange.start ?? "",
          dateTo: dateRange.end ?? "",
          supplierId: supplierId ? Number(supplierId) : undefined,
        }),
      disabled: !hasRange,
      disabledHint: "先在筛选区选择完整的日期范围",
    },
    {
      key: "reorder",
      title: "补货建议",
      description: "基于销量与安全库存计算的订货清单。",
      icon: Lightbulb,
      run: () => exportReorderSuggestions(),
    },
    {
      key: "backup",
      title: "全量备份",
      description: "导出全部业务表，用于归档或迁移。",
      icon: Database,
      run: () => exportFullBackup(),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="数据导出"
        description="把发票、库存与采购数据导出为 Excel，便于对账与归档。"
        actions={
          <Button
            variant="secondary"
            leadingIcon={Download}
            loading={running === "backup"}
            onClick={() => void run("backup", () => exportFullBackup(), "全量备份导出已开始。")}
          >
            全量备份
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="日期范围" htmlFor="export-range">
            <DateRangePicker
              id="export-range"
              value={dateRange}
              onChange={setDateRange}
              label="导出日期范围"
              className="w-full"
            />
          </Field>
          <Field label="发票状态" htmlFor="export-status" hint="仅影响发票明细">
            <Select id="export-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="pending">待处理</option>
              <option value="confirmed">已确认</option>
              <option value="rejected">已驳回</option>
            </Select>
          </Field>
          <Field label="供应商" htmlFor="export-supplier" hint="仅影响采购明细">
            <Select id="export-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">全部供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const loading = running === action.key;
          return (
            <Card key={action.key} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-body-lg font-semibold text-ink">{action.title}</h2>
                  <p className="mt-0.5 text-meta text-ink-subtle">{action.description}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                <span className="text-meta text-ink-subtle">
                  {action.disabled ? action.disabledHint : "导出为 .xlsx"}
                </span>
                <Button
                  variant={action.key === "backup" ? "secondary" : "primary"}
                  size="sm"
                  loading={loading}
                  disabled={action.disabled || (running !== null && !loading)}
                  onClick={() => void run(action.key, action.run, `${action.title}导出已开始。`)}
                >
                  导出
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
