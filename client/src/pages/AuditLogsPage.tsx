import { useEffect, useState } from "react";
import { Filter, RotateCcw, ScrollText } from "lucide-react";
import { getAuditLogs, type AuditLogItem } from "../api/auditLogs";
import { getUsers } from "../api/users";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import { Table, Td, Th } from "../components/ui/Table";
import { Badge } from "../components/ui/Badge";
import { Toolbar, ToolbarGroup } from "../components/ui/Toolbar";
import { DateRangePicker } from "../components/ui/DatePicker";
import { Pagination } from "../components/ui/Pagination";
import { EmptyState } from "../components/ui/EmptyState";
import { formatDateTime } from "../utils/formatters";
import type { DateRange } from "../utils/date";

const PAGE_SIZE = 30;

type UserOption = {
  id: number;
  username: string;
  display_name: string;
};

const actionTone: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  login: "info",
  logout: "default",
  create: "success",
  update: "warning",
  delete: "danger",
  confirm: "success",
  reject: "danger",
  upload: "info",
};

export default function AuditLogsPage() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
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
          dateFrom: dateRange.start || undefined,
          dateTo: dateRange.end || undefined,
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

  const reset = () => {
    setUserId("");
    setAction("");
    setEntityType("");
    setDateRange({ start: null, end: null });
    void load(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="审计日志"
        description="记录登录、数据变更与关键业务操作，用于追溯与合规检查。"
        meta={`共 ${total} 条记录`}
      />

      <Card>
        <Toolbar stacked>
          <ToolbarGroup grow>
            <Select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label="按用户筛选"
              className="w-auto min-w-[10rem]"
            >
              <option value="">全部用户</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} ({user.username})
                </option>
              ))}
            </Select>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="动作，如 login / update"
              aria-label="按动作筛选"
              className="w-auto min-w-[12rem]"
            />
            <Input
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="实体，如 product / invoice"
              aria-label="按实体筛选"
              className="w-auto min-w-[12rem]"
            />
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              label="按日期筛选"
              className="w-auto min-w-[13rem]"
            />
          </ToolbarGroup>
          <ToolbarGroup>
            <Button leadingIcon={Filter} onClick={() => void load(1)}>
              筛选
            </Button>
            <Button variant="ghost" leadingIcon={RotateCcw} onClick={reset}>
              重置
            </Button>
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        {loading ? <SkeletonTable rows={8} columns={6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={ScrollText}
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
          <EmptyState icon={ScrollText} title="没有匹配的日志" description="调整筛选条件或清除筛选后重试。" />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>时间</Th>
                  <Th>用户</Th>
                  <Th>动作</Th>
                  <Th>实体</Th>
                  <Th>详情</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <Td className="whitespace-nowrap tabular text-meta">{formatDateTime(item.createdAt)}</Td>
                    <Td>
                      {item.user ? (
                        <span className="text-ink">
                          {item.user.displayName}
                          <span className="ml-1 text-meta text-ink-subtle">@{item.user.username}</span>
                        </span>
                      ) : (
                        <span className="text-ink-subtle">系统</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={actionTone[item.action] ?? "default"}>{item.action}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-meta">
                      {item.entityType}
                      {item.entityId ? <span className="text-ink-subtle"> #{item.entityId}</span> : null}
                    </Td>
                    <Td>
                      <code className="line-clamp-2 block max-w-xs overflow-hidden rounded-md bg-surface-inset px-2 py-1 font-mono text-[11px] text-ink-muted">
                        {typeof item.details === "string" ? item.details : JSON.stringify(item.details)}
                      </code>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[11px] text-ink-subtle">
                      {item.ipAddress || "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={(p) => void load(p)} />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
