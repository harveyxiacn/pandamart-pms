import { useEffect, useRef, useState } from "react";
import { Download, Package, Upload } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCategoryFlat } from "../api/categories";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProductPriceHistory,
  getProducts,
  importProducts,
  updateProduct,
  uploadProductImage,
} from "../api/products";
import { useSearchParams } from "react-router-dom";
import { getAllSuppliers } from "../api/suppliers";
import type { Category, Product, Supplier } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Table } from "../components/ui/Table";
import { Pagination } from "../components/ui/Pagination";
import { Modal } from "../components/ui/Modal";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatCurrency, formatDate } from "../utils/formatters";
import { exportProducts } from "../api/export";
import { usePermission } from "../hooks/usePermission";
import { useDebounce } from "../hooks/useDebounce";

type ProductForm = {
  id?: number;
  sku: string;
  barcode: string;
  nameEn: string;
  nameZh: string;
  categoryId: string;
  defaultSupplierId: string;
  defaultUnit: string;
  defaultPrice: string;
  sellingPrice: string;
  isPerishable: boolean;
  shelfLifeDays: string;
  notes: string;
  isActive: boolean;
};

const initialForm: ProductForm = {
  sku: "",
  barcode: "",
  nameEn: "",
  nameZh: "",
  categoryId: "",
  defaultSupplierId: "",
  defaultUnit: "Case",
  defaultPrice: "",
  sellingPrice: "",
  isPerishable: false,
  shelfLifeDays: "",
  notes: "",
  isActive: true,
};

// 折线图数据点：环比异常（红色放大）用于价格突变可视化
function PriceDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { isAnomaly?: boolean };
}) {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null) return <g key={index} />;
  const anomaly = payload?.isAnomaly;
  return (
    <circle
      key={index}
      cx={cx}
      cy={cy}
      r={anomaly ? 5 : 3}
      fill={anomaly ? "#e11d48" : "#0ea5e9"}
      stroke="#fff"
      strokeWidth={1}
    />
  );
}

function PriceTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string | null }>;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow">
      <div className="text-slate-500">日期: {label}</div>
      <div className="font-semibold text-slate-800">单价: {formatCurrency(Number(value || 0))}</div>
    </div>
  );
}

