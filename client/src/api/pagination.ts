import type { PaginatedData } from "../types";

/**
 * 循环拉取全部分页，得到完整列表。
 *
 * 背景：服务端 parsePagination 将 pageSize 上限钳制为 100，任何「一次请求 200/500/1000 条」的
 * 调用都会被静默截断到 100 条——商品选择器只能选到前 100 个商品、盘点只能盘前 100 个商品。
 * 需要完整集合的场景（选择器、盘点、导出下拉）改用本函数逐页拉取。
 *
 * 终止条件：到达最后一页、返回条数不足一页、或达到 maxPages 上限（防御服务端分页异常导致死循环）。
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedData<T>>,
  options: { pageSize?: number; maxPages?: number } = {}
): Promise<T[]> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 200;
  const all: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchPage(page, pageSize);
    const items = data?.items ?? [];
    all.push(...items);

    const totalPages = data?.pagination?.totalPages ?? 1;
    if (page >= totalPages || items.length < pageSize) break;
  }

  return all;
}
