import { useEffect, useState } from "react";
import { getAuditLogs, type AuditLogItem } from "../api/auditLogs";
import { getUsers } from "../api/users";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Table } from "../components/ui/Table";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Pagination } from "../components/ui/Pagination";
import { formatDateTime } from "../utils/formatters";

const PAGE_SIZE = 30;

type UserOption = {
  id: number;
  username: string;
  display_name: string;
};

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, usersRes] = await Promise.all([
        getAuditLogs({
          page: targetPage,
          pageSize: PAGE_SIZE,
          userId: userId || undefined,
          action: action || undefined,
          entityType: entityType || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        getUsers(),
      ]);
      setItems(logsRes.items);
      setPage(logsRes.pagination.page);
      setTotal(logsRes.pagination.total);
      setUsers(usersRes as unknown as UserOption[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "审计日志加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-lg font-bold">审计日志</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-sm">
            用户
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">全部</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} ({user.username})
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            操作
            <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="如 login / update / delete" />
          </label>
          <label className="text-sm">
            实体
            <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="如 product / invoice" />
          </label>
          <label className="text-sm">
            开始日期
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="text-sm">
            结束日期
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void load(1)}>筛选</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setUserId("");
              setAction("");
              setEntityType("");
              setDateFrom("");
              setDateTo("");
              void load(1);
            }}
          >
            重置
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? <SkeletonTable rows={6} columns={5} /> : null}
        {error ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="ghost" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : null}
        {!loading ? (
          <>
            <Table>
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600">
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">用户</th>
                  <th className="px-3 py-2">动作</th>
                  <th className="px-3 py-2">实体</th>
                  <th className="px-3 py-2">详情</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{formatDateTime(item.createdAt)}</td>
                    <td className="px-3 py-2">{item.user ? `${item.user.displayName} (${item.user.username})` : "-"}</td>
                    <td className="px-3 py-2">{item.action}</td>
                    <td className="px-3 py-2">
                      {item.entityType}
                      {item.entityId ? ` #${item.entityId}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <code className="line-clamp-2 block max-w-xs overflow-hidden rounded bg-slate-100 px-2 py-1 text-xs">
                        {typeof item.details === "string" ? item.details : JSON.stringify(item.details)}
                      </code>
                    </td>
                    <td className="px-3 py-2">{item.ipAddress || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="mt-3">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={(p) => void load(p)}
              />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
