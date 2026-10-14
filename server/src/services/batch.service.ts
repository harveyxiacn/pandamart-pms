import { Knex } from 'knex';
import db from '../config/database';
import { InventoryBatchModel } from '../models/InventoryBatch';
import { AuditLogModel } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import { adjustStockTx } from './inventory.service';
import { planFifoAllocation, toDateKey } from './batch-fifo';
import { DEFAULT_STORE_ID } from '../config/store';
import { CreateBatchBody } from '../types';
import { invalidateAnalyticsCache } from '../utils/cache';
import logger from '../utils/logger';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 按 FIFO 把一次出库量摊到具体批次上（在调用方事务内执行，批次行加 forUpdate 行锁）。
 * - 仅消耗 status='active' 且 quantity>0 的批次；
 * - 未过期批次优先（见 batch-fifo.ts）；批次不足时余量作为 unallocated 返回，不报错；
 * - 记录 sales_item_batches，供作废销售单时精确回补。
 * 无批次的商品（未纳入批次台账）直接返回零分配，行为与改造前一致。
 */
export async function deductBatchesFifo(
  trx: Knex.Transaction,
  opts: {
    productId: number;
    storeId: number;
    quantity: number;
    salesItemId: number;
  }
): Promise<{ allocated: number; unallocated: number; allocations: Array<{ batchId: number; quantity: number }> }> {
  const need = round2(Number(opts.quantity));
  if (!Number.isFinite(need) || need <= 0) {
    return { allocated: 0, unallocated: 0, allocations: [] };
  }

  const batches = await trx('inventory_batches')
    .where('product_id', opts.productId)
    .where('store_id', opts.storeId)
    .where('status', 'active')
    .where('quantity', '>', 0)
    .orderByRaw('expiry_date IS NULL, expiry_date ASC')
    .forUpdate();

  const plan = planFifoAllocation(batches as any, need);
  if (plan.allocations.length === 0) {
    return { allocated: 0, unallocated: plan.unallocated, allocations: [] };
  }

  const byId = new Map<number, any>(batches.map((b: any) => [Number(b.id), b]));

  for (const alloc of plan.allocations) {
    const batch = byId.get(alloc.batchId);
    const remaining = round2(Math.max(0, Number(batch.quantity) - alloc.quantity));
    await trx('inventory_batches')
      .where('id', alloc.batchId)
      .update({
        quantity: remaining,
        status: remaining <= 0 ? 'depleted' : 'active',
        updated_at: trx.fn.now(),
      });

    await trx('sales_item_batches').insert({
      sales_item_id: opts.salesItemId,
      batch_id: alloc.batchId,
      quantity: alloc.quantity,
    });
  }

  const allocated = round2(need - plan.unallocated);
  if (plan.unallocated > 0) {
    logger.warn(
      `批次台账不足以覆盖出库：product=${opts.productId} 需 ${need}，批次仅覆盖 ${allocated}（余 ${plan.unallocated} 记在库存总量）`
    );
  }

  return { allocated, unallocated: plan.unallocated, allocations: plan.allocations };
}

/**
 * 作废销售明细时，把该明细此前消耗的批次量精确回补（原批次回原处）。
 * 回补后批次若为 depleted 则恢复 active；已 disposed（已报损）的批次只回补数量不改状态。
 */
export async function restoreBatchesForSalesItem(
  trx: Knex.Transaction,
  salesItemId: number
): Promise<number> {
  const allocations = await trx('sales_item_batches').where('sales_item_id', salesItemId);
  let restored = 0;

  for (const alloc of allocations) {
    if (!alloc.batch_id) continue; // 批次行已被清理，无可回补
    const batch = await trx('inventory_batches').where('id', alloc.batch_id).forUpdate().first();
    if (!batch) continue;

    const quantity = round2(Number(batch.quantity) + Number(alloc.quantity));
    await trx('inventory_batches')
      .where('id', alloc.batch_id)
      .update({
        quantity,
        // disposed 保持原状（物理已报废）；depleted → active 表示货又回来了
        status: batch.status === 'depleted' ? 'active' : batch.status,
        updated_at: trx.fn.now(),
      });
    restored += 1;
  }

  return restored;
}

