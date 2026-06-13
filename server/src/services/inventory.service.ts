import { Knex } from 'knex';
import db from '../config/database';
import { InventoryModel } from '../models/Inventory';
import { InventoryLogModel } from '../models/InventoryLog';
import { ProductModel } from '../models/Product';
import { AuditLogModel } from '../models/AuditLog';
import { SettingModel } from '../models/Setting';
import { InventoryLogType } from '../types';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import { invalidateAnalyticsCache } from '../utils/cache';
import { DEFAULT_STORE_ID } from '../config/store';
import { notificationService } from './notification.service';

export interface AdjustStockOptions {
  productId: number;
  storeId: number;
  delta: number; // 正数入库，负数出库
  type: InventoryLogType;
  reason?: string | null;
  invoiceId?: number | null;
  salesOrderId?: number | null;
  userId: number;
  unit?: string;
  preventNegative?: boolean; // 库存不足直接报错（销售出库用）
  clampToZero?: boolean; // 扣减不低于 0，按实际可扣量记录（报损用）
  label?: string; // 报错信息里的商品名
}

/**
 * 纯函数：根据当前库存 before 与增量 delta 计算结果库存与应记录的数量。
 * 抽出以便单元测试三条分支（preventNegative 抛错 / clampToZero 扣到 0 / 正常增减），
 * 不依赖数据库。loggedQty 为记入 inventory_logs 的数量幅度（始终非负）。
 */
export function resolveStockChange(
  before: number,
  delta: number,
  opts: { preventNegative?: boolean; clampToZero?: boolean; label?: string } = {}
): { after: number; loggedQty: number } {
  let after = before + delta;
  let loggedQty = Math.abs(delta);

  if (after < 0) {
    if (opts.preventNegative) {
      throw new AppError(
        400,
        'INSUFFICIENT_STOCK',
        `${opts.label || '商品'} 库存不足（现有 ${before}，需出 ${Math.abs(delta)}）`
      );
    }
    if (opts.clampToZero) {
      loggedQty = before; // 实际只能扣这么多
      after = 0;
    }
  }

  return { after, loggedQty };
}

/**
 * 纯函数：把手动库存调整请求映射为带符号的库存增量 delta（供 adjustStockTx 使用）。
 * 抽出以便单元测试三条分支，不依赖数据库。
 * - 'out'   出库：delta = -|quantity|，且 quantity<=0 直接拒绝（出库必须为正数量）。
 * - 'adjust' 手工调整：原样使用带符号的 quantity（允许正负，UI 可发负数表示减少）。
 * - 'stocktake' 盘点：delta = 目标库存 - 当前库存（currentBefore 为加锁读到的现值）。
 */
