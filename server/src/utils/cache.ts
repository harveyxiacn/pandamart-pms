/**
 * 极简进程内 TTL 缓存（优化报告 PERF-4）。
 * 用于包裹重复命中的只读分析查询（仪表盘、分布、价格波动、补货建议、毛利），
 * 在 TTL 窗口内复用结果，降低低内存 VPS 上 5 连接池的聚合压力，
 * 并抑制 AI 对话单轮内多次工具调用引发的重复扫描。
 *
 * 仅缓存无副作用的读结果；写操作（发票入库/销售）不经此处。
 * 单实例部署足够；多实例需改 Redis。
 */
type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return hit.value as T;
  }
  const inFlight = pending.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const promise = fn().then((value) => {
    if (pending.get(key) === promise) {
      store.set(key, { value, expires: Date.now() + ttlMs });
    }
    return value;
  });
  pending.set(key, promise);

  try {
    return await promise;
  } finally {
    if (pending.get(key) === promise) {
      pending.delete(key);
    }
  }
}

/** 失效缓存：传前缀只清匹配项，不传则全清。写链路可调用以即时刷新。 */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    pending.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  for (const key of pending.keys()) {
    if (key.startsWith(prefix)) pending.delete(key);
  }
}

export function invalidateAnalyticsCache(): void {
  invalidateCache('analytics:');
}

/** 仅供测试/诊断：当前缓存条目数。 */
export function cacheSize(): number {
  return store.size;
}
