import { useEffect, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import type { NotificationItem } from "../types";
import { Card } from "../components/ui/Card";
import { SkeletonTable } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { formatDateTime } from "../utils/formatters";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications({ pageSize: 100 });
      setItems(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载通知失败");
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">系统通知</h2>
          <Button
            variant="ghost"
            onClick={async () => {
              await markAllNotificationsRead();
              await load();
            }}
          >
            全部标记已读
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? <SkeletonTable rows={5} columns={3} /> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading ? (
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">暂无通知</p>
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
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await markNotificationRead(item.id);
                            await load();
                          }}
                        >
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
      </Card>
    </div>
  );
}
