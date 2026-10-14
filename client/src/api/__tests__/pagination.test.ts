import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "../pagination";
import type { PaginatedData } from "../../types";

function page<T>(items: T[], p: number, pageSize: number, total: number): PaginatedData<T> {
  return {
    items,
    pagination: { page: p, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

describe("fetchAllPages", () => {
  it("跨页汇总全部条目", async () => {
    // 共 250 条，每页 100 → 3 页
    const all = Array.from({ length: 250 }, (_, i) => i + 1);
    const fetchPage = vi.fn(async (p: number, size: number) =>
      page(all.slice((p - 1) * size, p * size), p, size, all.length)
    );

    const result = await fetchAllPages<number>(fetchPage, { pageSize: 100 });

    expect(result).toEqual(all);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("单页数据只请求一次", async () => {
    const fetchPage = vi.fn(async (p: number, size: number) => page([1, 2, 3], p, size, 3));
    const result = await fetchAllPages<number>(fetchPage, { pageSize: 100 });
    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("空集合返回空数组", async () => {
    const fetchPage = vi.fn(async (p: number, size: number) => page<number>([], p, size, 0));
    expect(await fetchAllPages<number>(fetchPage)).toEqual([]);
  });

  it("pagination 缺失时也能安全结束（防止死循环）", async () => {
    const fetchPage = vi.fn(async () => ({ items: [1, 2] }) as unknown as PaginatedData<number>);
    expect(await fetchAllPages<number>(fetchPage, { pageSize: 100 })).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("达到 maxPages 上限即停止", async () => {
    // 每页都满且 totalPages 报很大，maxPages 兜底防止无限循环
    const fetchPage = vi.fn(async (p: number, size: number) =>
      page(Array.from({ length: size }, (_, i) => i), p, size, 10_000)
    );
    await fetchAllPages<number>(fetchPage, { pageSize: 100, maxPages: 3 });
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });
});
