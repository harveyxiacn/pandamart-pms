import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  ImagePlus,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Upload,
} from "lucide-react";
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
import { getAllSuppliers } from "../api/suppliers";
import { exportProducts } from "../api/export";
import type { Category, Product, Supplier } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { Select } from "../components/ui/Select";
import { SearchInput } from "../components/ui/SearchInput";
import { Table, Td, Th } from "../components/ui/Table";
import { Pagination } from "../components/ui/Pagination";
import { Modal } from "../components/ui/Modal";
import { Drawer } from "../components/ui/Drawer";
import { Badge } from "../components/ui/Badge";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/DropdownMenu";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { ChartTooltip, axisTick, chartColor, chartGrid } from "../components/charts/ChartKit";
import { formatCurrency, formatDate } from "../utils/formatters";
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
      fill={anomaly ? "rgb(var(--danger))" : chartColor(1)}
      stroke="rgb(var(--surface))"
      strokeWidth={1.5}
    />
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
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [activeOnly, setActiveOnly] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const openedDeepLinkRef = useRef<number | null>(null);

  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);

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

  const loadPriceHistory = async (productId: number, months: string, groupBy: "invoice" | "month") => {
    setPriceHistoryLoading(true);
    try {
      setPriceHistory(await getProductPriceHistory(productId, { months: Number(months), groupBy }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "加载价格历史失败");
    } finally {
      setPriceHistoryLoading(false);
    }
  };

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
    setFormError(null);
    setForm({
      id: item.id,
      sku: item.sku || "",
      barcode: item.barcode || "",
      nameEn: item.name_en,
      nameZh: item.name_zh || "",
      categoryId: item.category_id ? String(item.category_id) : "",
      defaultSupplierId: item.default_supplier_id ? String(item.default_supplier_id) : "",
      defaultUnit: item.default_unit,
      defaultPrice: item.default_price != null ? String(item.default_price) : "",
      sellingPrice: item.selling_price != null ? String(item.selling_price) : "",
      isPerishable: item.is_perishable ?? false,
      shelfLifeDays: item.shelf_life_days != null ? String(item.shelf_life_days) : "",
      notes: item.notes || "",
      isActive: item.is_active,
    });
    setCurrentImage(item.image_url ?? null);
    setDrawerOpen(true);
  };

  const beginCreate = () => {
    setEditing(false);
    setForm(initialForm);
    setCurrentImage(null);
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSaving(false);
  };

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes, suppliersAll] = await Promise.all([
        getProducts({
          page: targetPage,
          pageSize: targetPageSize,
          keyword: keyword || undefined,
          categoryId: categoryId || undefined,
          supplierId: supplierId || undefined,
          isActive: activeOnly || undefined,
        }),
        getCategoryFlat(),
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
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword]);

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, supplierId, activeOnly]);

  // 深链支持：/products?id=123（来自 Header 全局搜索结果）
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

  const hasFilters = Boolean(keyword || categoryId || supplierId || activeOnly);
  const clearFilters = () => {
    setKeyword("");
    setCategoryId("");
    setSupplierId("");
    setActiveOnly("");
  };

  const submit = async () => {
    if (!form.nameEn.trim()) {
      setFormError("请填写英文名");
      return;
    }
    setFormError(null);
    setSaving(true);
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
      setDrawerOpen(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "产品保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="产品管理"
        description={
          canEditCatalog
            ? "维护商品主数据、进价售价与默认供应商。"
            : "查看商品目录、零售价与默认供应商。"
        }
        actions={
          canEditCatalog ? (
            <>
              <input
                ref={importRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const result = await importProducts(file);
                    toast.success(`Excel 导入成功：新增 ${result.created}，跳过 ${result.skipped}`);
                    await load();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Excel 导入失败");
                  } finally {
                    event.target.value = "";
                  }
                }}
              />
              <Button variant="secondary" leadingIcon={Upload} onClick={() => importRef.current?.click()}>
                导入
              </Button>
              <Button
                variant="secondary"
                leadingIcon={Download}
                onClick={async () => {
                  try {
                    await exportProducts();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "导出失败");
                  }
                }}
              >
                导出
              </Button>
              <Button leadingIcon={Plus} onClick={beginCreate}>
                新增产品
              </Button>
            </>
          ) : null
        }
      />

      <Card>
        <Toolbar>
          <ToolbarGroup grow>
            <SearchInput
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onClear={() => setKeyword("")}
              placeholder="搜索名称、SKU 或条码"
              aria-label="搜索产品"
              containerClassName="w-full sm:max-w-xs"
            />
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="按分类筛选"
              className="w-auto min-w-[8rem]"
            >
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              aria-label="按供应商筛选"
              className="w-auto min-w-[9rem]"
            >
              <option value="">全部供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
            <Select
              value={activeOnly}
              onChange={(e) => setActiveOnly(e.target.value)}
              aria-label="按状态筛选"
              className="w-auto min-w-[7rem]"
            >
              <option value="">全部状态</option>
              <option value="true">在售</option>
              <option value="false">停售</option>
            </Select>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            ) : null}
          </ToolbarGroup>
          <ToolbarGroup>
            <span className="text-meta text-ink-subtle">
              共 <span className="font-medium tabular text-ink-muted">{total}</span> 个产品
            </span>
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        {loading ? <SkeletonTable rows={6} columns={canViewFinancials ? 8 : 6} /> : null}

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
          <EmptyState
            icon={Package}
            title={hasFilters ? "没有符合条件的产品" : "还没有产品"}
            description={
              hasFilters
                ? "试试清除筛选条件，或换一个关键词。"
                : "添加第一个商品，或在发票识别时自动创建。"
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  清除筛选
                </Button>
              ) : canEditCatalog ? (
                <Button leadingIcon={Plus} onClick={beginCreate}>
                  新增产品
                </Button>
              ) : null
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>SKU</Th>
                  <Th>产品</Th>
                  <Th>分类</Th>
                  <Th>供应商</Th>
                  {canViewFinancials ? <Th numeric>进价</Th> : null}
                  <Th numeric>售价</Th>
                  <Th>状态</Th>
                  {canEditCatalog ? <Th className="cell-actions">操作</Th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <Td className="font-mono text-meta text-ink-subtle">{item.sku || "—"}</Td>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className="h-8 w-8 rounded-md border border-line object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-inset text-ink-subtle">
                            <Package size={14} aria-hidden="true" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="cell-strong truncate">{item.name_zh || item.name_en}</p>
                          {item.name_zh ? (
                            <p className="truncate text-meta text-ink-subtle">{item.name_en}</p>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td>{item.category_name || <span className="text-ink-subtle">—</span>}</Td>
                    <Td>{item.supplier_name || <span className="text-ink-subtle">—</span>}</Td>
                    {canViewFinancials ? (
                      <Td numeric className="text-ink">
                        {formatCurrency(item.default_price)}
                      </Td>
                    ) : null}
                    <Td numeric className="font-medium text-ink">
                      {item.selling_price != null ? formatCurrency(item.selling_price) : "—"}
                    </Td>
                    <Td>
                      {item.is_active ? (
                        <Badge tone="success">在售</Badge>
                      ) : (
                        <Badge>停售</Badge>
                      )}
                    </Td>
                    {canEditCatalog ? (
                      <Td className="cell-actions">
                        <DropdownMenu
                          label={`${item.name_zh || item.name_en} 操作`}
                          trigger={(props) => (
                            <Button {...props} variant="ghost" size="sm" iconOnly aria-label="更多操作">
                              <MoreHorizontal size={16} aria-hidden="true" />
                            </Button>
                          )}
                        >
                          <DropdownMenuItem icon={Pencil} onSelect={() => beginEdit(item)}>
                            编辑产品
                          </DropdownMenuItem>
                          {canViewFinancials ? (
                            <DropdownMenuItem
                              icon={TrendingUp}
                              onSelect={() => {
                                setPriceHistoryProductId(item.id);
                                setPriceHistoryTitle(item.name_zh || item.name_en);
                                setPriceHistoryMonths("6");
                                setPriceHistoryGroupBy("invoice");
                                setPriceHistoryOpen(true);
                                void loadPriceHistory(item.id, "6", "invoice");
                              }}
                            >
                              价格趋势
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            icon={Trash2}
                            tone="danger"
                            onSelect={async () => {
                              const ok = await confirm({
                                title: "删除产品",
                                message: `确认删除产品「${item.name_zh || item.name_en}」吗？该操作不可撤销。`,
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
                            删除产品
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>

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
          </>
        ) : null}
      </Card>

      {/* ── create / edit drawer ─────────────────────────── */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "编辑产品" : "新增产品"}
        description={editing ? "修改后立即生效，历史发票不受影响。" : "带 * 的字段为必填项。"}
        footer={
          <>
            <Button variant="ghost" onClick={closeDrawer}>
              取消
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              {editing ? "保存修改" : "创建产品"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-meta font-semibold uppercase tracking-wider text-ink-subtle">基本信息</h3>
            <Field label="英文名" htmlFor="product-name-en" required error={formError ?? undefined}>
              <Input
                id="product-name-en"
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                placeholder="例如 NAPA CABBAGE"
                aria-invalid={Boolean(formError)}
              />
            </Field>
            <Field label="中文名" htmlFor="product-name-zh">
              <Input
                id="product-name-zh"
                value={form.nameZh}
                onChange={(e) => setForm({ ...form, nameZh: e.target.value })}
                placeholder="例如 绍菜"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU" htmlFor="product-sku">
                <Input
                  id="product-sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="可选"
                />
              </Field>
              <Field label="条码" htmlFor="product-barcode">
                <Input
                  id="product-barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="可选"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-meta font-semibold uppercase tracking-wider text-ink-subtle">分类与供应</h3>
            <Field label="分类" htmlFor="product-category">
              <Select
                id="product-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              >
                <option value="">未分类</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="默认供应商" htmlFor="product-supplier">
              <Select
                id="product-supplier"
                value={form.defaultSupplierId}
                onChange={(e) => setForm({ ...form, defaultSupplierId: e.target.value })}
              >
                <option value="">未指定</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-meta font-semibold uppercase tracking-wider text-ink-subtle">价格与库存</h3>
            <div className="grid grid-cols-3 gap-3">
              <Field label="默认单位" htmlFor="product-unit">
                <Input
                  id="product-unit"
                  value={form.defaultUnit}
                  onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })}
                />
              </Field>
              <Field label="默认进价" htmlFor="product-cost">
                <Input
                  id="product-cost"
                  type="number"
                  step="0.01"
                  value={form.defaultPrice}
                  onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
                  placeholder="0.00"
                />
              </Field>
              <Field label="零售价" htmlFor="product-price">
                <Input
                  id="product-price"
                  type="number"
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  placeholder="0.00"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="货架期（天）" htmlFor="product-shelf">
                <Input
                  id="product-shelf"
                  type="number"
                  value={form.shelfLifeDays}
                  onChange={(e) => setForm({ ...form, shelfLifeDays: e.target.value })}
                  placeholder="可选"
                />
              </Field>
              <label className="flex h-9 items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={form.isPerishable}
                  onChange={(e) => setForm({ ...form, isPerishable: e.target.checked })}
                  className="h-4 w-4 rounded border-line-strong accent-primary"
                />
                生鲜 / 短保商品
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-line-strong accent-primary"
              />
              在售（取消勾选后不在收银列表出现）
            </label>
          </section>

          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-meta font-semibold uppercase tracking-wider text-ink-subtle">备注与图片</h3>
            <Field label="备注" htmlFor="product-notes">
              <Input
                id="product-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="可选"
              />
            </Field>
            {editing && form.id ? (
              <div className="flex items-center gap-3">
                {currentImage ? (
                  <img
                    src={currentImage}
                    alt="产品图片"
                    className="h-14 w-14 rounded-lg border border-line object-cover"
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line-strong text-ink-subtle">
                    <ImagePlus size={18} aria-hidden="true" />
                  </span>
                )}
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="sr-only"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file || !form.id) return;
                    try {
                      const result = await uploadProductImage(form.id, file);
                      setCurrentImage(result.imageUrl);
                      toast.success("产品图片已上传");
                      await load();
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : "图片上传失败");
                    } finally {
                      event.target.value = "";
                    }
                  }}
                />
                <Button variant="secondary" size="sm" onClick={() => imageRef.current?.click()}>
                  {currentImage ? "更换图片" : "上传图片"}
                </Button>
              </div>
            ) : (
              <p className="text-meta text-ink-subtle">保存产品后即可上传图片。</p>
            )}
          </section>
        </div>
      </Drawer>

      {/* ── price history ────────────────────────────────── */}
      <Modal
        open={priceHistoryOpen}
        onClose={() => setPriceHistoryOpen(false)}
        title="价格趋势"
        description={priceHistoryTitle}
        size="lg"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={priceHistoryMonths}
            onChange={(e) => {
              setPriceHistoryMonths(e.target.value);
              if (priceHistoryProductId)
                void loadPriceHistory(priceHistoryProductId, e.target.value, priceHistoryGroupBy);
            }}
            className="w-32"
            aria-label="时间范围"
          >
            <option value="3">近 3 个月</option>
            <option value="6">近 6 个月</option>
            <option value="12">近 12 个月</option>
            <option value="24">近 24 个月</option>
          </Select>
          <SegmentedControl
            label="统计方式"
            value={priceHistoryGroupBy}
            onChange={(value) => {
              setPriceHistoryGroupBy(value);
              if (priceHistoryProductId)
                void loadPriceHistory(priceHistoryProductId, priceHistoryMonths, value);
            }}
            options={[
              { value: "invoice", label: "按发票" },
              { value: "month", label: "按月均价" },
            ]}
          />
          <span className="ml-auto inline-flex items-center gap-1.5 text-meta text-ink-subtle">
            <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
            红点为环比涨跌超过 15%
          </span>
        </div>

        {priceHistoryLoading ? (
          <div className="py-16 text-center text-sm text-ink-subtle">加载中…</div>
        ) : priceChartData.length === 0 ? (
          <EmptyState icon={Package} title="暂无价格记录" description="该产品在所选区间内没有已确认的采购。" />
        ) : (
          <>
            <div className="h-60 w-full" role="img" aria-label="价格走势折线图">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={chartGrid} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} dy={6} />
                  <YAxis
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(value: number) => `$${value}`}
                  />
                  <RTooltip content={<ChartTooltip valueFormatter={(value) => formatCurrency(value)} />} />
                  <Line
                    type="monotone"
                    dataKey="unitPrice"
                    name="单价"
                    stroke={chartColor(1)}
                    strokeWidth={2}
                    dot={<PriceDot />}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-line">
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <Th>日期</Th>
                      <Th numeric>单价</Th>
                      <Th numeric>环比</Th>
                      <Th numeric>数量</Th>
                      <Th>供应商</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceChartData.map((row, index) => (
                      <tr key={index} data-selected={row.isAnomaly ? "true" : undefined}>
                        <Td>
                          {priceHistoryGroupBy === "month" ? row.date.slice(0, 7) : formatDate(row.date)}
                        </Td>
                        <Td numeric className="text-ink">{formatCurrency(row.unitPrice)}</Td>
                        <Td
                          numeric
                          className={
                            row.changePercent > 0
                              ? "text-danger"
                              : row.changePercent < 0
                                ? "text-success"
                                : "text-ink-subtle"
                          }
                        >
                          {index === 0
                            ? "—"
                            : `${row.changePercent > 0 ? "+" : ""}${row.changePercent}%`}
                        </Td>
                        <Td numeric>{row.quantity}</Td>
                        <Td>{row.supplierName || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!priceHistoryProductId) return;
                  try {
                    beginEdit(await getProductById(priceHistoryProductId));
                    setPriceHistoryOpen(false);
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "打开产品失败");
                  }
                }}
              >
                编辑产品信息
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
