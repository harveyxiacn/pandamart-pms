import { useEffect, useState } from "react";
import { createSupplier, deleteSupplier, getSupplierById, getSuppliers, updateSupplier } from "../api/suppliers";
import type { Supplier } from "../types";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Table } from "../components/ui/Table";
import { Modal } from "../components/ui/Modal";
import { SkeletonTable } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatDate } from "../utils/formatters";
import { usePermission } from "../hooks/usePermission";
import { useDebounce } from "../hooks/useDebounce";
import { Building2 } from "lucide-react";

type SupplierForm = {
  id?: number;
  name: string;
  code: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

const initialForm: SupplierForm = {
  name: "",
  code: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function SuppliersPage() {
  const { canEditCatalog } = usePermission();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Supplier[]>([]);
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState<SupplierForm>(initialForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSuppliers({ pageSize: 200, keyword: keyword || undefined });
      setItems(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载供应商失败");
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
          <h2 className="mb-3 text-lg font-bold">{editing ? "编辑供应商" : "新增供应商"}</h2>
          <div className="grid gap-2 md:grid-cols-3">
            <Input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="编号" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input
              placeholder="联系人"
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
            <Input placeholder="电话" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input
              placeholder="地址"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <Input
              placeholder="备注"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="md:col-span-3"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={async () => {
                if (!form.name.trim()) {
                  toast.error("请填写供应商名称");
                  return;
                }
                const payload = {
                  name: form.name,
                  code: form.code || null,
                  contactName: form.contactName || null,
                  phone: form.phone || null,
                  email: form.email || null,
                  address: form.address || null,
                  notes: form.notes || null,
                };
                try {
                  if (editing && form.id) {
                    await updateSupplier(form.id, payload);
                    toast.success("供应商已更新");
                  } else {
                    await createSupplier(payload);
                    toast.success("供应商已创建");
                  }
                  setForm(initialForm);
                  setEditing(false);
                  await load();
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : "供应商保存失败");
                }
              }}
            >
              {editing ? "保存修改" : "创建供应商"}
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
              placeholder="名称 / 编号"
            />
          </label>
          <Button onClick={() => void load()}>查询</Button>
        </div>

        {loading ? <SkeletonTable rows={6} columns={5} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={Building2}
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
          <EmptyState icon={Building2} title="暂无供应商" description="没有符合条件的供应商" />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">编号</th>
                <th className="px-3 py-2">联系人</th>
                <th className="px-3 py-2">电话</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2">{item.code || "-"}</td>
                  <td className="px-3 py-2">{item.contact_name || "-"}</td>
                  <td className="px-3 py-2">{item.phone || "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {canEditCatalog ? (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditing(true);
                            setForm({
                              id: item.id,
                              name: item.name,
                              code: item.code || "",
                              contactName: item.contact_name || "",
                              phone: item.phone || "",
                              email: item.email || "",
                              address: item.address || "",
                              notes: item.notes || "",
                            });
                          }}
                        >
                          编辑
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          const detailData = await getSupplierById(item.id);
                          setDetail(detailData);
                        }}
                      >
                        详情
                      </Button>
                      {canEditCatalog ? (
                        <Button
                          variant="danger"
                          onClick={async () => {
                            const ok = await confirm({
                              title: "删除供应商",
                              message: `确认删除供应商 ${item.name} 吗？`,
                              confirmText: "删除",
                              danger: true,
                            });
                            if (!ok) return;
                            try {
                              await deleteSupplier(item.id);
                              toast.success("供应商已删除");
                              await load();
                            } catch (err: unknown) {
                              toast.error(err instanceof Error ? err.message : "删除供应商失败");
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

      <Modal open={detail !== null} title="供应商详情" onClose={() => setDetail(null)}>
        {detail ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>名称: {detail.name}</p>
            <p>编号: {detail.code || "-"}</p>
            <p>联系人: {detail.contact_name || "-"}</p>
            <p>电话: {detail.phone || "-"}</p>
            <p>邮箱: {detail.email || "-"}</p>
            <p>创建时间: {formatDate(detail.created_at)}</p>
            <p className="sm:col-span-2">地址: {detail.address || "-"}</p>
            <p className="sm:col-span-2">备注: {detail.notes || "-"}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
