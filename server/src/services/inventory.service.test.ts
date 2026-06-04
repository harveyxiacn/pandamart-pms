import { describe, it, expect } from 'vitest';
import { resolveStockChange } from './inventory.service';
import { AppError } from '../middleware/errorHandler';

describe('resolveStockChange（库存增减决策，adjustStockTx 的纯逻辑）', () => {
  it('正常入库：after = before + delta，loggedQty = |delta|', () => {
    expect(resolveStockChange(10, 5)).toEqual({ after: 15, loggedQty: 5 });
  });

  it('正常出库（不越界）：after 递减，loggedQty 为正幅度', () => {
    expect(resolveStockChange(10, -4)).toEqual({ after: 6, loggedQty: 4 });
  });

  it('preventNegative：库存不足时抛 INSUFFICIENT_STOCK(400)', () => {
    expect(() => resolveStockChange(3, -5, { preventNegative: true, label: '苹果' })).toThrow(AppError);
    try {
      resolveStockChange(3, -5, { preventNegative: true, label: '苹果' });
    } catch (e) {
      expect((e as AppError).statusCode).toBe(400);
      expect((e as AppError).code).toBe('INSUFFICIENT_STOCK');
    }
  });

  it('clampToZero：扣到 0，loggedQty = before（实际可扣量）', () => {
    expect(resolveStockChange(3, -5, { clampToZero: true })).toEqual({ after: 0, loggedQty: 3 });
  });

  it('既不 preventNegative 也不 clampToZero：允许为负（手动调整/回滚）', () => {
    expect(resolveStockChange(2, -5)).toEqual({ after: -3, loggedQty: 5 });
  });
});
