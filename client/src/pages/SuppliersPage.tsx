import { t, useLanguage } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { createSupplier, deleteSupplier, getSupplierById, getSuppliers, updateSupplier } from "../api/suppliers";
import type { Supplier } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Table, Td, Th } from "../components/ui/Table";
import { Drawer } from "../components/ui/Drawer";
import { Modal } from "../components/ui/Modal";
import { SearchInput } from "../components/ui/SearchInput";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Pagination } from "../components/ui/Pagination";
import { EmptyState } from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Badge";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/DropdownMenu";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatDate } from "../utils/formatters";
import { usePermission } from "../hooks/usePermission";
import { useDebounce } from "../hooks/useDebounce";

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
  useLanguage();
  const { canEditCatalog } = usePermission();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Supplier[]>([]);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const openedDeepLinkRef = useRef<number | null>(null);
  const [form, setForm] = useState<SupplierForm>(initialForm);
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const openDetail = async (id: number) => {
    try {
      setDetail(await getSupplierById(id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("加载供应商详情失败"));
    }
  };

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSuppliers({
        page: targetPage,
        pageSize: targetPageSize,
        keyword: keyword || undefined,
      });
      setItems(data.items);
      setTotal(data.pagination.total);
      setPage(data.pagination.page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("加载供应商失败"));
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
    const idParam = searchParams.get("id");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0 || openedDeepLinkRef.current === id) return;
    openedDeepLinkRef.current = id;
    void openDetail(id);
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const beginCreate = () => {
    setForm(initialForm);
    setEditing(false);
    setFormError(null);
    setDrawerOpen(true);
  };

  const beginEdit = (item: Supplier) => {
    setEditing(true);
    setFormError(null);
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
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setFormError(t("请填写供应商名称"));
      return;
    }
    setFormError(null);
    setSaving(true);
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
        toast.success(t("供应商已更新"));
      } else {
        await createSupplier(payload);
        toast.success(t("供应商已创建"));
      }
      setForm(initialForm);
      setEditing(false);
      setDrawerOpen(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("供应商保存失败"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("供应商")}
        description={t("维护供应商档案与联系方式，供发票匹配和采购分析使用。")}
        actions={
          canEditCatalog ? (
            <Button leadingIcon={Plus} onClick={beginCreate}>{t("新增供应商")}</Button>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1);
              }}
              placeholder={t("搜索名称或编号")}
              aria-label={t("搜索供应商")}
              containerClassName="w-full sm:max-w-xs"
            />
          </ToolbarGroup>
          <ToolbarGroup>
            <span className="text-meta text-ink-subtle">{t("共")} <span className="font-medium tabular text-ink-muted">{total}</span> {t("家供应商")}</span>
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        {loading ? <SkeletonTable rows={6} columns={6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={Building2}
            title={t("加载失败")}
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>{t("重试")}</Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={keyword ? t("没有匹配的供应商") : t("还没有供应商")}
            description={
              keyword
                ? t("换个名称或编号试试。")
                : t("新增供应商后，识别发票时会自动匹配名称与别名。")
            }
            action={
              !keyword && canEditCatalog ? (
                <Button leadingIcon={Plus} onClick={beginCreate}>{t("新增供应商")}</Button>
              ) : null
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("供应商")}</Th>
                  <Th>{t("编号")}</Th>
                  <Th>{t("联系人")}</Th>
                  <Th>{t("电话")}</Th>
                  <Th>{t("状态")}</Th>
                  <Th className="cell-actions">{t("操作")}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                          <Building2 size={14} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => void openDetail(item.id)}
                            className="cell-strong block max-w-[16rem] truncate text-left underline-offset-4 hover:text-accent hover:underline"
                          >
                            {item.name}
                          </button>
                          {item.email ? (
                            <p className="max-w-[16rem] truncate text-meta text-ink-subtle">{item.email}</p>
                          ) : null}
                        </div>
                      </div>
                    </Td>
                    <Td className="font-mono text-meta text-ink-subtle">{item.code || "—"}</Td>
                    <Td>{item.contact_name || <span className="text-ink-subtle">—</span>}</Td>
                    <Td className="tabular whitespace-nowrap">
                      {item.phone || <span className="text-ink-subtle">—</span>}
                    </Td>
                    <Td>
                      {item.is_active ? <Badge tone="success">{t("合作中")}</Badge> : <Badge>{t("已停用")}</Badge>}
                    </Td>
                    <Td className="cell-actions">
                      <DropdownMenu
                        label={t("{0} 操作", item.name)}
                        trigger={(props) => (
                          <Button {...props} variant="ghost" size="sm" iconOnly aria-label={t("更多操作")}>
                            <MoreHorizontal size={16} aria-hidden="true" />
                          </Button>
                        )}
                      >
                        <DropdownMenuItem onSelect={() => void openDetail(item.id)}>{t("查看详情")}</DropdownMenuItem>
                        {canEditCatalog ? (
                          <DropdownMenuItem icon={Pencil} onSelect={() => beginEdit(item)}>{t("编辑供应商")}</DropdownMenuItem>
                        ) : null}
                        {canEditCatalog ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              icon={Trash2}
                              tone="danger"
                              onSelect={async () => {
                                const ok = await confirm({
                                  title: t("删除供应商"),
                                  message: t("确认删除供应商「{0}」吗？已关联的发票不会删除。", item.name),
                                  confirmText: t("删除"),
                                  danger: true,
                                });
                                if (!ok) return;
                                try {
                                  await deleteSupplier(item.id);
                                  toast.success(t("供应商已删除"));
                                  await load();
                                } catch (err: unknown) {
                                  toast.error(err instanceof Error ? err.message : t("删除供应商失败"));
                                }
                              }}
                            >{t("删除供应商")}</DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenu>
                    </Td>
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

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? t("编辑供应商") : t("新增供应商")}
        description={t("名称与编号会用于发票 OCR 的供应商匹配。")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>{t("取消")}</Button>
            <Button onClick={() => void submit()} loading={saving}>
              {editing ? t("保存修改") : t("创建供应商")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("供应商名称")} htmlFor="supplier-name" required error={formError ?? undefined}>
            <Input
              id="supplier-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("例如 CBS FOODS")}
              aria-invalid={Boolean(formError)}
            />
          </Field>
          <Field label={t("编号")} htmlFor="supplier-code" hint={t("供应商代码或简称，用于发票匹配")}>
            <Input
              id="supplier-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder={t("可选")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("联系人")} htmlFor="supplier-contact">
              <Input
                id="supplier-contact"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </Field>
            <Field label={t("电话")} htmlFor="supplier-phone">
              <Input
                id="supplier-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t("邮箱")} htmlFor="supplier-email">
            <Input
              id="supplier-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label={t("地址")} htmlFor="supplier-address">
            <Input
              id="supplier-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label={t("备注")} htmlFor="supplier-notes">
            <Input
              id="supplier-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </Drawer>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.name ?? t("供应商详情")}
        description={detail ? t("创建于 {0}", formatDate(detail.created_at)) : undefined}
        size="sm"
      >
        {detail ? (
          <dl className="space-y-3 text-sm">
            {[
              { label: t("编号"), value: detail.code, icon: Building2 },
              { label: t("联系人"), value: detail.contact_name, icon: Building2 },
              { label: t("电话"), value: detail.phone, icon: Phone },
              { label: t("邮箱"), value: detail.email, icon: Mail },
              { label: t("地址"), value: detail.address, icon: MapPin },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-start gap-3">
                  <dt className="flex w-20 shrink-0 items-center gap-1.5 text-ink-subtle">
                    <Icon size={13} aria-hidden="true" />
                    {row.label}
                  </dt>
                  <dd className="min-w-0 flex-1 break-words text-ink">
                    {row.value || <span className="text-ink-subtle">{t("未填写")}</span>}
                  </dd>
                </div>
              );
            })}
            <div className="border-t border-line pt-3">
              <dt className="mb-1 text-ink-subtle">{t("备注")}</dt>
              <dd className="whitespace-pre-wrap text-ink">
                {detail.notes || <span className="text-ink-subtle">{t("无")}</span>}
              </dd>
            </div>
          </dl>
        ) : null}
      </Modal>
    </div>
  );
}
