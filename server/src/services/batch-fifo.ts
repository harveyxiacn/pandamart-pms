/**
 * 批次 FIFO 分配（纯函数，便于单测）。
 *
 * 目标：销售出库时把扣减量按「先到期先出」摊到具体批次上，使批次剩余量合计与库存总量保持一致，
 * 并让临期/过期预警反映真实库存。见优化报告 DATA-5 与迁移 019/023。
 *
 * 选择顺序（升序 = 越靠前越先被消耗）：
 *   1. 未过期优先于已过期（过期批次仍可被消耗，但只在正常批次耗尽后，以便不制造人为漂移）；
 *   2. 到期日升序，无到期日（null）排最后；
 *   3. 收货日升序，无收货日排最后；
 *   4. 批次 id 升序（稳定排序，保证结果可复现）。
 *
 * 不变量：allocations 各 amount 之和 + unallocated === min(requested, 可用总量)。
 * 库存总量以 inventory.quantity 为准：批次不足以覆盖时余量计入 unallocated，不阻塞销售。
 */

export interface FifoBatch {
  id: number;
  quantity: number | string;
  expiry_date?: string | Date | null;
  received_date?: string | Date | null;
}

export interface FifoAllocation {
  batchId: number;
  quantity: number;
}

export interface FifoPlan {
  allocations: FifoAllocation[];
  /** 批次无法覆盖的余量（>= 0）。为 0 表示批次台账与本次扣减完全对齐。 */
  unallocated: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 把 DATE 列（Date 或 'YYYY-MM-DD' 字符串）统一成 'YYYY-MM-DD'；无法解析返回 null。 */
export function toDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}

function isExpired(expiry: string | Date | null | undefined, today: string): boolean {
  const key = toDateKey(expiry);
  return key !== null && key < today;
}

/** 比较器：null 排最后。 */
function compareNullableAsc(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareFifo(a: FifoBatch, b: FifoBatch, today: string): number {
  const aExpired = isExpired(a.expiry_date, today) ? 1 : 0;
  const bExpired = isExpired(b.expiry_date, today) ? 1 : 0;
  if (aExpired !== bExpired) return aExpired - bExpired;

  const byExpiry = compareNullableAsc(toDateKey(a.expiry_date), toDateKey(b.expiry_date));
  if (byExpiry !== 0) return byExpiry;

  const byReceived = compareNullableAsc(toDateKey(a.received_date), toDateKey(b.received_date));
  if (byReceived !== 0) return byReceived;

  return a.id - b.id;
}

/**
 * 按 FIFO 规划分配。requested <= 0 或无可扣批次时返回空分配。
 * @param today 本地日历日 'YYYY-MM-DD'，用于「是否过期」判定；默认取当前日期。
 */
export function planFifoAllocation(
  batches: FifoBatch[],
  requested: number,
  today: string = toDateKey(new Date()) as string
): FifoPlan {
  const want = round2(Number(requested));
  if (!Number.isFinite(want) || want <= 0) {
    return { allocations: [], unallocated: 0 };
  }

  const candidates = batches
    .filter((b) => Number(b.quantity) > 0)
    .sort((a, b) => compareFifo(a, b, today));

  const allocations: FifoAllocation[] = [];
  let remaining = want;

  for (const batch of candidates) {
    if (remaining <= 0) break;
    const available = round2(Number(batch.quantity));
    const take = round2(Math.min(available, remaining));
    if (take <= 0) continue;
    allocations.push({ batchId: batch.id, quantity: take });
    remaining = round2(remaining - take);
  }

  return { allocations, unallocated: round2(Math.max(0, remaining)) };
}
