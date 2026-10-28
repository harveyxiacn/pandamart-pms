import { useEffect, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import type { NotificationItem } from "../types";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Pagination } from "../components/ui/Pagination";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { useToast } from "../components/ui/Toast";
import { formatDateTime } from "../utils/formatters";

export default function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 服务端 pageSize 上限 100：改为真实分页，避免通知超出一页时被静默截断
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const load = async (targetPage = page, targetPageSize = pageSize) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications({ page: targetPage, pageSize: targetPageSize });
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
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
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
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">系统通知</h2>
          <Button variant="ghost" onClick={() => void handleMarkAllRead()}>
            全部标记已读
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? <SkeletonTable rows={5} columns={3} /> : null}
        {error ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-danger">{error}</p>
            <Button variant="ghost" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : null}
        {!loading ? (
          <div className="space-y-2">
            {items.length === 0 ? (
              <><p className="text-sm text-slate-500">暂无通知</p><p className="text-xs text-slate-400 mt-1">系统会在库存不足、发票待处理等情况下自动发送通知。</p></>
            ) : (
              items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={item.is_read ? "default" : "warning"}>{item.is_read ? "已读" : "未读"}</Badge>
                      {!item.is_read ? (
                        <Button variant="ghost" onClick={() => void handleMarkRead(item.id)}>
                          标记已读
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
        {!loading && !error && items.length > 0 ? (
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
        ) : null}
      </Card>
    </div>
  );
}
