import { useEffect, useState } from "react";
import { createUser, getUsers, resetUserPassword, updateUser, updateUserStatus } from "../api/users";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Table } from "../components/ui/Table";
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
  const [items, setItems] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(initialForm);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUsers();
      setItems(res as UserRecord[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载用户失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg font-bold">创建用户</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            placeholder="用户名"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Input
            placeholder="显示名"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
          <Input
            placeholder="邮箱"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            type="password"
            placeholder="密码"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "staff" })}
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        <div className="mt-3">
          <Button
            onClick={async () => {
              await createUser(form);
              setForm(initialForm);
              await load();
            }}
          >
            创建用户
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">用户列表</h2>
        {loading ? <SkeletonTable rows={5} columns={5} /> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading ? (
          <Table>
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600">
                <th className="px-3 py-2">用户名</th>
                <th className="px-3 py-2">显示名</th>
                <th className="px-3 py-2">角色</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">最后登录</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{item.username}</td>
                  <td className="px-3 py-2">{item.display_name}</td>
                  <td className="px-3 py-2">{item.role}</td>
                  <td className="px-3 py-2">{item.is_active ? "启用" : "禁用"}</td>
                  <td className="px-3 py-2">{formatDateTime(item.last_login_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          const displayName = window.prompt("显示名", item.display_name);
                          if (displayName === null) return;
                          const email = window.prompt("邮箱", item.email || "");
                          if (email === null) return;
                          const role = window.prompt("角色(admin/staff)", item.role);
                          if (role !== "admin" && role !== "staff") return;
                          await updateUser(item.id, { displayName, email, role });
                          await load();
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        variant={item.is_active ? "danger" : "secondary"}
                        onClick={async () => {
                          await updateUserStatus(item.id, !item.is_active);
                          await load();
                        }}
                      >
                        {item.is_active ? "禁用" : "启用"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          const newPassword = window.prompt("输入新密码（至少6位）");
                          if (!newPassword) return;
                          await resetUserPassword(item.id, newPassword);
                          alert("密码已重置");
                        }}
                      >
                        重置密码
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>
    </div>
  );
}