export function resolveAdjustDelta(
  type: 'adjust' | 'out' | 'stocktake',
  quantity: number,
  currentBefore: number
): number {
  if (type === 'out') {
    if (!(quantity > 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', '出库数量必须大于 0');
    }
    return -Math.abs(quantity);
  }
  if (type === 'stocktake') {
    return quantity - currentBefore;
  }
  // 'adjust'：原样使用带符号数量
  return quantity;
}

/**
 * 事务内统一的库存读-改-写 + 写 inventory_logs。
 * 用 forUpdate() 行锁消除并发超卖/少扣（销售、批次入库、报损、作废回补、发票入库/回滚共用）。
 */
export async function adjustStockTx(
  trx: Knex.Transaction,
  opts: AdjustStockOptions
): Promise<{ before: number; after: number }> {
  const inv = await trx('inventory')
    .where('product_id', opts.productId)
    .where('store_id', opts.storeId)
    .forUpdate()
    .first();

  const before = Number(inv?.quantity || 0);
  const { after, loggedQty } = resolveStockChange(before, opts.delta, {
    preventNegative: opts.preventNegative,
    clampToZero: opts.clampToZero,
    label: opts.label,
  });

  if (inv) {
    await trx('inventory')
      .where('product_id', opts.productId)
      .where('store_id', opts.storeId)
      .update({ quantity: after, updated_at: trx.fn.now() });
  } else {
    await trx('inventory').insert({
      product_id: opts.productId,
      store_id: opts.storeId,
      quantity: after,
      unit: opts.unit || 'Case',
    });
  }

  await trx('inventory_logs').insert({
    product_id: opts.productId,
    store_id: opts.storeId,
    type: opts.type,
    quantity: loggedQty,
    quantity_before: before,
    quantity_after: after,
    invoice_id: opts.invoiceId ?? null,
    sales_order_id: opts.salesOrderId ?? null,
    reason: opts.reason ?? null,
    operated_by: opts.userId,
    created_at: trx.fn.now(),
  });

  return { before, after };
}

export const inventoryService = {
  async getAll(filters: any) {
    const result = await InventoryModel.findAll(filters);
    const pagination = buildPagination(filters.page || 1, filters.pageSize || 20, result.total);

    const items = result.items.map((item: any) => ({
      id: item.id,
      product: {
        id: item.product_id,
        nameEn: item.name_en,
        nameZh: item.name_zh,
        sku: item.sku,
        category: item.category_name,
      },
      quantity: Number(item.quantity),
      unit: item.unit,
      safeStock: item.safe_stock ? Number(item.safe_stock) : null,
      isLowStock: item.safe_stock ? Number(item.quantity) < Number(item.safe_stock) : false,
      lastRestockDate: item.last_restock_date,
      lastRestockQuantity: item.last_restock_quantity ? Number(item.last_restock_quantity) : null,
    }));

    return { items, pagination, summary: result.summary };
  },

  async adjust(
    productId: number,
    type: 'adjust' | 'out' | 'stocktake',
    quantity: number,
    reason: string | null,
    userId: number
  ) {
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', '产品不存在');
    }

    const label = `${product.name_en}${product.name_zh ? ` (${product.name_zh})` : ''}`;

    // 统一走带行锁的 adjustStockTx：消除非事务读-改-写竞态、补齐 store_id、修正 'out' 符号。
    const { before, after } = await db.transaction(async (trx) => {
      // 盘点需要拿当前（加锁）库存来算差值；出库/调整的 delta 与 before 无关。
      let currentBefore = 0;
      if (type === 'stocktake') {
        const locked = await trx('inventory')
          .where('product_id', productId)
          .where('store_id', DEFAULT_STORE_ID)
          .forUpdate()
          .first();
        currentBefore = Number(locked?.quantity || 0);
      }

      const delta = resolveAdjustDelta(type, quantity, currentBefore);

      return adjustStockTx(trx, {
        productId,
        storeId: DEFAULT_STORE_ID,
        delta,
        type,
        reason,
        userId,
        label,
      });
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'adjust_inventory',
      entity_type: 'inventory',
      entity_id: productId,
      details: JSON.stringify({ type, quantity, before, after, reason }),
    });

    invalidateAnalyticsCache();

    // 检查库存预警（仅在跨越安全库存阈值时通知）
    await this.checkStockAlert(productId, after, before);

    return { before, after };
  },

  async setSafeStock(productId: number, safeStock: number, userId: number) {
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', '产品不存在');
    }

    await InventoryModel.setSafeStock(productId, safeStock);

    await AuditLogModel.create({
      user_id: userId,
      action: 'update',
      entity_type: 'inventory',
      entity_id: productId,
      details: JSON.stringify({ safeStock }),
    });

    invalidateAnalyticsCache();
  },

  async getLogs(productId: number, filters: any) {
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', '产品不存在');
    }

    const { items, total } = await InventoryLogModel.findByProductId(productId, filters);
    const pagination = buildPagination(filters.page || 1, filters.pageSize || 20, total);

    const formattedItems = items.map((item: any) => ({
      id: item.id,
      type: item.type,
      quantity: Number(item.quantity),
      quantityBefore: Number(item.quantity_before),
      quantityAfter: Number(item.quantity_after),
      invoiceNumber: item.invoice_number || null,
      reason: item.reason,
      operatedBy: item.operated_by_name,
      createdAt: item.created_at,
    }));

    return { items: formattedItems, pagination };
  },

  async stocktake(
    items: Array<{
      productId: number;
      actualQuantity: number;
      systemQuantity: number;
      notes: string;
    }>,
    notes: string,
    userId: number
  ) {
    const results: Array<{ productId: number; before: number; after: number; diff: number }> = [];

    // 整批盘点放在同一事务内逐项 adjustStockTx（带行锁），保证跨项原子性。
    await db.transaction(async (trx) => {
      for (const item of items) {
        // 加锁读当前库存作为基准，按绝对值盘点：delta = 实盘 - 当前库存。
        const locked = await trx('inventory')
          .where('product_id', item.productId)
          .where('store_id', DEFAULT_STORE_ID)
          .forUpdate()
          .first();
        const currentBefore = Number(locked?.quantity || 0);
        const delta = item.actualQuantity - currentBefore;
        if (delta === 0) continue;

        const { before, after } = await adjustStockTx(trx, {
          productId: item.productId,
          storeId: DEFAULT_STORE_ID,
          delta,
          type: 'stocktake',
          reason: item.notes || notes || '盘点调整',
          userId,
        });

        results.push({ productId: item.productId, before, after, diff: after - before });
      }
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'stocktake',
      entity_type: 'inventory',
      details: JSON.stringify({ itemCount: items.length, notes, adjustments: results.length }),
    });

    if (results.length > 0) {
      invalidateAnalyticsCache();
    }

    // 事务外检查库存预警（仅在跨越安全库存阈值时通知）
    for (const r of results) {
      await this.checkStockAlert(r.productId, r.after, r.before);
    }

    return { adjustedCount: results.length, results };
  },

  async checkStockAlert(productId: number, currentQuantity: number, previousQuantity?: number) {
    const inv = await InventoryModel.findByProductId(productId);
    if (!inv || !inv.safe_stock) return;

    const alertEnabled = await SettingModel.get('stock_alert_enabled');
    if (alertEnabled !== 'true') return;

    const safeStock = Number(inv.safe_stock);
    if (currentQuantity >= safeStock) return;

    // 去重：仅在“跨越安全库存阈值”的那一次通知（上一次还在阈值之上、本次跌破），
    // 避免持续低于阈值时每笔出库都发一封邮件。previousQuantity 缺省时回退为旧行为（每次都通知）。
    if (previousQuantity !== undefined && previousQuantity < safeStock) return;

    const product = await ProductModel.findById(productId);
    if (!product) return;

    const message = `${product.name_en}${product.name_zh ? ` (${product.name_zh})` : ''} 库存仅剩 ${currentQuantity}，低于安全库存 ${inv.safe_stock}`;
    const link = `/inventory?productId=${productId}`;

    // 走 notificationService（启用时会发送邮件），而非仅落库的原始模型。
    await notificationService.createForAllAdmins('stock_alert', '库存预警', message, link);
  },
};
