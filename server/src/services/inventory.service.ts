import { Knex } from 'knex';
import { InventoryModel } from '../models/Inventory';
import { InventoryLogModel } from '../models/InventoryLog';
import { ProductModel } from '../models/Product';
import { AuditLogModel } from '../models/AuditLog';
import { NotificationModel } from '../models/Notification';
import { SettingModel } from '../models/Setting';
import { InventoryLogType } from '../types';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import { invalidateAnalyticsCache } from '../utils/cache';

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

    const { before, after } = await InventoryModel.adjustQuantity(productId, quantity);

    await InventoryLogModel.create({
      product_id: productId,
      type,
      quantity,
      quantity_before: before,
      quantity_after: after,
      reason,
      operated_by: userId,
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'adjust_inventory',
      entity_type: 'inventory',
      entity_id: productId,
      details: JSON.stringify({ type, quantity, before, after, reason }),
    });

    invalidateAnalyticsCache();

    // 检查库存预警
    await this.checkStockAlert(productId, after);

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
    const results = [];

    for (const item of items) {
      const diff = item.actualQuantity - item.systemQuantity;
      if (diff === 0) continue;

      const { before, after } = await InventoryModel.setQuantity(
        item.productId,
        item.actualQuantity
      );

      await InventoryLogModel.create({
        product_id: item.productId,
        type: 'stocktake',
        quantity: diff,
        quantity_before: before,
        quantity_after: after,
        reason: item.notes || notes || '盘点调整',
        operated_by: userId,
      });

      results.push({ productId: item.productId, before, after, diff });
    }

    await AuditLogModel.create({
      user_id: userId,
      action: 'stocktake',
      entity_type: 'inventory',
      details: JSON.stringify({ itemCount: items.length, notes, adjustments: results.length }),
    });

    if (results.length > 0) {
      invalidateAnalyticsCache();
    }

    return { adjustedCount: results.length, results };
  },

  async checkStockAlert(productId: number, currentQuantity: number) {
    const inv = await InventoryModel.findByProductId(productId);
    if (!inv || !inv.safe_stock) return;

    const alertEnabled = await SettingModel.get('stock_alert_enabled');
    if (alertEnabled !== 'true') return;

    if (currentQuantity < Number(inv.safe_stock)) {
      const product = await ProductModel.findById(productId);
      if (!product) return;

      await NotificationModel.createForAllAdmins({
        type: 'stock_alert',
        title: '库存预警',
        message: `${product.name_en}${product.name_zh ? ` (${product.name_zh})` : ''} 库存仅剩 ${currentQuantity}，低于安全库存 ${inv.safe_stock}`,
        link: `/inventory?productId=${productId}`,
      });
    }
  },
};