/**
 * 发票确认入库时，为「生鲜（is_perishable）」商品按发票日期 + 货架期建立批次，
 * 使后续销售 FIFO 与临期预警能覆盖发票入库的库存（此前只有手动批次入库才建批）。
 * 非生鲜商品不建批（无需保质期跟踪，库存以 inventory.quantity 为准）。
 */
export async function receiveInvoiceBatchTx(
  trx: Knex.Transaction,
  opts: {
    productId: number;
    storeId: number;
    quantity: number;
    invoiceId: number;
    invoiceDate?: string | null;
    userId: number;
  }
): Promise<number | null> {
  const product = await trx('products')
    .where('id', opts.productId)
    .whereNull('deleted_at')
    .first();
  if (!product || !product.is_perishable) return null;

  const quantity = round2(Number(opts.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const receivedDate = toDateKey(opts.invoiceDate) || toDateKey(new Date());
  let expiry: string | null = null;
  if (product.shelf_life_days) {
    const base = new Date(`${receivedDate}T00:00:00`);
    // 用本地日历日格式化，避免 toISOString() 的 UTC 位移导致到期日 ±1 天
    expiry = toDateKey(new Date(base.getTime() + Number(product.shelf_life_days) * 86400000));
  }

  const [batchId] = await trx('inventory_batches').insert({
    product_id: opts.productId,
    store_id: opts.storeId,
    batch_no: null,
    expiry_date: expiry,
    received_date: receivedDate,
    quantity,
    status: 'active',
    invoice_id: opts.invoiceId,
    note: '发票确认入库自动建档',
    created_by: opts.userId,
  });

  return batchId;
}

/**
 * 发票回滚时清理该发票入库时创建的批次（避免批次台账残留）。
 * 已产生的 sales_item_batches 关联因 onDelete SET NULL 保留扣减历史。
 */
export async function removeInvoiceBatchesTx(
  trx: Knex.Transaction,
  invoiceId: number
): Promise<number> {
  return trx('inventory_batches').where('invoice_id', invoiceId).delete();
}

function formatBatch(b: any) {
  return {
    id: b.id,
    productId: b.product_id,
    nameEn: b.product_name_en,
    nameZh: b.product_name_zh,
    sku: b.product_sku,
    batchNo: b.batch_no,
    expiryDate: b.expiry_date,
    receivedDate: b.received_date,
    quantity: Number(b.quantity),
    status: b.status,
    note: b.note,
    createdAt: b.created_at,
  };
}

export const batchService = {
  // 收货入批次：新增批次并同步增加库存
  async create(body: CreateBatchBody, userId: number) {
    if (!body.productId || !(body.quantity > 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', '商品与数量无效');
    }
    const storeId = DEFAULT_STORE_ID;

    const batchId = await db.transaction(async (trx) => {
      const product = await trx('products')
        .where('id', body.productId)
        .whereNull('deleted_at')
        .first();
      if (!product) throw new AppError(404, 'NOT_FOUND', '商品不存在');

      // 未显式给保质期但商品配置了货架期时，按收货日 + 货架期推算（本地日历日，避免 UTC 位移 ±1 天）
      let expiry = body.expiryDate || null;
      if (!expiry && product.shelf_life_days) {
        const base = body.receivedDate ? new Date(body.receivedDate) : new Date();
        expiry = toDateKey(new Date(base.getTime() + product.shelf_life_days * 86400000));
      }

      const [id] = await trx('inventory_batches').insert({
        product_id: body.productId,
        store_id: storeId,
        batch_no: body.batchNo || null,
        expiry_date: expiry,
        received_date: body.receivedDate || toDateKey(new Date()),
        quantity: body.quantity,
        status: 'active',
        invoice_id: body.invoiceId || null,
        note: body.note || null,
        created_by: userId,
      });

      await adjustStockTx(trx, {
        productId: body.productId,
        storeId,
        delta: body.quantity,
        type: 'in',
        reason: '批次入库',
        userId,
        unit: product.default_unit || 'Case',
      });

      return id;
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'create_batch',
      entity_type: 'inventory_batch',
      entity_id: batchId,
      details: JSON.stringify({
        productId: body.productId,
        quantity: body.quantity,
        expiry: body.expiryDate,
      }),
    });

    invalidateAnalyticsCache();

    return { id: batchId };
  },

  // 过期/损耗报损：减少批次数量并同步减库存
  async dispose(
    id: number,
    quantity: number | undefined,
    reason: string | undefined,
    userId: number
  ) {
    const storeId = DEFAULT_STORE_ID;
    await db.transaction(async (trx) => {
      const batch = await trx('inventory_batches').where('id', id).first();
      if (!batch) throw new AppError(404, 'NOT_FOUND', '批次不存在');
      if (batch.status === 'disposed') throw new AppError(400, 'ALREADY_DISPOSED', '批次已报损');

      const disposeQty =
        quantity && quantity > 0
          ? Math.min(quantity, Number(batch.quantity))
          : Number(batch.quantity);
      const remaining = Number(batch.quantity) - disposeQty;

      await trx('inventory_batches')
        .where('id', id)
        .update({
          quantity: remaining,
          status: remaining <= 0 ? 'disposed' : 'active',
          updated_at: trx.fn.now(),
        });

      // 带行锁扣减库存；库存不足时按实际可扣量记录，不为负
      await adjustStockTx(trx, {
        productId: batch.product_id,
        storeId,
        delta: -disposeQty,
        type: 'out',
        reason: reason || '过期报损',
        userId,
        clampToZero: true,
      });
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'dispose_batch',
      entity_type: 'inventory_batch',
      entity_id: id,
      details: JSON.stringify({ quantity, reason }),
    });

    invalidateAnalyticsCache();

    return { id };
  },

  async list(filters: any) {
    const { items, total } = await InventoryBatchModel.list(filters);
    const pagination = buildPagination(filters.page || 1, filters.pageSize || 50, total);
    return { items: items.map(formatBatch), pagination };
  },

  // 临期/过期汇总：用于预警面板。LIMIT 200 防止无界返回（数据量大时拖慢仪表盘/告警聚合）。
  async getExpiringSummary(days: number, limit = 200) {
    const today = toDateKey(new Date()) as string;
    const cutoff = toDateKey(new Date(Date.now() + days * 86400000)) as string;
    const capped = Math.max(1, Math.min(500, Math.trunc(limit) || 200));

    const rows = await db('inventory_batches')
      .join('products', 'inventory_batches.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .where('inventory_batches.status', 'active')
      .where('inventory_batches.quantity', '>', 0)
      .whereNotNull('inventory_batches.expiry_date')
      .where('inventory_batches.expiry_date', '<=', cutoff)
      .select(
        'inventory_batches.*',
        'products.name_en as product_name_en',
        'products.name_zh as product_name_zh',
        'products.sku as product_sku'
      )
      .orderBy('inventory_batches.expiry_date', 'asc')
      .limit(capped);

    const expired = rows.filter(
      (r: any) => r.expiry_date && toDateKey(r.expiry_date)! < today
    );
    const expiring = rows.filter(
      (r: any) => !(r.expiry_date && toDateKey(r.expiry_date)! < today)
    );

    return {
      days,
      expiredCount: expired.length,
      expiringCount: expiring.length,
      items: rows.map((r: any) => ({
        ...formatBatch(r),
        expired: r.expiry_date ? toDateKey(r.expiry_date)! < today : false,
      })),
    };
  },
};
