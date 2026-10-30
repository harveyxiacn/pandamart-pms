import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ScanLine,
  UploadCloud,
} from "lucide-react";
import { getCategoryFlat } from "../api/categories";
import { uploadInvoice, confirmInvoice, rejectInvoice } from "../api/invoices";
import { getAllSuppliers } from "../api/suppliers";
import type { Category, Supplier } from "../types";
import { Card, CardHeader } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { DatePicker } from "../components/ui/DatePicker";
import { Table, Td, Th } from "../components/ui/Table";
import { formatCurrency } from "../utils/formatters";
import { cn } from "../utils/classnames";

type UploadStage = "idle" | "uploading" | "analyzing" | "finalizing" | "done" | "error";

const OCR_METHOD_LABELS: Record<string, string> = {
  text_extract: "PDF 文本解析",
  local_ocr: "本地 OCR（无需 AI）",
  ai_vision: "AI 视觉识别",
  excel_parse: "Excel 解析",
  manual: "手动录入",
};

function ocrMethodLabel(method: string): string {
  return OCR_METHOD_LABELS[method] || method;
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

type RecognizedItem = {
  productNameEn: string | null;
  productNameZh: string | null;
  productCode: string | null;
  productNumber: string | null;
  un: string | null;
  taxCode: "E" | "H" | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  matchedProduct?: { id: number; nameEn: string; nameZh: string | null; confidence: number } | null;
};

const steps = [
  { title: "上传文件", description: "PDF、图片或 Excel，单文件建议不超过 20MB。" },
  { title: "校对结果", description: "核对供应商、日期、金额与商品明细。" },
  { title: "确认入库", description: "写入库存与应付；未匹配的商品会新建档案。" },
];

export default function InvoiceScanPage() {
  const [file, setFile] = useState<File | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLogs, setUploadLogs] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [recognized, setRecognized] = useState<{
    supplierName: string | null;
    supplierCode: string | null;
    supplierAddress: string | null;
    supplierContact: string | null;
    invoiceNumber: string;
    invoiceDate: string;
    customerCode: string | null;
    items: RecognizedItem[];
    salesTotal: number | null;
    taxTotal: number | null;
    total: number;
    subtotal: number | null;
    hasTax: boolean;
    taxAmount: number | null;
    grandTotal: number;
  } | null>(null);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    // 跨页拉取全部供应商（服务端 pageSize 上限 100），避免发票供应商下拉漏项
    getAllSuppliers()
      .then((items) => setSuppliers(items))
      .catch(() => setSuppliers([]));
    getCategoryFlat()
      .then((res) => setCategories(res))
      .catch(() => setCategories([]));
  }, []);

  const canSubmit = useMemo(
    () => Boolean(invoiceId && recognized && supplierId && recognized.items.length > 0),
    [invoiceId, recognized, supplierId]
  );

  const uploadStageText = useMemo(() => {
    switch (uploadStage) {
      case "uploading":
        return "正在上传文件";
      case "analyzing":
        return "正在识别发票内容";
      case "finalizing":
        return "正在整理识别结果";
      case "done":
        return "识别已完成";
      case "error":
        return "处理失败";
      default:
        return "等待上传";
    }
  }, [uploadStage]);

  const uploadStageDesc = useMemo(() => {
    switch (uploadStage) {
      case "uploading":
        return "正在将文件传输到服务器，请稍候。";
      case "analyzing":
        return "服务器正在调用 OCR 与 AI 解析，这一阶段耗时会更长。";
      case "finalizing":
        return "正在写入发票与明细数据，并准备校对结果。";
      case "done":
        return "可继续人工校对并确认入库。";
      case "error":
        return "处理遇到错误，请查看下方错误信息后重试。";
      default:
        return "支持 PDF / PNG / JPG / Excel，建议单文件不超过 20MB。";
    }
  }, [uploadStage]);

  useEffect(() => {
    if (!loading) return;
    if (uploadStage !== "analyzing" && uploadStage !== "finalizing") return;

    const timer = window.setInterval(() => {
      setUploadProgress((prev) => {
        const ceiling = uploadStage === "analyzing" ? 90 : 97;
        if (prev >= ceiling) return prev;
        const next = prev + (uploadStage === "analyzing" ? 2 : 1);
        return Math.min(ceiling, next);
      });
    }, 450);

    return () => window.clearInterval(timer);
  }, [loading, uploadStage]);

  const appendUploadLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setUploadLogs((prev) => [...prev, `[${timestamp}] ${message}`].slice(-6));
  };

  const acceptFile = (next: File | null) => {
    setFile(next);
    setUploadStage("idle");
    setUploadProgress(0);
    setUploadLogs([]);
    setError(null);
    setSuccess(null);
  };

  const handleUpload = async () => {
    if (!file) return;

    let enteredAnalyzing = false;
    setLoading(true);
    setError(null);
    setSuccess(null);
    setInvoiceId(null);
    setRecognized(null);
    setSupplierId(null);
    setUploadLogs([]);
    setUploadStage("uploading");
    setUploadProgress(3);
    appendUploadLog(`已选择文件：${file.name}（${formatFileSize(file.size)}）`);
    appendUploadLog("开始上传文件");

    try {
      const result = await uploadInvoice(file, {
        timeoutMs: 300000,
        onUploadProgress: (progressPercent) => {
          const mapped = Math.min(65, Math.max(5, Math.round(progressPercent * 0.65)));
          setUploadProgress((prev) => Math.max(prev, mapped));
          if (progressPercent >= 100 && !enteredAnalyzing) {
            enteredAnalyzing = true;
            setUploadStage("analyzing");
            setUploadProgress((prev) => Math.max(prev, 70));
            appendUploadLog("文件上传完成，开始 OCR 识别");
          }
        },
      });
      if (!enteredAnalyzing) {
        setUploadStage("analyzing");
        setUploadProgress((prev) => Math.max(prev, 70));
        appendUploadLog("开始 OCR 识别");
      }
      setUploadStage("finalizing");
      setUploadProgress((prev) => Math.max(prev, 95));
      appendUploadLog("识别完成，正在写入系统");

      setInvoiceId(result.invoiceId);
      setRecognized({
        ...result.recognized,
        supplierAddress: result.recognized.supplierAddress || null,
        supplierContact: result.recognized.supplierContact || null,
        salesTotal: result.recognized.salesTotal ?? result.recognized.subtotal ?? null,
        taxTotal: result.recognized.taxTotal ?? result.recognized.taxAmount ?? null,
        total: result.recognized.total ?? result.recognized.grandTotal ?? 0,
        items: result.recognized.items.map((item) => ({
          ...item,
          productCode: item.productCode || null,
          productNumber: item.productNumber || null,
          un: item.un || null,
          taxCode: item.taxCode || null,
        })),
      });
      const matched = suppliers.find((s) =>
        result.recognized.supplierName
          ? s.name.toLowerCase().includes(result.recognized.supplierName.toLowerCase())
          : false
      );
      setSupplierId(matched?.id ?? null);
      setUploadStage("done");
      setUploadProgress(100);
      const methodLabel = ocrMethodLabel(result.ocrMethod);
      const confidenceText =
        typeof result.ocrConfidence === "number"
          ? `，置信度 ${Math.round(result.ocrConfidence * 100)}%`
          : "";
      appendUploadLog(`识别完成：${methodLabel}${confidenceText}，共 ${result.recognized.items.length} 条明细`);
      for (const warning of result.ocrWarnings || []) {
        appendUploadLog(`提示：${warning}`);
      }
      setSuccess(`发票上传成功，识别方式：${methodLabel}${confidenceText}`);
    } catch (err: unknown) {
      setUploadStage("error");
      const rawMessage = err instanceof Error ? err.message : "上传失败";
      const friendlyMessage =
        /timeout|超时|ECONNABORTED/i.test(rawMessage)
          ? "发票识别超时，请稍后重试；建议优先上传清晰且尺寸较小的图片。"
          : rawMessage;
      appendUploadLog(`处理失败：${friendlyMessage}`);
      setError(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!recognized || !invoiceId || !supplierId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        supplierId,
        invoiceNumber: recognized.invoiceNumber,
        invoiceDate: recognized.invoiceDate,
        customerCode: recognized.customerCode,
        items: recognized.items.map((item) => ({
          productId: item.matchedProduct?.id ?? null,
          productNameEn: item.productNameEn || "",
          productNameZh: item.productNameZh || null,
          productCode: item.productCode || null,
          productNumber: item.productNumber || null,
          un: item.un || null,
          taxCode: item.taxCode || null,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          isNewProduct: !item.matchedProduct,
          categoryId: !item.matchedProduct ? defaultCategoryId : undefined,
        })),
        subtotal: recognized.subtotal,
        hasTax: recognized.hasTax,
        taxAmount: recognized.taxAmount,
        grandTotal: recognized.grandTotal,
        notes,
      };
      const result = await confirmInvoice(invoiceId, payload);
      setSuccess(
        `入库完成：更新库存 ${result.inventoryUpdated} 项，创建新产品 ${result.newProductsCreated} 项。可继续上传下一张发票。`
      );
      // 确认成功后清空已识别发票状态，避免对已处理发票重复点击「确认入库」（canSubmit 依赖这些值，会同时禁用确认与驳回按钮）（FE-N2）
      setInvoiceId(null);
      setRecognized(null);
      setSupplierId(null);
      setFile(null);
      setUploadStage("idle");
      setUploadProgress(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "确认入库失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!invoiceId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await rejectInvoice(invoiceId, notes || "人工驳回");
      setSuccess("已驳回该发票");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "驳回失败");
    } finally {
      setSubmitting(false);
    }
  };

  const newProductCount = recognized?.items.filter((item) => !item.matchedProduct).length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="发票识别与入库"
        description="上传采购发票，系统自动识别供应商、金额与商品明细；校对无误后确认入库。"
        meta={
          recognized
            ? `识别到 ${recognized.items.length} 条明细 · ${newProductCount} 个新产品待创建`
            : "支持 PDF / 图片 / Excel"
        }
      />

      {success ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-success/20 bg-success-soft px-4 py-2.5 text-sm text-success"
        >
          <CheckCircle2 size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="flex-1">{success}</span>
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-sm text-danger"
        >
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card>
          <CardHeader
            title="上传发票"
            description="选择或拖入文件，上传后自动开始 OCR 识别。"
            action={
              loading ? (
                <Badge tone="info">处理中</Badge>
              ) : uploadStage === "done" ? (
                <Badge tone="success">已识别</Badge>
              ) : uploadStage === "error" ? (
                <Badge tone="danger">失败</Badge>
              ) : null
            }
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
            <label
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) acceptFile(dropped);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                dragActive
                  ? "border-accent bg-accent-soft/50"
                  : loading
                    ? "border-warning/60 bg-warning-soft/40"
                    : "border-line-strong bg-surface-muted hover:border-accent hover:bg-accent-soft/30"
              )}
            >
              <input
                className="sr-only"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
                onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
              />
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-accent ring-1 ring-line">
                <UploadCloud size={19} aria-hidden="true" />
              </span>
              <span className="text-body font-medium text-ink">
                {file ? file.name : "点击选择或拖入发票文件"}
              </span>
              <span className="text-meta text-ink-subtle">
                {file ? formatFileSize(file.size) : "PDF / PNG / JPG / Excel · 建议不超过 20MB"}
              </span>
            </label>

            <Button
              onClick={() => void handleUpload()}
              disabled={!file || loading}
              loading={loading}
              leadingIcon={ScanLine}
              className="sm:h-full sm:min-h-[7.5rem] sm:w-32"
            >
              {loading ? "分析中…" : "上传并分析"}
            </Button>
          </div>

          {uploadStage !== "idle" ? (
            <div className="mt-4 rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-center justify-between text-meta">
                <span className="font-medium text-ink-muted">{uploadStageText}</span>
                <span className="tabular text-ink-subtle">{uploadProgress}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="发票处理进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-inset"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    uploadStage === "error" ? "bg-danger" : uploadStage === "done" ? "bg-success" : "bg-accent",
                    loading && "animate-pulse"
                  )}
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="mt-2 text-meta text-ink-subtle">{uploadStageDesc}</p>
              {uploadLogs.length > 0 ? (
                <div className="mt-3 rounded-lg border border-line bg-surface-muted p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">处理记录</p>
                  <ul className="mt-1 space-y-0.5 font-mono text-[11px] leading-5 text-ink-muted">
                    {uploadLogs.map((log, index) => (
                      <li key={`${log}-${index}`}>{log}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="处理流程" description="每一步都可以回退修改。" />
          <ol className="mt-4 space-y-4">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-inset text-meta font-semibold text-ink-muted">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">{step.title}</p>
                  <p className="mt-0.5 text-meta leading-5 text-ink-subtle">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-meta leading-5 text-ink-muted">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <FileText size={13} aria-hidden="true" />
              识别不准确时
            </p>
            <p className="mt-1">优先上传清晰、摆正的整张发票；Excel 请确认表头与金额列完整。</p>
          </div>
        </Card>
      </div>

      {recognized ? (
        <Card padded={false} className="p-4 sm:p-5">
          <CardHeader
            title="识别结果校对"
            description="核对供应商、日期和明细后再确认入库；未匹配的商品会按新产品创建。"
            action={
              <Badge tone="warning">
                <ClipboardCheck size={12} aria-hidden="true" />
                待确认
              </Badge>
            }
            className="mb-4"
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="发票编号" htmlFor="scan-invoice-number">
              <Input
                id="scan-invoice-number"
                value={recognized.invoiceNumber}
                onChange={(e) => setRecognized({ ...recognized, invoiceNumber: e.target.value })}
              />
            </Field>
            <Field label="发票日期" htmlFor="scan-invoice-date">
              <DatePicker
                id="scan-invoice-date"
                value={recognized.invoiceDate || null}
                onChange={(value) => setRecognized({ ...recognized, invoiceDate: value ?? "" })}
                label="发票日期"
                clearable
              />
            </Field>
            <Field label="供应商" htmlFor="scan-supplier" required error={supplierId ? undefined : "请选择供应商后才能确认入库"}>
              <Select
                id="scan-supplier"
                value={supplierId ?? ""}
                onChange={(e) => setSupplierId(Number(e.target.value) || null)}
                aria-invalid={!supplierId}
              >
                <option value="">请选择供应商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="客户编号" htmlFor="scan-customer-code">
              <Input
                id="scan-customer-code"
                value={recognized.customerCode || ""}
                onChange={(e) => setRecognized({ ...recognized, customerCode: e.target.value || null })}
              />
            </Field>
            <Field label="新产品默认分类" htmlFor="scan-category" hint="仅应用于未匹配的商品。">
              <Select
                id="scan-category"
                value={defaultCategoryId ?? ""}
                onChange={(e) => setDefaultCategoryId(Number(e.target.value) || null)}
              >
                <option value="">不设置</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="备注" htmlFor="scan-notes">
              <Input
                id="scan-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="可选，例如快递单号或收货说明"
              />
            </Field>
            <Field label="供应商地址" htmlFor="scan-supplier-address" className="sm:col-span-2">
              <Input
                id="scan-supplier-address"
                value={recognized.supplierAddress || ""}
                onChange={(e) => setRecognized({ ...recognized, supplierAddress: e.target.value || null })}
              />
            </Field>
            <Field label="供应商联系方式" htmlFor="scan-supplier-contact">
              <Input
                id="scan-supplier-contact"
                value={recognized.supplierContact || ""}
                onChange={(e) => setRecognized({ ...recognized, supplierContact: e.target.value || null })}
              />
            </Field>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-body-lg font-semibold text-ink">商品明细</h3>
              <span className="text-meta text-ink-subtle">
                共 {recognized.items.length} 条 · 新产品 {newProductCount} 条
              </span>
            </div>
            <Table maxHeight="28rem">
              <thead>
                <tr>
                  <Th>产品</Th>
                  <Th>编码</Th>
                  <Th>编号</Th>
                  <Th>UN</Th>
                  <Th>Tax</Th>
                  <Th numeric>数量</Th>
                  <Th>单位</Th>
                  <Th numeric>单价</Th>
                  <Th numeric>小计</Th>
                  <Th>匹配</Th>
                </tr>
              </thead>
              <tbody>
                {recognized.items.map((item, index) => (
                  <tr key={index}>
                    <Td>
                      <p className="cell-strong">{(item.productNameZh || item.productNameEn || "未命名").trim()}</p>
                      {item.productNameZh && item.productNameEn ? (
                        <p className="truncate text-meta text-ink-subtle">{item.productNameEn}</p>
                      ) : null}
                    </Td>
                    <Td className="font-mono text-meta">{item.productCode || "—"}</Td>
                    <Td className="font-mono text-meta">{item.productNumber || "—"}</Td>
                    <Td className="text-meta">{item.un || "—"}</Td>
                    <Td className="text-meta">{item.taxCode || (recognized.hasTax ? "H" : "E")}</Td>
                    <Td numeric>{item.quantity}</Td>
                    <Td className="text-meta text-ink-muted">{item.unit}</Td>
                    <Td numeric>{formatCurrency(item.unitPrice)}</Td>
                    <Td numeric className="font-semibold">{formatCurrency(item.lineTotal)}</Td>
                    <Td>
                      {item.matchedProduct ? (
                        <Badge tone={item.matchedProduct.confidence >= 0.8 ? "success" : "warning"}>
                          {item.matchedProduct.confidence >= 0.8 ? "已匹配" : "待复核"} ·{" "}
                          {Math.round(item.matchedProduct.confidence * 100)}%
                        </Badge>
                      ) : (
                        <Badge tone="info">新产品</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-line bg-surface-muted p-3.5 sm:grid-cols-3">
            <Field label="Sales Total" htmlFor="scan-sales-total">
              <Input
                id="scan-sales-total"
                type="number"
                step="0.01"
                value={recognized.salesTotal ?? recognized.subtotal ?? 0}
                onChange={(e) =>
                  setRecognized({
                    ...recognized,
                    salesTotal: Number(e.target.value),
                    subtotal: Number(e.target.value),
                  })
                }
                className="tabular"
              />
            </Field>
            <Field label="Tax Total" htmlFor="scan-tax-total">
              <Input
                id="scan-tax-total"
                type="number"
                step="0.01"
                value={recognized.taxTotal ?? recognized.taxAmount ?? 0}
                onChange={(e) =>
                  setRecognized({
                    ...recognized,
                    taxTotal: Number(e.target.value),
                    taxAmount: Number(e.target.value),
                    hasTax: Number(e.target.value) > 0,
                  })
                }
                className="tabular"
              />
            </Field>
            <Field label="Total" htmlFor="scan-grand-total">
              <Input
                id="scan-grand-total"
                type="number"
                step="0.01"
                value={recognized.total || recognized.grandTotal}
                onChange={(e) =>
                  setRecognized({
                    ...recognized,
                    total: Number(e.target.value),
                    grandTotal: Number(e.target.value),
                  })
                }
                className="tabular font-semibold"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-meta text-ink-subtle">
              {canSubmit
                ? `确认后将为 ${recognized.items.length} 条明细入库${newProductCount ? `，并新建 ${newProductCount} 个商品` : ""}。`
                : "请选择供应商后确认入库。"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger-ghost" onClick={() => void handleReject()} disabled={!invoiceId || submitting}>
                驳回发票
              </Button>
              <Button
                onClick={() => void handleConfirm()}
                disabled={!canSubmit || submitting}
                loading={submitting}
                leadingIcon={CheckCircle2}
              >
                确认入库
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
