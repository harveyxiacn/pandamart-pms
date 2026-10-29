import { useEffect, useState } from "react";
import {
  BellOff,
  CheckCheck,
  FileText,
  Info,
  Package,
  TrendingUp,
} from "lucide-react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import type { NotificationItem } from "../types";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Pagination } from "../components/ui/Pagination";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { useToast } from "../components/ui/Toast";
import { formatDateTime } from "../utils/formatters";
import { cn } from "../utils/classnames";

const typeMeta = {
  stock_alert: { icon: Package, label: "库存告警", tone: "warning" as const },
  price_alert: { icon: TrendingUp, label: "价格波动", tone: "info" as const },
  invoice: { icon: FileText, label: "发票", tone: "success" as const },
  system: { icon: Info, label: "系统", tone: "default" as const },
};

export default function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications({
        page: targetPage,
        pageSize: targetPageSize,
        isRead: filter === "unread" ? false : undefined,
      });
      setItems(data.items);
      setTotal(data.pagination.total);
      setPage(data.pagination.page);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载通知失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      toast.success("已将全部通知标记为已读");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markNotificationRead(id);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="通知中心"
        description="库存不足、价格波动与发票处理进度会在这里提醒。"
        actions={
          <Button
            variant="secondary"
            leadingIcon={CheckCheck}
            onClick={() => void handleMarkAllRead()}
            disabled={items.every((item) => item.is_read)}
          >
            全部标记已读
          </Button>
        }
      />

      <Card padded={false} className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl
            label="通知范围"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "全部" },
              { value: "unread", label: "未读" },
            ]}
          />
          <span className="text-meta text-ink-subtle">
            共 <span className="font-medium tabular text-ink-muted">{total}</span> 条
          </span>
        </div>

        {loading ? <SkeletonTable rows={5} columns={3} /> : null}
        {!loading && error ? (
          <EmptyState
            icon={BellOff}
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
            icon={BellOff}
            title={filter === "unread" ? "没有未读通知" : "暂无通知"}
            description="系统会在库存不足、价格异常或发票待处理时自动发送通知。"
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <>
            <ul className="space-y-2">
              {items.map((item) => {
                const meta = typeMeta[item.type] ?? typeMeta.system;
                const Icon = meta.icon;
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors",
                      item.is_read
                        ? "border-line bg-surface"
                        : "border-accent/25 bg-accent-soft/40"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        item.type === "stock_alert"
                          ? "bg-warning-soft text-warning"
                          : item.type === "price_alert"
                            ? "bg-accent-soft text-accent"
                            : item.type === "invoice"
                              ? "bg-success-soft text-success"
                              : "bg-surface-inset text-ink-muted"
                      )}
                    >
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-body", item.is_read ? "font-medium text-ink-muted" : "font-semibold text-ink")}>
                          {item.title}
                        </p>
                        <Badge size="sm" tone={meta.tone}>
                          {meta.label}
                        </Badge>
                        {!item.is_read ? <Badge size="sm" tone="info">未读</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-muted">{item.message}</p>
                      <p className="mt-1 text-meta tabular text-ink-subtle">{formatDateTime(item.created_at)}</p>
                    </div>
                    {!item.is_read ? (
                      <Button variant="ghost" size="sm" onClick={() => void handleMarkRead(item.id)}>
                        标记已读
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
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
    </div>
  );
}
