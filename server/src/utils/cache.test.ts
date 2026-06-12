import { describe, it, expect, beforeEach } from 'vitest';
import { cached, invalidateCache, cacheSize } from './cache';

describe('cache（TTL 进程内缓存）', () => {
  beforeEach(() => invalidateCache());

  it('TTL 内复用缓存值，fn 仅执行一次', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };
    const a = await cached('k1', 1000, fn);
    const b = await cached('k1', 1000, fn);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
  });

  it('TTL=0 立即过期，每次重算', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };
    await cached('k2', 0, fn);
    await cached('k2', 0, fn);
    expect(calls).toBe(2);
  });

  it('不同 key 互不影响', async () => {
    const a = await cached('a', 1000, async () => 'A');
    const b = await cached('b', 1000, async () => 'B');
    expect(a).toBe('A');
    expect(b).toBe('B');
    expect(cacheSize()).toBe(2);
  });

  it('同 key 并发请求共享同一个未完成计算，避免缓存穿透', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return calls;
    };

    const [a, b] = await Promise.all([cached('same', 1000, fn), cached('same', 1000, fn)]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
  });

  it('invalidateCache(prefix) 会阻止已失效的在途计算回填旧值', async () => {
    let resolveFirst: (value: number) => void = () => undefined;
    const first = cached(
      'analytics:dashboard',
      1000,
      () =>
        new Promise<number>((resolve) => {
          resolveFirst = resolve;
        })
    );

    invalidateCache('analytics:');
    resolveFirst(1);
    expect(await first).toBe(1);

    const fresh = await cached('analytics:dashboard', 1000, async () => 2);
    expect(fresh).toBe(2);
  });

  it('invalidateCache(prefix) 仅清匹配前缀', async () => {
    await cached('analytics:dashboard', 1000, async () => 1);
    await cached('analytics:profit', 1000, async () => 2);
    await cached('other:x', 1000, async () => 3);
    invalidateCache('analytics:');
    expect(cacheSize()).toBe(1);
  });

  it('invalidateCache() 全清', async () => {
    await cached('x', 1000, async () => 1);
    await cached('y', 1000, async () => 2);
    invalidateCache();
    expect(cacheSize()).toBe(0);
  });
});
