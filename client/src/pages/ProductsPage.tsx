import { useEffect, useState } from "react";
import { Download, Package, Upload } from "lucide-react";
import { getCategoryFlat } from "../api/categories";
import {
  createProduct,
  deleteProduct,
  getProductPriceHistory,
  getProducts,
  importProducts,
  updateProduct,
  uploadProductImage,
} from "../api/products";
import { getSuppliers } from "../api/suppliers";
import type { Category, Product, Supplier } from "../types";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Table } from "../components/ui/Table";
import { Modal } from "../components/ui/Modal";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatCurrency, formatDate } from "../utils/formatters";
import { API_BASE_URL } from "../utils/constants";
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

export default function ProductsPage() {
  const { canEditCatalog } = usePermission();
  const canViewFinancials = canEditCatalog;
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState<ProductForm>(initialForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<
    Array<{ date: string; unitPrice: number; quantity: number; supplierName: string | null; invoiceNumber: string | null }>
  >([]);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [priceHistoryTitle, setPriceHistoryTitle] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, categoriesRes, suppliersRes] = await Promise.all([
        getProducts({ pageSize: 200, keyword: keyword || undefined }),
        getCategoryFlat(),
        getSuppliers({ pageSize: 200 }),
      ]);
      setItems(productsRes.items);
      setCategories(categoriesRes);
      setSuppliers(suppliersRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载产品失败");
    } finally {
      setLoading(false);
    }
  };

  const debouncedKeyword = useDebounce(keyword, 400);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword]);

  return (
    <div className="space-y-4">
      {canEditCatalog ? (
        <Card>
          <h2 className="mb-3 text-lg font-bold">{editing ? "编辑产品" : "新增产品"}</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <Input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
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
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
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
            <a
              href={`${API_BASE_URL}/products/export`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg bg-amber px-3 py-2 text-sm font-semibold text-ink"
            >
              <Download size={15} className="mr-1" />
              导出
            </a>
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
                if (e.key === "Enter") void load();
              }}
              placeholder="名称 / SKU"
            />
          </label>
          <Button onClick={() => void load()}>查询</Button>
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
          <EmptyState icon={Package} title="暂无产品" description="没有符合条件的产品" />
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
                  {canViewFinancials ? <td className="px-3 py-2">{formatCurrency(item.default_price)}</td> : null}
                  <td className="px-3 py-2">{item.selling_price != null ? formatCurrency(item.selling_price) : "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {canEditCatalog ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
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
                          }}
                        >
                          编辑
                        </Button>
                      ) : null}
                      {canViewFinancials ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            const history = await getProductPriceHistory(item.id);
                            setPriceHistory(history);
                            setPriceHistoryTitle(item.name_zh || item.name_en);
                            setPriceHistoryOpen(true);
                          }}
                        >
                          价格历史
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
      </Card>

      <Modal open={priceHistoryOpen} title={`价格历史 - ${priceHistoryTitle}`} onClose={() => setPriceHistoryOpen(false)}>
        <div className="max-h-72 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="border-b p-2">日期</th>
                <th className="border-b p-2">单价</th>
                <th className="border-b p-2">数量</th>
                <th className="border-b p-2">供应商</th>
                <th className="border-b p-2">发票号</th>
              </tr>
            </thead>
            <tbody>
              {priceHistory.map((row, index) => (
                <tr key={index}>
                  <td className="border-b p-2">{formatDate(row.date)}</td>
                  <td className="border-b p-2">{formatCurrency(row.unitPrice)}</td>
                  <td className="border-b p-2">{row.quantity}</td>
                  <td className="border-b p-2">{row.supplierName || "-"}</td>
                  <td className="border-b p-2">{row.invoiceNumber || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
