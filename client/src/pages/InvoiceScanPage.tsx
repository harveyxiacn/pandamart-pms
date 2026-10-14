import { useEffect, useMemo, useState } from "react";
import { UploadCloud } from "lucide-react";
import { getCategoryFlat } from "../api/categories";
import { uploadInvoice, confirmInvoice, rejectInvoice } from "../api/invoices";
import { getAllSuppliers } from "../api/suppliers";
import type { Category, Supplier } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { formatCurrency } from "../utils/formatters";
import { cn } from "../utils/classnames";

type UploadStage = "idle" | "uploading" | "analyzing" | "finalizing" | "done" | "error";

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
      appendUploadLog(`识别完成：${result.ocrMethod}，共 ${result.recognized.items.length} 条明细`);
      setSuccess(`发票上传成功，识别方式：${result.ocrMethod}`);
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

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-bold">发票识别与入库</h2>
        <p className="mt-1 text-sm text-slate-600">支持 PDF / 图片 / Excel，上传后可人工校对再确认入库。</p>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label
            className={cn(
              "block cursor-pointer rounded-xl border-2 border-dashed p-4 transition",
              loading ? "border-amber bg-amber/10" : "border-rose-200 bg-rose-50/60 hover:border-coral hover:bg-rose-50"
            )}
          >
            <input
              className="hidden"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setUploadStage("idle");
                setUploadProgress(0);
                setUploadLogs([]);
              }}
            />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">选择发票文件</p>
              <p className="text-xs text-slate-600">点击此区域选择文件，支持 PDF / PNG / JPG / Excel。</p>
              {file ? (
                <p className="text-xs text-emerald-700">
                  已选择: {file.name} ({formatFileSize(file.size)})
                </p>
              ) : (
                <p className="text-xs text-slate-500">未选择文件</p>
              )}
            </div>
          </label>

          <Button onClick={handleUpload} disabled={!file || loading} className="h-full min-h-[78px] w-full lg:min-h-0">
            <UploadCloud size={16} className="mr-1" />
            {loading ? "上传并分析中..." : "上传并分析"}
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-rose-100 bg-white p-3">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>{uploadStageText}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-rose-100">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-coral via-amber to-pine transition-all duration-500",
                loading ? "animate-pulse" : ""
              )}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-600">{uploadStageDesc}</p>
          {uploadLogs.length > 0 ? (
            <div className="mt-2 rounded-lg bg-slate-50 p-2">
              <p className="text-xs font-semibold text-slate-700">变动信息</p>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {uploadLogs.map((log, index) => (
                  <li key={`${log}-${index}`}>{log}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>

      {error ? <Card className="text-rose-700">错误: {error}</Card> : null}
      {success ? <Card className="text-emerald-700">{success}</Card> : null}

      {recognized ? (
        <Card>
          <h3 className="text-lg font-bold">识别结果校对</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              发票编号
              <Input
                value={recognized.invoiceNumber}
                onChange={(e) => setRecognized({ ...recognized, invoiceNumber: e.target.value })}
              />
            </label>
            <label className="text-sm">
              发票日期
              <Input
                type="date"
                value={recognized.invoiceDate}
                onChange={(e) => setRecognized({ ...recognized, invoiceDate: e.target.value })}
              />
            </label>
            <label className="text-sm">
              供应商
              <Select value={supplierId ?? ""} onChange={(e) => setSupplierId(Number(e.target.value) || null)}>
                <option value="">请选择供应商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm md:col-span-2">
              客户编号
              <Input
                value={recognized.customerCode || ""}
                onChange={(e) => setRecognized({ ...recognized, customerCode: e.target.value || null })}
              />
            </label>
            <label className="text-sm md:col-span-3">
              供应商地址
              <Input
                value={recognized.supplierAddress || ""}
                onChange={(e) => setRecognized({ ...recognized, supplierAddress: e.target.value || null })}
              />
            </label>
            <label className="text-sm md:col-span-3">
              供应商联系方式
              <Input
                value={recognized.supplierContact || ""}
                onChange={(e) => setRecognized({ ...recognized, supplierContact: e.target.value || null })}
              />
            </label>
            <label className="text-sm">
              新产品默认分类
              <Select
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
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2">产品</th>
                  <th>编码</th>
                  <th>编号</th>
                  <th>UN</th>
                  <th>Tax</th>
                  <th>数量</th>
                  <th>单位</th>
                  <th>单价</th>
                  <th>小计</th>
                  <th>匹配</th>
                </tr>
              </thead>
              <tbody>
                {recognized.items.map((item, index) => (
                  <tr key={index} className="border-b border-slate-100">
                    <td className="py-2">
                      {(item.productNameZh || item.productNameEn || "未命名").trim()}
                    </td>
                    <td>{item.productCode || "-"}</td>
                    <td>{item.productNumber || "-"}</td>
                    <td>{item.un || "-"}</td>
                    <td>{item.taxCode || (recognized.hasTax ? "H" : "E")}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                    <td>{formatCurrency(item.lineTotal)}</td>
                    <td>
                      {item.matchedProduct
                        ? `${item.matchedProduct.nameZh || item.matchedProduct.nameEn} (${Math.round(
                            item.matchedProduct.confidence * 100
                          )}%)`
                        : "新产品"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              Sales Total
              <Input
                type="number"
                value={recognized.salesTotal ?? recognized.subtotal ?? 0}
                onChange={(e) =>
                  setRecognized({
                    ...recognized,
                    salesTotal: Number(e.target.value),
                    subtotal: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="text-sm">
              Tax Total
              <Input
                type="number"
                value={recognized.taxTotal ?? recognized.taxAmount ?? 0}
                onChange={(e) =>
                  setRecognized({
                    ...recognized,
                    taxTotal: Number(e.target.value),
                    taxAmount: Number(e.target.value),
                    hasTax: Number(e.target.value) > 0,
                  })
                }
              />
            </label>
            <label className="text-sm">
              Total
              <Input
                type="number"
                value={recognized.total || recognized.grandTotal}
                onChange={(e) =>
                  setRecognized({
                    ...recognized,
                    total: Number(e.target.value),
                    grandTotal: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <label className="mt-3 block text-sm">
            备注
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleConfirm} disabled={!canSubmit || submitting}>
              {submitting ? "处理中..." : "确认入库"}
            </Button>
            <Button variant="danger" onClick={handleReject} disabled={!invoiceId || submitting}>
              驳回发票
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
