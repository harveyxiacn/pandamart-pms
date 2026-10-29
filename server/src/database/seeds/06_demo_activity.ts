import { Knex } from 'knex';

/**
 * 演示数据补全（续 05_demo_data）：
 * 05 只覆盖采购侧（发票/库存/日志），系统里因此没有销售、批次、应付和别名，
 * 导致「销售出库」「批次保质期」「应付账款」三个模块打开都是空的，分析页的
 * 营业额/毛利/畅销/滞销也全部为 0。
 *
 * 本种子补齐这四类数据，并让商品具备零售价与保质期属性：
 * - products.selling_price / is_perishable / shelf_life_days
 * - inventory_batches：按当前库存拆分为 1–3 个批次，含临期、过期、已报损样本
 * - sales_orders / sales_items：近 60 天的销售流水（少量作废单），保留成本快照
 * - supplier_payments：部分发票全额/部分付款，形成未结应付
 * - supplier_product_aliases：供应商货号 / 名称别名，供 OCR 学习匹配
 * - notifications / audit_logs：由以上数据派生的提醒与操作记录
 *
 * 可重复执行：已有销售单时整体跳过。
 */
export async function seed(knex: Knex): Promise<void> {
  const existingSale = await knex('sales_orders').first();
  if (existingSale) return;

  // ============ 辅助函数 ============
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];
  const round2 = (n: number) => Math.round(n * 100) / 100;

  /** 本地日期 YYYY-MM-DD（不经过 UTC，避免跨时区偏一天） */
  const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /** mysql2 会把 DATE 列读成 Date，统一转回 YYYY-MM-DD */
  const dateKey = (value: any) => (value instanceof Date ? localDate(value) : String(value).slice(0, 10));

  const dateAt = (daysAgo: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, rand(0, 59), rand(0, 59), 0);
    return d;
  };

  const shiftDate = (d: Date, days: number) => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + days);
    return copy;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const admin = await knex('users').where('username', 'admin').first();
  const staff = await knex('users').where('username', 'staff01').first();
  const adminId = admin?.id || 1;
  const staffId = staff?.id || 2;

  // ============ 1. 零售价 + 保质期属性 ============
  const products: any[] = await knex('products').select(
    'id',
    'sku',
    'name_en',
    'default_price',
    'default_unit',
    'default_supplier_id'
  );

  const shelfLifeByPrefix: Record<string, number> = {
    VEG: 7,
    FRT: 12,
    MEA: 6,
    SEA: 45,
    TOF: 14,
    FRZ: 240,
  };

  for (const p of products) {
    const prefix = String(p.sku).split('-')[0];
    const shelfLife = shelfLifeByPrefix[prefix] ?? null;
    // 毛利 28%–48%，按 SKU 稳定，重复生成结果一致
    const markup = 1.28 + ((p.id * 37) % 21) / 100;
    const cost = Number(p.default_price);
    await knex('products')
      .where('id', p.id)
      .update({
        selling_price: round2(cost * markup),
        is_perishable: shelfLife !== null,
        shelf_life_days: shelfLife,
      });
  }

  const productRows = await knex('products').select(
    'id',
    'sku',
    'name_en',
    'default_price',
    'selling_price',
    'default_unit',
    'default_supplier_id',
    'is_perishable',
    'shelf_life_days'
  );
  const productById = new Map<number, any>(productRows.map((p: any) => [p.id, p]));

  // ============ 2. 库存批次 ============
  const inventoryRows = await knex('inventory')
    .where('store_id', 1)
    .select('product_id', 'quantity');
  const qtyByProduct = new Map<number, number>(
    inventoryRows.map((r: any) => [r.product_id, Number(r.quantity)])
  );

  const batchInserts: any[] = [];

  for (const p of productRows) {
    if (!p.is_perishable) continue;
    const qty = qtyByProduct.get(p.id) ?? 0;

    // 已报损批次（数量已扣完，保留历史）
    if (qty > 0 && Math.random() < 0.08) {
      const expiry = shiftDate(today, -rand(3, 20));
      batchInserts.push({
        product_id: p.id,
        store_id: 1,
        batch_no: `BN-${p.sku}-D`,
        expiry_date: localDate(expiry),
        received_date: localDate(shiftDate(expiry, -p.shelf_life_days)),
        quantity: 0,
        status: 'disposed',
        invoice_id: null,
        note: '过期报损',
        created_by: adminId,
        created_at: dateAt(rand(1, 10), rand(9, 16)),
        updated_at: dateAt(rand(0, 5), rand(9, 16)),
      });
    }

    if (qty <= 0) continue;

    // 1–3 个批次，数量合计必须等于 inventory.quantity
    const lotCount = Math.min(qty, rand(1, 3));
    const parts: number[] = [];
    let remaining = qty;
    for (let i = 0; i < lotCount - 1; i++) {
      const maxPart = remaining - (lotCount - i - 1);
      const part = rand(1, Math.max(1, Math.floor(maxPart / 2)));
      parts.push(part);
      remaining -= part;
    }
    parts.push(remaining);

    // 首个批次可能是临期或已过期（仍计入库存，等待报损/优先售出）
    const roll = Math.random();
    let firstExpiryOffset: number;
    if (roll < 0.1) firstExpiryOffset = -rand(1, 6); // 已过期
    else if (roll < 0.32) firstExpiryOffset = rand(1, 6); // 临期
    else firstExpiryOffset = rand(7, Math.max(8, p.shelf_life_days + 10));

    parts.forEach((part, i) => {
      const offset = i === 0 ? firstExpiryOffset : rand(8, Math.max(9, p.shelf_life_days + 14));
      const expiry = shiftDate(today, offset);
      const received = shiftDate(expiry, -p.shelf_life_days);
      batchInserts.push({
        product_id: p.id,
        store_id: 1,
        batch_no: `BN-${p.sku}-${String(i + 1).padStart(2, '0')}`,
        expiry_date: localDate(expiry),
        received_date: localDate(received),
        quantity: part,
        status: 'active',
        invoice_id: null,
        note: offset < 0 ? '已过期，待报损' : offset <= 6 ? '临期，优先售出' : null,
        created_by: pick([adminId, staffId]),
        created_at: dateAt(rand(3, 25), rand(9, 17)),
        updated_at: dateAt(rand(0, 2), rand(9, 17)),
      });
    });
  }

  for (let i = 0; i < batchInserts.length; i += 200) {
    await knex('inventory_batches').insert(batchInserts.slice(i, i + 200));
  }

  // ============ 3. 销售流水（近 60 天） ============
  const sellable = productRows.filter(
    (p: any) => p.selling_price != null && Number(p.selling_price) > 0
  );

  const orders: Array<{ order: any; items: any[] }> = [];
  let orderSeq = 0;

  for (let day = 60; day >= 0; day--) {
    const d = dateAt(day, 0);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const orderCount = day === 0 ? rand(6, 10) : weekend ? rand(7, 12) : rand(4, 8);

    for (let i = 0; i < orderCount; i++) {
      const itemCount = rand(1, 5);
      const selected = [...sellable].sort(() => Math.random() - 0.5).slice(0, itemCount);
      const items = selected.map((p: any) => {
        const quantity = rand(1, 6);
        // 少量促销价，让营业额波动更真实
        const promo = Math.random() < 0.12 ? 0.9 : 1;
        const unitPrice = round2(Number(p.selling_price) * promo);
        return {
          product_id: p.id,
          quantity,
          unit: p.default_unit,
          unit_price: unitPrice,
          cost_price: Number(p.default_price),
          line_total: round2(unitPrice * quantity),
        };
      });
      const total = round2(items.reduce((s, it) => s + it.line_total, 0));

      const createdAt = dateAt(
        day,
        day === 0 ? rand(8, Math.max(9, new Date().getHours())) : rand(9, 20)
      );
      const voided = Math.random() < 0.025;
      orderSeq += 1;

      orders.push({
        order: {
          store_id: 1,
          order_no: `SO-${localDate(d).replace(/-/g, '')}-${String(orderSeq).padStart(4, '0')}`,
          total,
          status: voided ? 'voided' : 'completed',
          note: voided ? pick(['顾客取消', '重复开单', '收银误操作']) : null,
          sold_by: Math.random() < 0.8 ? staffId : adminId,
          voided_by: voided ? adminId : null,
          voided_at: voided ? shiftDate(createdAt, 0) : null,
          created_at: createdAt,
          updated_at: createdAt,
        },
        items,
      });
    }
  }

  for (let i = 0; i < orders.length; i += 60) {
    const chunk = orders.slice(i, i + 60);
    await knex('sales_orders').insert(chunk.map(o => o.order));

    const inserted: any[] = await knex('sales_orders')
      .whereIn(
        'order_no',
        chunk.map(o => o.order.order_no)
      )
      .select('id', 'order_no');
    const idByOrderNo = new Map<string, number>(inserted.map((r: any) => [r.order_no, r.id]));

    const itemInserts = chunk.flatMap(o =>
      o.items.map(it => ({
        ...it,
        sales_order_id: idByOrderNo.get(o.order.order_no),
        created_at: o.order.created_at,
      }))
    );
    for (let j = 0; j < itemInserts.length; j += 300) {
      await knex('sales_items').insert(itemInserts.slice(j, j + 300));
    }
  }

  // ============ 4. 供应商付款 ============
  const confirmedInvoices: any[] = await knex('invoices')
    .where('status', 'confirmed')
    .whereNotNull('supplier_id')
    .select('id', 'supplier_id', 'grand_total', 'invoice_date');

  const paymentInserts: any[] = [];
  const methods = ['e-transfer', 'cheque', 'cash', 'wire'];

  for (const inv of confirmedInvoices) {
    const roll = Math.random();
    if (roll < 0.28) continue; // 未付款，形成应付

    const grandTotal = Number(inv.grand_total);
    const amount = roll < 0.88 ? grandTotal : round2(grandTotal * (0.4 + Math.random() * 0.3));

    const invoiceDate = new Date(`${dateKey(inv.invoice_date)}T12:00:00`);
    let paidAt = shiftDate(invoiceDate, rand(3, 22));
    if (paidAt > today) paidAt = new Date(today);

    paymentInserts.push({
      supplier_id: inv.supplier_id,
      invoice_id: inv.id,
      amount,
      method: pick(methods),
      paid_at: localDate(paidAt),
      note: amount < grandTotal ? '部分付款' : null,
      created_by: Math.random() < 0.7 ? adminId : staffId,
      created_at: paidAt,
    });
  }

  for (let i = 0; i < paymentInserts.length; i += 200) {
    await knex('supplier_payments').insert(paymentInserts.slice(i, i + 200));
  }

  // ============ 5. 供应商商品别名 ============
  const supplierCodes: any[] = await knex('suppliers').select('id', 'code');
  const supplierCodeById = new Map<number, string>(supplierCodes.map((s: any) => [s.id, s.code]));

  const aliasInserts: any[] = [];
  for (const p of productRows) {
    if (!p.default_supplier_id) continue;
    const code = supplierCodeById.get(p.default_supplier_id);
    if (!code) continue;

    aliasInserts.push({
      supplier_id: p.default_supplier_id,
      alias_type: 'code',
      alias_key: `${code}-${p.sku}`,
      product_id: p.id,
      hits: rand(1, 12),
    });

    if (Math.random() < 0.5) {
      aliasInserts.push({
        supplier_id: p.default_supplier_id,
        alias_type: 'name',
        alias_key: String(p.name_en).toLowerCase().replace(/[^a-z0-9]/g, ''),
        product_id: p.id,
        hits: rand(1, 8),
      });
    }
  }

  for (let i = 0; i < aliasInserts.length; i += 200) {
    try {
      await knex('supplier_product_aliases').insert(aliasInserts.slice(i, i + 200));
    } catch {
      // 归一化后可能撞唯一键，逐条重试并跳过重复项
      for (const alias of aliasInserts.slice(i, i + 200)) {
        try {
          await knex('supplier_product_aliases').insert(alias);
        } catch {
          /* 已存在则跳过 */
        }
      }
    }
  }

  // ============ 6. 临期提醒通知 ============
  const expiringBatches: any[] = await knex('inventory_batches')
    .join('products', 'inventory_batches.product_id', 'products.id')
    .where('inventory_batches.status', 'active')
    .where('inventory_batches.quantity', '>', 0)
    .whereNotNull('inventory_batches.expiry_date')
    .where('inventory_batches.expiry_date', '<=', localDate(shiftDate(today, 7)))
    .orderBy('inventory_batches.expiry_date', 'asc')
    .limit(8)
    .select(
      'inventory_batches.*',
      'products.name_en',
      'products.name_zh'
    );

  const notifInserts = expiringBatches.map((b: any) => {
    const expiry = dateKey(b.expiry_date);
    const expired = expiry < localDate(today);
    return {
      user_id: adminId,
      type: 'stock_alert',
      title: expired ? '批次已过期' : '批次临期提醒',
      message: `${b.name_en}${b.name_zh ? ` (${b.name_zh})` : ''} 批次 ${b.batch_no || b.id} 数量 ${Number(
        b.quantity
      )}，到期日 ${expiry}${expired ? '，已过期请及时报损' : ''}`,
      is_read: 0,
      link: '/batches',
      created_at: dateAt(rand(0, 3), rand(8, 18)),
    };
  });

  if (notifInserts.length > 0) {
    await knex('notifications').insert(notifInserts);
  }

  // ============ 7. 销售审计日志 ============
  const saleAudits: any[] = [];
  const sampleOrders = await knex('sales_orders')
    .where('status', 'completed')
    .orderBy('id', 'desc')
    .limit(40)
    .select('id', 'total', 'created_at', 'sold_by');

  for (const o of sampleOrders) {
    saleAudits.push({
      user_id: o.sold_by,
      action: 'create_sale',
      entity_type: 'sales_order',
      entity_id: o.id,
      details: JSON.stringify({ total: Number(o.total) }),
      ip_address: '127.0.0.1',
      created_at: o.created_at,
    });
  }

  if (saleAudits.length > 0) {
    await knex('audit_logs').insert(saleAudits);
  }
}
