import { t, useLanguage } from "../i18n";
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

const actionLabels: Record<string, string> = {
  "login": "登录系统",
  "adjust_inventory": "调整库存",
  "change_password": "修改密码",
  "confirm_invoice": "确认入库",
  "create_batch": "创建批次",
  "create_product": "创建产品",
  "create_sale": "登记销售",
  "create_supplier": "创建供应商",
  "create_user": "创建用户",
  "delete_invoice": "删除发票",
  "delete_product": "删除产品",
  "dispose_batch": "批次报损",
  "import_products": "导入产品",
  "record_payment": "登记付款",
  "reject_invoice": "驳回发票",
  "reset_password": "重置密码",
  "rollback_invoice": "回滚发票",
  "stocktake": "库存盘点",
  "update_invoice": "更新发票",
  "update_product": "更新产品",
  "update_settings": "更新设置",
  "update_supplier": "更新供应商",
  "update_user_status": "更新用户状态",
  "update_user": "更新用户",
  "upload_invoice": "上传发票",
  "void_sale": "作废销售单"
};
const entityLabels: Record<string, string> = {
  "invoice": "发票",
  "product": "产品",
  "supplier": "供应商",
  "user": "用户",
  "inventory": "库存",
  "sales_order": "销售单",
  "batch": "库存批次",
  "setting": "系统设置",
  "payment": "付款记录"
};

export default function AuditLogsPage() {
  useLanguage();
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
      setError(err instanceof Error ? err.message : t("审计日志加载失败"));
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
        title={t("审计日志")}
        description={t("记录登录、数据变更与关键业务操作，用于追溯与合规检查。")}
        meta={t("共 {0} 条记录", total)}
      />

      <Card>
        <Toolbar stacked>
          <ToolbarGroup grow>
            <Select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              aria-label={t("按用户筛选")}
              className="w-auto min-w-[10rem]"
            >
              <option value="">{t("全部用户")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name} ({user.username})
                </option>
              ))}
            </Select>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder={t("动作，如 login / update")}
              aria-label={t("按动作筛选")}
              className="w-auto min-w-[12rem]"
            />
            <Input
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder={t("实体，如 product / invoice")}
              aria-label={t("按实体筛选")}
              className="w-auto min-w-[12rem]"
            />
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              label={t("按日期筛选")}
              className="w-auto min-w-[13rem]"
            />
          </ToolbarGroup>
          <ToolbarGroup>
            <Button leadingIcon={Filter} onClick={() => void load(1)}>{t("筛选")}</Button>
            <Button variant="ghost" leadingIcon={RotateCcw} onClick={reset}>{t("重置")}</Button>
          </ToolbarGroup>
        </Toolbar>
      </Card>

      <Card padded={false} className="p-4 sm:p-5">
        {loading ? <SkeletonTable rows={8} columns={6} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={ScrollText}
            title={t("加载失败")}
            description={error}
            action={
              <Button variant="ghost" onClick={() => void load()}>{t("重试")}</Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState icon={ScrollText} title={t("没有匹配的日志")} description={t("调整筛选条件或清除筛选后重试。")} />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("时间")}</Th>
                  <Th>{t("用户")}</Th>
                  <Th>{t("动作")}</Th>
                  <Th>{t("实体")}</Th>
                  <Th>{t("详情")}</Th>
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
                        <span className="text-ink-subtle">{t("系统")}</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={actionTone[item.action] ?? "default"}>{t(actionLabels[item.action] ?? item.action)}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-meta">
                      {t(entityLabels[item.entityType] ?? item.entityType)}
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
