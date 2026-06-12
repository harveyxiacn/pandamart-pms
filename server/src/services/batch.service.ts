import db from '../config/database';
import { InventoryBatchModel } from '../models/InventoryBatch';
import { AuditLogModel } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import { adjustStockTx } from './inventory.service';
import { DEFAULT_STORE_ID } from '../config/store';
import { CreateBatchBody } from '../types';
import { invalidateAnalyticsCache } from '../utils/cache';

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

      // 未显式给保质期但商品配置了货架期时，按收货日 + 货架期推算
      let expiry = body.expiryDate || null;
      if (!expiry && product.shelf_life_days) {
        const base = body.receivedDate ? new Date(body.receivedDate) : new Date();
        expiry = new Date(base.getTime() + product.shelf_life_days * 86400000)
          .toISOString()
          .slice(0, 10);
      }

      const [id] = await trx('inventory_batches').insert({
        product_id: body.productId,
        store_id: storeId,
        batch_no: body.batchNo || null,
        expiry_date: expiry,
        received_date: body.receivedDate || new Date().toISOString().slice(0, 10),
        quantity: body.quantity,
        status: 'active',
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

  // 临期/过期汇总：用于预警面板
  async getExpiringSummary(days: number) {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

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
      .orderBy('inventory_batches.expiry_date', 'asc');

    const expired = rows.filter(
      (r: any) => r.expiry_date && r.expiry_date.toISOString().slice(0, 10) < today
    );
    const expiring = rows.filter(
      (r: any) => !(r.expiry_date && r.expiry_date.toISOString().slice(0, 10) < today)
    );

    return {
      days,
      expiredCount: expired.length,
      expiringCount: expiring.length,
      items: rows.map((r: any) => ({
        ...formatBatch(r),
        expired: r.expiry_date ? r.expiry_date.toISOString().slice(0, 10) < today : false,
      })),
    };
  },
};
