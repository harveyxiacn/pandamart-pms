import { describe, it, expect } from 'vitest';
import { planFifoAllocation, compareFifo, toDateKey, FifoBatch } from './batch-fifo';

const b = (
  id: number,
  quantity: number,
  expiry_date: string | null = null,
  received_date: string | null = null
): FifoBatch => ({ id, quantity, expiry_date, received_date });

describe('toDateKey', () => {
  it('把 Date 归一化为本地日历日', () => {
    expect(toDateKey(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('解析 YYYY-MM-DD 字符串（忽略时间部分）', () => {
    expect(toDateKey('2026-03-05')).toBe('2026-03-05');
    expect(toDateKey('2026-03-05T10:20:30.000Z')).toBe('2026-03-05');
  });

  it('空值/非法值返回 null', () => {
    expect(toDateKey(null)).toBeNull();
    expect(toDateKey(undefined)).toBeNull();
    expect(toDateKey('not-a-date')).toBeNull();
  });
});

describe('planFifoAllocation', () => {
  const today = '2026-06-15';

  it('按到期日升序扣减，无到期日排最后', () => {
    const batches = [b(1, 10, '2026-08-01'), b(2, 10, null), b(3, 10, '2026-07-01')];
    const plan = planFifoAllocation(batches, 15, today);
    expect(plan.allocations).toEqual([
      { batchId: 3, quantity: 10 },
      { batchId: 1, quantity: 5 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it('未过期批次优先于已过期批次（过期仅在正常批次耗尽后消耗）', () => {
    const batches = [b(1, 10, '2026-05-01'), b(2, 10, '2026-09-01')];
    const plan = planFifoAllocation(batches, 15, today);
    expect(plan.allocations).toEqual([
      { batchId: 2, quantity: 10 },
      { batchId: 1, quantity: 5 },
    ]);
  });

  it('批次不足时余量计入 unallocated，不抛错', () => {
    const plan = planFifoAllocation([b(1, 3, '2026-07-01'), b(2, 2, '2026-08-01')], 10, today);
    expect(plan.allocations).toEqual([
      { batchId: 1, quantity: 3 },
      { batchId: 2, quantity: 2 },
    ]);
    expect(plan.unallocated).toBe(5);
  });

  it('忽略数量 <= 0 的批次', () => {
    const plan = planFifoAllocation([b(1, 0, '2026-07-01'), b(2, 5, '2026-08-01')], 5, today);
    expect(plan.allocations).toEqual([{ batchId: 2, quantity: 5 }]);
    expect(plan.unallocated).toBe(0);
  });

  it('数量为 0 或负数时返回空分配', () => {
    expect(planFifoAllocation([b(1, 5)], 0, today)).toEqual({ allocations: [], unallocated: 0 });
    expect(planFifoAllocation([b(1, 5)], -3, today)).toEqual({ allocations: [], unallocated: 0 });
  });

  it('无批次时不分配、余量等于需求量', () => {
    const plan = planFifoAllocation([], 7, today);
    expect(plan.allocations).toEqual([]);
    expect(plan.unallocated).toBe(7);
  });

  it('到期日相同则按收货日、再按 id 稳定排序', () => {
    const batches = [
      b(5, 1, '2026-07-01', '2026-06-10'),
      b(2, 1, '2026-07-01', '2026-06-01'),
      b(9, 1, '2026-07-01', '2026-06-01'),
    ];
    const plan = planFifoAllocation(batches, 3, today);
    expect(plan.allocations.map((a) => a.batchId)).toEqual([2, 9, 5]);
  });

  it('分配总量守恒：allocated + unallocated === min(需求, 可用)', () => {
    const batches = [b(1, 4.5, '2026-07-01'), b(2, 3.25, '2026-08-01')];
    const plan = planFifoAllocation(batches, 6, today);
    const allocated = plan.allocations.reduce((s, a) => s + a.quantity, 0);
    expect(allocated).toBeCloseTo(6, 5);
    expect(plan.unallocated).toBe(0);
  });
});

describe('compareFifo', () => {
  it('排序与 compareFifo 一致（未过期在前、过期在后；桶内到期日升序、null 最后）', () => {
    // id=1 无到期日（视为不过期）；id=2 已过期；id=3 未过期
    const arr = [b(1, 1, null), b(2, 1, '2026-04-01'), b(3, 1, '2026-07-01')];
    const sorted = [...arr].sort((x, y) => compareFifo(x, y, '2026-06-15'));
    expect(sorted.map((x) => x.id)).toEqual([3, 1, 2]);
  });
});
