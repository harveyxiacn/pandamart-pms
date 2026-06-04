import { describe, it, expect } from 'vitest';
import { formatSaleItem } from './sales.service';

const row = {
  id: 1,
  product_id: 7,
  product_name_en: 'Apple',
  product_name_zh: '苹果',
  product_sku: 'A-7',
  quantity: '3',
  unit: 'Case',
  unit_price: '9.50',
  cost_price: '6.00',
  line_total: '28.50',
};

describe('formatSaleItem（销售明细财务脱敏，PRD §2.6）', () => {
  it('admin 可见成本价 costPrice，并正确数值化', () => {
    const r = formatSaleItem(row, 'admin');
    expect(r.costPrice).toBe(6);
    expect(r.unitPrice).toBe(9.5);
    expect(r.lineTotal).toBe(28.5);
    expect(r.quantity).toBe(3);
  });

  it('staff 响应中不包含 costPrice 字段（仅成本对店员隐藏）', () => {
    const r = formatSaleItem(row, 'staff');
    expect('costPrice' in r).toBe(false);
    // 售价/数量等一线收银所需字段仍可见
    expect(r.unitPrice).toBe(9.5);
    expect(r.lineTotal).toBe(28.5);
  });

  it('cost_price 为 null 时 admin 得到 null', () => {
    const r = formatSaleItem({ ...row, cost_price: null }, 'admin');
    expect(r.costPrice).toBeNull();
  });
});