export default function ProductsPage() {
  const { canEditCatalog } = usePermission();
  const canViewFinancials = canEditCatalog;
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [keyword, setKeyword] = useState("");
  // 服务端 pageSize 上限 100：改为真实分页，避免超过一页的产品被静默截断
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  // 记录已通过深链打开的产品 id，避免重复触发
  const openedDeepLinkRef = useRef<number | null>(null);
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<
    Array<{
      date: string;
      unitPrice: number;
      quantity: number;
      supplierName: string | null;
      invoiceNumber: string | null;
    }>
  >([]);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [priceHistoryTitle, setPriceHistoryTitle] = useState("");
  const [priceHistoryProductId, setPriceHistoryProductId] = useState<number | null>(null);
  const [priceHistoryMonths, setPriceHistoryMonths] = useState("6");
  const [priceHistoryGroupBy, setPriceHistoryGroupBy] = useState<"invoice" | "month">("invoice");
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);

  const loadPriceHistory = async (
    productId: number,
    months: string,
    groupBy: "invoice" | "month"
  ) => {
    setPriceHistoryLoading(true);
    try {
      const history = await getProductPriceHistory(productId, {
        months: Number(months),
        groupBy,
      });
      setPriceHistory(history);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "加载价格历史失败");
    } finally {
      setPriceHistoryLoading(false);
    }
  };

  // 折线图数据：标注相邻两点环比涨跌超过 ±15% 的异常点
  const priceChartData = priceHistory.map((p, i) => {
    const prev = i > 0 ? priceHistory[i - 1].unitPrice : null;
    const changePercent = prev && prev > 0 ? ((p.unitPrice - prev) / prev) * 100 : 0;
    return {
      ...p,
      label: priceHistoryGroupBy === "month" ? p.date.slice(0, 7) : p.date.slice(5, 10),
      changePercent: Math.round(changePercent * 10) / 10,
      isAnomaly: Math.abs(changePercent) >= 15,
    };
  });

  const beginEdit = (item: Product) => {
    setEditing(true);
    setForm({
      id: item.id,
      sku: item.sku || "",
      barcode: item.barcode || "",
      nameEn: item.name_en,
      nameZh: item.name_zh || "",
      categoryId: item.category_id ? String(item.category_id) : "",
      defaultSupplierId: item.default_supplier_id ? String(item.default_supplier_id) : "",
      defaultUnit: item.default_unit,
      defaultPrice: item.default_price ? String(item.default_price) : "",
      sellingPrice: item.selling_price != null ? String(item.selling_price) : "",
      isPerishable: item.is_perishable ?? false,
      shelfLifeDays: item.shelf_life_days != null ? String(item.shelf_life_days) : "",
      notes: item.notes || "",
      isActive: item.is_active,
    });
  };

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes, suppliersAll] = await Promise.all([
        getProducts({ page: targetPage, pageSize: targetPageSize, keyword: keyword || undefined }),
        getCategoryFlat(),
        // 供应商仅用于下拉筛选/表单：跨页拉全，避免第 100 个之后的供应商无法选择
        getAllSuppliers(),
      ]);
      setItems(productsRes.items);
      setTotal(productsRes.pagination.total);
      setPage(productsRes.pagination.page);
      setCategories(categoriesRes);
      setSuppliers(suppliersAll);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载产品失败");
    } finally {
      setLoading(false);
    }
  };

  const debouncedKeyword = useDebounce(keyword, 400);

  useEffect(() => {
    // 关键词变化时回到第 1 页
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword]);

  // 深链支持：/products?id=123（来自 Header 全局搜索结果），直接拉取该产品并进入编辑态
  useEffect(() => {
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) return;
    if (!canEditCatalog || openedDeepLinkRef.current === id) return;
    openedDeepLinkRef.current = id;
    void (async () => {
      try {
        beginEdit(await getProductById(id));
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "打开产品失败");
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete("id");
        setSearchParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canEditCatalog]);

  return (
    <div className="space-y-4">
      {canEditCatalog ? (
        <Card>
          <h2 className="mb-3 text-lg font-bold">{editing ? "编辑产品" : "新增产品"}</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              placeholder="SKU"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
            />
            <Input
              placeholder="条码 (Barcode)"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
            <Input
              placeholder="英文名"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            />
            <Input
              placeholder="中文名"
              value={form.nameZh}
              onChange={(e) => setForm({ ...form, nameZh: e.target.value })}
            />
            <Select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={form.defaultSupplierId}
              onChange={(e) => setForm({ ...form, defaultSupplierId: e.target.value })}
            >
              <option value="">默认供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
            <Input
              placeholder="默认单位"
              value={form.defaultUnit}
              onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
            />
            <Input
              type="number"
              placeholder="默认进价"
              value={form.defaultPrice}
              onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
            />
            <Input
              type="number"
              placeholder="零售售价"
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isPerishable}
                onChange={(e) => setForm({ ...form, isPerishable: e.target.checked })}
              />
              生鲜/短保
            </label>
            <Input
              type="number"
              placeholder="货架期(天)"
              value={form.shelfLifeDays}
              onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
            />
            <Input
              placeholder="备注"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="md:col-span-2"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                if (!form.nameEn.trim()) {
                  toast.error("请填写英文名");
                  return;
                }
                const payload = {
                  sku: form.sku || null,
                  barcode: form.barcode || null,
                  nameEn: form.nameEn,
                  nameZh: form.nameZh || null,
                  categoryId: form.categoryId ? Number(form.categoryId) : null,
                  defaultSupplierId: form.defaultSupplierId ? Number(form.defaultSupplierId) : null,
                  defaultUnit: form.defaultUnit,
                  defaultPrice: form.defaultPrice ? Number(form.defaultPrice) : null,
                  sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : null,
                  isPerishable: form.isPerishable,
                  shelfLifeDays: form.shelfLifeDays ? Number(form.shelfLifeDays) : null,
                  notes: form.notes || null,
                  isActive: form.isActive,
                };
                try {
                  if (editing && form.id) {
                    await updateProduct(form.id, payload);
                    toast.success("产品已更新");
                  } else {
                    await createProduct(payload);
                    toast.success("产品已创建");
                  }
                  setForm(initialForm);
                  setEditing(false);
                  await load();
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "产品保存失败");
                }
              }}
            >
              {editing ? "保存修改" : "创建产品"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(initialForm);
                setEditing(false);
              }}
            >
              重置
            </Button>
            {editing && form.id ? (
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
                <Upload size={15} className="mr-1" />
                上传图片
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file || !form.id) return;
                    try {
                      await uploadProductImage(form.id, file);
                      toast.success("产品图片已上传");
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "图片上传失败");
                    } finally {
                      event.target.value = "";
                    }
                  }}
                />
              </label>
            ) : null}
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
              <Upload size={15} className="mr-1" />
              导入 Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    await importProducts(file);
                    toast.success("Excel 导入成功");
                    await load();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Excel 导入失败");
                  } finally {
                    event.target.value = "";
                  }
                }}
              />
            </label>
            <Button
              variant="secondary"
              onClick={async () => {
                // 走 axios（自动带 Authorization 头 + blob 下载）；原生 <a href> 不带鉴权头会触发 401
                try {
                  await exportProducts();
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "导出失败");
                }
              }}
            >
              <Download size={15} className="mr-1" />
              导出
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="w-full text-sm md:w-72">
            搜索
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1);
              }}
              placeholder="名称 / SKU"
            />
          </label>
          <Button onClick={() => void load(1)}>查询</Button>
        </div>
        {loading ? <SkeletonTable rows={6} columns={canViewFinancials ? 7 : 6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={Package}
            title="加载失败"
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState icon={Package} title="暂无产品" description="没有符合条件的产品。可尝试清除搜索条件，或点击右上角「新增产品」添加第一个商品。" />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">分类</th>
                <th className="px-3 py-2">供应商</th>
                {canViewFinancials ? <th className="px-3 py-2">进价</th> : null}
                <th className="px-3 py-2">售价</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{item.sku || "-"}</td>
                  <td className="px-3 py-2">
                    {item.name_zh || item.name_en}
                    <div className="text-xs text-slate-500">{item.name_en}</div>
                  </td>
                  <td className="px-3 py-2">{item.category_name || "-"}</td>
                  <td className="px-3 py-2">{item.supplier_name || "-"}</td>
                  {canViewFinancials ? (
                    <td className="px-3 py-2">{formatCurrency(item.default_price)}</td>
                  ) : null}
                  <td className="px-3 py-2">
                    {item.selling_price != null ? formatCurrency(item.selling_price) : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {canEditCatalog ? (
                        <Button variant="ghost" onClick={() => beginEdit(item)}>
                          编辑
                        </Button>
                      ) : null}
                      {canViewFinancials ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setPriceHistoryProductId(item.id);
                            setPriceHistoryTitle(item.name_zh || item.name_en);
                            setPriceHistoryMonths("6");
                            setPriceHistoryGroupBy("invoice");
                            setPriceHistoryOpen(true);
                            void loadPriceHistory(item.id, "6", "invoice");
                          }}
                        >
                          价格趋势
                        </Button>
                      ) : null}
                      {canEditCatalog ? (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            const ok = await confirm({
                              title: "删除产品",
                              message: `确认删除产品 ${item.name_zh || item.name_en} 吗？`,
                              confirmText: "删除",
                              danger: true,
                            });
                            if (!ok) return;
                            try {
                              await deleteProduct(item.id);
                              toast.success("产品已删除");
                              await load();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "删除产品失败");
                            }
                          }}
                        >
                          删除
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <div className="mt-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={(next) => void load(next)}
              onPageSizeChange={(size) => {
                setPageSize(size);
                void load(1, size);
              }}
            />
          </div>
        ) : null}
      </Card>

      <Modal
        open={priceHistoryOpen}
        title={`价格趋势 - ${priceHistoryTitle}`}
        onClose={() => setPriceHistoryOpen(false)}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select
            value={priceHistoryMonths}
            onChange={(e) => {
              setPriceHistoryMonths(e.target.value);
              if (priceHistoryProductId)
                void loadPriceHistory(priceHistoryProductId, e.target.value, priceHistoryGroupBy);
            }}
            className="w-28"
          >
            <option value="3">近3个月</option>
            <option value="6">近6个月</option>
            <option value="12">近12个月</option>
            <option value="24">近24个月</option>
          </Select>
          <Select
            value={priceHistoryGroupBy}
            onChange={(e) => {
              const gb = e.target.value as "invoice" | "month";
              setPriceHistoryGroupBy(gb);
              if (priceHistoryProductId)
                void loadPriceHistory(priceHistoryProductId, priceHistoryMonths, gb);
            }}
            className="w-32"
          >
            <option value="invoice">按发票</option>
            <option value="month">按月均价</option>
          </Select>
          <span className="text-xs text-slate-500">红点 = 环比涨跌超 15%</span>
        </div>

        {priceHistoryLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">加载中…</div>
        ) : priceChartData.length === 0 ? (
          <EmptyState
            icon={Package}
            title="暂无价格记录"
            description="该产品在所选区间内无已确认采购"
          />
        ) : (
          <>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={priceChartData}
                  margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={48} />
                  <RTooltip content={<PriceTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="unitPrice"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={<PriceDot />}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="border-b p-2">日期</th>
                    <th className="border-b p-2">单价</th>
                    <th className="border-b p-2">环比</th>
                    <th className="border-b p-2">数量</th>
                    <th className="border-b p-2">供应商</th>
                  </tr>
                </thead>
                <tbody>
                  {priceChartData.map((row, index) => (
                    <tr key={index} className={row.isAnomaly ? "bg-rose-50" : ""}>
                      <td className="border-b p-2">
                        {priceHistoryGroupBy === "month"
                          ? row.date.slice(0, 7)
                          : formatDate(row.date)}
                      </td>
                      <td className="border-b p-2">{formatCurrency(row.unitPrice)}</td>
                      <td
                        className={`border-b p-2 ${row.changePercent > 0 ? "text-rose-600" : row.changePercent < 0 ? "text-emerald-600" : "text-slate-400"}`}
                      >
                        {index === 0
                          ? "-"
                          : `${row.changePercent > 0 ? "+" : ""}${row.changePercent}%`}
                      </td>
                      <td className="border-b p-2">{row.quantity}</td>
                      <td className="border-b p-2">{row.supplierName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
