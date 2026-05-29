import db from '../config/database';
import { SalesOrderModel } from '../models/SalesOrder';
import { AuditLogModel } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import { inventoryService, adjustStockTx } from './inventory.service';
import { DEFAULT_STORE_ID } from '../config/store';
import { CreateSaleBody } from '../types';

function generateOrderNo(): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SO-${stamp}-${now.getTime().toString().slice(-6)}${rand}`;
}

export const salesService = {
  async create(body: CreateSaleBody, userId: number) {
    if (!body.items || body.items.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '销售单至少需要一项商品');
    }

    const storeId = DEFAULT_STORE_ID;
    const affectedProducts: Array<{ productId: number; after: number }> = [];

    const result = await db.transaction(async (trx) => {
      // 校验商品并计算金额（库存校验+扣减在 adjustStockTx 内带行锁完成，杜绝并发超卖）
      let total = 0;
      const lines: Array<{
        productId: number;
        quantity: number;
        unit: string;
        unitPrice: number;
        costPrice: number | null;
        lineTotal: number;
        label: string;
      }> = [];

      for (const item of body.items) {
        if (!item.productId || !(item.quantity > 0)) {
          throw new AppError(400, 'VALIDATION_ERROR', '商品或数量无效');
        }

        const product = await trx('products')
          .where('id', item.productId)
          .whereNull('deleted_at')
          .first();
        if (!product) {
          throw new AppError(404, 'NOT_FOUND', `商品(ID ${item.productId})不存在`);
        }

        const unitPrice = Number(item.unitPrice);
        const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
        total += lineTotal;

        lines.push({
          productId: item.productId,
          quantity: item.quantity,
          unit: product.default_unit || 'Case',
          unitPrice,
          costPrice: product.default_price != null ? Number(product.default_price) : null,
          lineTotal,
          label: `${product.name_en}${product.name_zh ? ` (${product.name_zh})` : ''}`,
        });
      }

      total = Math.round(total * 100) / 100;

      const [orderId] = await trx('sales_orders').insert({
        store_id: storeId,
        order_no: generateOrderNo(),
        total,
        status: 'completed',
        note: body.note || null,
        sold_by: userId,
      });

      for (const line of lines) {
        await trx('sales_items').insert({
          sales_order_id: orderId,
          product_id: line.productId,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unitPrice,
          cost_price: line.costPrice,
          line_total: line.lineTotal,
        });

        // 带行锁的扣减 + 日志；库存不足直接抛错回滚整单
        const { after } = await adjustStockTx(trx, {
          productId: line.productId,
          storeId,
          delta: -line.quantity,
          type: 'out',
          reason: '销售出库',
          salesOrderId: orderId,
          userId,
          unit: line.unit,
          preventNegative: true,
          label: line.label,
        });

        affectedProducts.push({ productId: line.productId, after });
      }

      return { orderId, total };
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'create_sale',
      entity_type: 'sales_order',
      entity_id: result.orderId,
      details: JSON.stringify({ total: result.total, itemCount: body.items.length }),
    });

    // 事务外检查库存预警（避免在事务里发通知）
    for (const p of affectedProducts) {
      await inventoryService.checkStockAlert(p.productId, p.after);
    }

    return this.getById(result.orderId);
  },

  async list(filters: any) {
    const { items, total } = await SalesOrderModel.findAll(filters);
    const pagination = buildPagination(filters.page || 1, filters.pageSize || 20, total);
    return {
      items: items.map((o: any) => ({
        id: o.id,
        orderNo: o.order_no,
        total: Number(o.total),
        status: o.status,
        note: o.note,
        soldBy: o.sold_by_name,
        voidedAt: o.voided_at,
        createdAt: o.created_at,
      })),
      pagination,
    };
  },

  async getById(id: number) {
    const order = await SalesOrderModel.findById(id);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', '销售单不存在');
    }
    const items = await SalesOrderModel.findItems(id);
    return {
      id: order.id,
      orderNo: order.order_no,
      total: Number(order.total),
      status: order.status,
      note: order.note,
      soldBy: order.sold_by_name,
      voidedAt: order.voided_at,
      createdAt: order.created_at,
      items: items.map((it: any) => ({
        id: it.id,
        productId: it.product_id,
        nameEn: it.product_name_en,
        nameZh: it.product_name_zh,
        sku: it.product_sku,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unit_price),
        costPrice: it.cost_price != null ? Number(it.cost_price) : null,
        lineTotal: Number(it.line_total),
      })),
    };
  },

  async void(id: number, userId: number) {
    const storeId = DEFAULT_STORE_ID;
    const restocked: Array<{ productId: number; after: number }> = [];

    await db.transaction(async (trx) => {
      const order = await trx('sales_orders').where('id', id).first();
      if (!order) {
        throw new AppError(404, 'NOT_FOUND', '销售单不存在');
      }
      if (order.status === 'voided') {
        throw new AppError(400, 'ALREADY_VOIDED', '销售单已作废');
      }

      const items = await trx('sales_items').where('sales_order_id', id);
      for (const it of items) {
        const { after } = await adjustStockTx(trx, {
          productId: it.product_id,
          storeId,
          delta: Number(it.quantity),
          type: 'in',
          reason: '销售作废回补',
          salesOrderId: id,
          userId,
          unit: it.unit,
        });
        restocked.push({ productId: it.product_id, after });
      }

      await trx('sales_orders').where('id', id).update({
        status: 'voided',
        voided_by: userId,
        voided_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'void_sale',
      entity_type: 'sales_order',
      entity_id: id,
      details: JSON.stringify({ restocked: restocked.length }),
    });

    return this.getById(id);
  },
};
