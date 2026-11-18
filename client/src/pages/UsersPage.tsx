import { t, useLanguage } from "../i18n";
import { useEffect, useState } from "react";
import { KeyRound, MoreHorizontal, Pencil, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { createUser, getUsers, resetUserPassword, updateUser, updateUserStatus } from "../api/users";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Input } from "../components/ui/Input";
import { Field } from "../components/ui/Field";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Table, Td, Th } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { Drawer } from "../components/ui/Drawer";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/DropdownMenu";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatDateTime } from "../utils/formatters";

type UserRecord = {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: "admin" | "staff";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

type UserForm = {
  username: string;
  password: string;
  displayName: string;
  email: string;
  role: "admin" | "staff";
};

const initialForm: UserForm = {
  username: "",
  password: "",
  displayName: "",
  email: "",
  role: "staff",
};

export default function UsersPage() {
  useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(initialForm);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await getUsers()) as UserRecord[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("加载用户失败"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: UserRecord) => {
    setEditing(user);
    setForm({
      username: user.username,
      password: "",
      displayName: user.display_name,
      email: user.email || "",
      role: user.role,
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (editing) {
      setSaving(true);
      try {
        await updateUser(editing.id, {
          displayName: form.displayName,
          email: form.email || null,
          role: form.role,
        });
        toast.success(t("用户已更新"));
        setDrawerOpen(false);
        await load();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : t("更新用户失败"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.username.trim() || !form.password) {
      setFormError(t("用户名和密码为必填项"));
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await createUser(form);
      toast.success(t("用户已创建"));
      setForm(initialForm);
      setDrawerOpen(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("创建用户失败"));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: UserRecord) => {
    if (user.is_active) {
      const ok = await confirm({
        title: t("禁用用户"),
        message: t("禁用「{0}」后，该用户将立即无法登录。", user.display_name || user.username),
        confirmText: t("禁用"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await updateUserStatus(user.id, !user.is_active);
      toast.success(user.is_active ? t("用户已禁用") : t("用户已启用"));
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("更新状态失败"));
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.id, newPassword);
      toast.success(t("密码已重置，该用户需重新登录"));
      setResetTarget(null);
      setNewPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("重置密码失败"));
    } finally {
      setResetting(false);
    }
  };

  const activeCount = items.filter((user) => user.is_active).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("用户管理")}
        description={t("管理后台账号、角色与登录状态。管理员可管理全部模块，店员仅能操作进货与销售。")}
        actions={
          <Button leadingIcon={Plus} onClick={openCreate}>{t("创建用户")}</Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ShieldCheck size={17} aria-hidden="true" />
          </span>
          <div>
            <p className="text-meta text-ink-subtle">{t("账号总数")}</p>
            <p className="text-title font-semibold tabular text-ink">{items.length}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-soft text-success">
            <UserCheck size={17} aria-hidden="true" />
          </span>
          <div>
            <p className="text-meta text-ink-subtle">{t("启用中")}</p>
            <p className="text-title font-semibold tabular text-ink">{activeCount}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-inset text-ink-muted">
            <UserX size={17} aria-hidden="true" />
          </span>
          <div>
            <p className="text-meta text-ink-subtle">{t("已禁用")}</p>
            <p className="text-title font-semibold tabular text-ink">{items.length - activeCount}</p>
          </div>
        </Card>
      </div>

      <Card padded={false} className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-title font-semibold tracking-tight text-ink">{t("用户列表")}</h2>
          <span className="text-meta text-ink-subtle">{t("共")} {items.length} {t("个账号")}</span>
        </div>
        {loading ? <SkeletonTable rows={5} columns={6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={UserX}
            title={t("加载失败")}
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>{t("重试")}</Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState icon={UserX} title={t("暂无用户")} description={t("点击右上角「创建用户」添加第一个账号。")} />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>{t("用户")}</Th>
                <Th>{t("角色")}</Th>
                <Th>{t("状态")}</Th>
                <Th>{t("最后登录")}</Th>
                <Th>{t("创建时间")}</Th>
                <Th className="cell-actions">{t("操作")}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-inset text-meta font-semibold text-ink-muted ring-1 ring-inset ring-line">
                        {(item.display_name || item.username).slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="cell-strong truncate">{item.display_name || item.username}</p>
                        <p className="truncate text-meta text-ink-subtle">
                          {item.username}
                          {item.email ? ` · ${item.email}` : ""}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {item.role === "admin" ? <Badge tone="info">{t("管理员")}</Badge> : <Badge>{t("店员")}</Badge>}
                  </Td>
                  <Td>
                    {item.is_active ? <Badge tone="success">{t("启用")}</Badge> : <Badge tone="danger">{t("已禁用")}</Badge>}
                  </Td>
                  <Td className="whitespace-nowrap tabular text-meta">{formatDateTime(item.last_login_at)}</Td>
                  <Td className="whitespace-nowrap tabular text-meta">{formatDateTime(item.created_at)}</Td>
                  <Td className="cell-actions">
                    <DropdownMenu
                      label={t("{0} 操作", item.username)}
                      trigger={(props) => (
                        <Button {...props} variant="ghost" size="sm" iconOnly aria-label={t("更多操作")}>
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </Button>
                      )}
                    >
                      <DropdownMenuItem icon={Pencil} onSelect={() => openEdit(item)}>{t("编辑资料")}</DropdownMenuItem>
                      <DropdownMenuItem
                        icon={KeyRound}
                        onSelect={() => {
                          setResetTarget(item);
                          setNewPassword("");
                        }}
                      >{t("重置密码")}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        icon={item.is_active ? UserX : UserCheck}
                        tone={item.is_active ? "danger" : "default"}
                        onSelect={() => void toggleStatus(item)}
                      >
                        {item.is_active ? t("禁用账号") : t("启用账号")}
                      </DropdownMenuItem>
                    </DropdownMenu>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? t("编辑用户") : t("创建用户")}
        description={editing ? t("账号 {0} 的基本资料", editing.username) : t("创建后可将账号分配给店员或管理员。")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>{t("取消")}</Button>
            <Button onClick={() => void submit()} loading={saving}>
              {editing ? t("保存修改") : t("创建用户")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {!editing ? (
            <>
              <Field label={t("用户名")} htmlFor="user-username" required error={formError ?? undefined}>
                <Input
                  id="user-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="off"
                  aria-invalid={Boolean(formError)}
                />
              </Field>
              <Field label={t("初始密码")} htmlFor="user-password" required hint={t("至少 8 位，且同时包含字母与数字")}>
                <Input
                  id="user-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                />
              </Field>
            </>
          ) : null}
          <Field label={t("显示名")} htmlFor="user-display">
            <Input
              id="user-display"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder={t("例如 张伟")}
            />
          </Field>
          <Field label={t("邮箱")} htmlFor="user-email">
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder={t("可选")}
            />
          </Field>
          <Field label={t("角色")} htmlFor="user-role" hint={t("管理员可访问仪表盘、分析、设置等模块；店员仅可使用进货与销售。")}>
            <Select
              id="user-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "staff" })}
            >
              <option value="staff">{t("店员（Staff）")}</option>
              <option value="admin">{t("管理员（Admin）")}</option>
            </Select>
          </Field>
        </div>
      </Drawer>

      <Modal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        title={t("重置密码")}
        description={resetTarget ? t("为 {0} 设置新密码", resetTarget.display_name || resetTarget.username) : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetTarget(null)}>{t("取消")}</Button>
            <Button onClick={() => void submitReset()} loading={resetting} disabled={newPassword.length < 8}>{t("重置密码")}</Button>
          </>
        }
      >
        <Field
          label={t("新密码")}
          htmlFor="reset-password"
          hint={t("至少 8 位，且同时包含字母与数字；重置后该用户需重新登录。")}
        >
          <Input
            id="reset-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            data-autofocus
          />
        </Field>
      </Modal>
    </div>
  );
}
