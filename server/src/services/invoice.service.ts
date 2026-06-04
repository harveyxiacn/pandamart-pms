import fs from 'fs';
import path from 'path';
import { InvoiceModel } from '../models/Invoice';
import { InvoiceItemModel } from '../models/InvoiceItem';
import { ProductModel } from '../models/Product';
import { InventoryModel } from '../models/Inventory';
import { InventoryLogModel } from '../models/InventoryLog';
import { SupplierModel } from '../models/Supplier';
import { SupplierTemplateModel } from '../models/SupplierTemplate';
import { AuditLogModel } from '../models/AuditLog';
import { NotificationModel } from '../models/Notification';
import { SettingModel } from '../models/Setting';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import { ConfirmInvoiceBody, UpdateInvoiceBody } from '../types';
import db from '../config/database';
import { adjustStockTx } from './inventory.service';
import { DEFAULT_STORE_ID } from '../config/store';

function parseOcrRaw(raw: any): any {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export const invoiceService = {
  async getAll(filters: any) {
    const { items, total } = await InvoiceModel.findAll(filters);
    const pagination = buildPagination(
      filters.page || 1,
      filters.pageSize || 20,
      total
    );

    // 批量获取 item counts，消除 N+1 查询
    const invoiceIds = items.map((inv: any) => inv.id);
    const itemCountMap: Record<number, number> = {};
    if (invoiceIds.length > 0) {
      const counts = await db('invoice_items')
        .select('invoice_id')
        .count('id as count')
        .whereIn('invoice_id', invoiceIds)
        .groupBy('invoice_id');
      for (const row of counts) {
        itemCountMap[Number(row.invoice_id)] = Number(row.count);
      }
    }

    const formattedItems = items.map((inv: any) => {
      const supplierName = inv.supplier_name || null;
      return {
        id: inv.id,
        supplierName,
        invoiceNumber: inv.invoice_number,
        invoiceDate: inv.invoice_date,
        grandTotal: Number(inv.grand_total),
        itemCount: itemCountMap[inv.id] || 0,
        status: inv.status,
        ocrMethod: inv.ocr_method,
        uploadedBy: inv.uploaded_by_name,
        confirmedBy: inv.confirmed_by_name,
        createdAt: inv.created_at,
      };
    });

    return { items: formattedItems, pagination };
  },

  async getById(id: number, viewerRole: 'admin' | 'staff' = 'admin') {
    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', '发票不存在');
    }
    if (viewerRole === 'staff' && invoice.status !== 'pending') {
      throw new AppError(403, 'FORBIDDEN', '店员仅可访问待处理发票');
    }

    const items = await InvoiceItemModel.findByInvoiceId(id);
    const ocrRawResult: any = parseOcrRaw(invoice.ocr_raw_result) || invoice.ocr_raw_result;

    return {
      id: invoice.id,
      supplier: invoice.supplier_id
        ? { id: invoice.supplier_id, name: invoice.supplier_name }
        : null,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      customerCode: invoice.customer_code,
      items: items.map((item: any) => ({
        id: item.id,
        product: item.product_id
          ? {
              id: item.product_id,
              nameEn: item.product_name_en,
              nameZh: item.product_name_zh,
            }
          : null,
        rawNameEn: item.raw_name_en,
        rawNameZh: item.raw_name_zh,
        rawProductCode: item.raw_product_code,
        rawProductNumber: item.raw_product_number,
        rawUn: item.raw_un,
        rawTaxCode: item.raw_tax_code,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
      })),
      subtotal: invoice.subtotal ? Number(invoice.subtotal) : null,
      hasTax: !!invoice.has_tax,
      taxAmount: invoice.tax_amount ? Number(invoice.tax_amount) : null,
      grandTotal: Number(invoice.grand_total),
      filePath: invoice.file_path,
      fileType: invoice.file_type,
      ocrMethod: invoice.ocr_method,
      ocrRawResult,
      status: invoice.status,
      uploadedBy: {
        id: invoice.uploaded_by,
        displayName: invoice.uploaded_by_name,
      },
      confirmedBy: invoice.confirmed_by
        ? { id: invoice.confirmed_by, displayName: invoice.confirmed_by_name }
        : null,
      confirmedAt: invoice.confirmed_at,
      notes: invoice.notes,
      createdAt: invoice.created_at,
    };
  },

  async updatePending(id: number, body: UpdateInvoiceBody, userId: number) {
    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', '发票不存在');
    }
    if (invoice.status !== 'pending') {
      throw new AppError(422, 'BUSINESS_ERROR', '仅待处理发票可修改');
    }
    if (!body.invoiceNumber?.trim()) {
      throw new AppError(400, 'BAD_REQUEST', '发票号不能为空');
    }
    if (!body.invoiceDate?.trim()) {
      throw new AppError(400, 'BAD_REQUEST', '发票日期不能为空');
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new AppError(400, 'BAD_REQUEST', '至少需要 1 条发票明细');
    }

    await InvoiceItemModel.deleteByInvoiceId(id);

    for (const item of body.items) {
      await InvoiceItemModel.create({
        invoice_id: id,
        product_id: item.productId,
        raw_name_en: item.productNameEn || null,
        raw_name_zh: item.productNameZh || null,
        raw_product_code: item.productCode || null,
        raw_product_number: item.productNumber || null,
        raw_un: item.un || null,
        raw_tax_code: item.taxCode || null,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
      });
    }

    await InvoiceModel.update(id, {
      supplier_id: body.supplierId,
      invoice_number: body.invoiceNumber.trim(),
      invoice_date: new Date(body.invoiceDate),
      customer_code: body.customerCode || null,
      subtotal: body.subtotal,
      has_tax: !!body.hasTax,
      tax_amount: body.taxAmount,
      grand_total: body.grandTotal,
      notes: body.notes || null,
    } as any);

    await AuditLogModel.create({
      user_id: userId,
      action: 'update_invoice',
      entity_type: 'invoice',
      entity_id: id,
      details: JSON.stringify({
        invoiceNumber: body.invoiceNumber,
        itemCount: body.items.length,
        supplierId: body.supplierId,
      }),
    });

    return this.getById(id);
  },

  async deletePendingOrRejected(id: number, userId: number) {
    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', '发票不存在');
    }
    if (invoice.status === 'confirmed') {
      throw new AppError(422, 'BUSINESS_ERROR', '已确认发票不可删除');
    }

    await InvoiceModel.delete(id);

    if (invoice.file_path) {
      const resolvedPath = path.resolve(__dirname, '../../', invoice.file_path);
      if (fs.existsSync(resolvedPath)) {
        try {
          fs.unlinkSync(resolvedPath);
        } catch {
          // ignore delete file errors
        }
      }
    }

    await AuditLogModel.create({
      user_id: userId,
      action: 'delete_invoice',
      entity_type: 'invoice',
      entity_id: id,
      details: JSON.stringify({ status: invoice.status, invoiceNumber: invoice.invoice_number }),
    });
  },

  async rollbackConfirm(id: number, userId: number, reason: string) {
    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', '发票不存在');
    }
    if (invoice.status !== 'confirmed') {
      throw new AppError(422, 'BUSINESS_ERROR', '仅已确认发票可回滚');
    }

    const items = await InvoiceItemModel.findByInvoiceId(id);
    const rollbackReason = (reason || '').trim() || '管理员回滚未确认';

    await db.transaction(async (trx) => {
      for (const item of items) {
        const productId = item.product_id ? Number(item.product_id) : null;
        if (!productId) continue;

        const delta = -Number(item.quantity || 0);
        if (!Number.isFinite(delta) || delta === 0) continue;

        // 统一走带行锁、按门店范围的库存原语（消除并发丢更新、补齐 store_id）
        await adjustStockTx(trx, {
          productId,
          storeId: DEFAULT_STORE_ID,
          delta,
          type: 'adjust',
          reason: `rollback_confirm: ${rollbackReason}`,
          invoiceId: id,
          userId,
          unit: item.unit || 'EA',
        });
      }

      const rollbackStamp = new Date().toISOString();
      const nextNotes = invoice.notes
        ? `${invoice.notes}\n[${rollbackStamp}] ${rollbackReason}`
        : `[${rollbackStamp}] ${rollbackReason}`;

      await trx('invoices')
        .where({ id })
        .update({
          status: 'pending',
          confirmed_by: null,
          confirmed_at: null,
          notes: nextNotes,
          updated_at: trx.fn.now(),
        });

      await trx('audit_logs').insert({
        user_id: userId,
        action: 'rollback_confirm_invoice',
        entity_type: 'invoice',
        entity_id: id,
        details: JSON.stringify({
          reason: rollbackReason,
          invoiceNumber: invoice.invoice_number,
          itemCount: items.length,
        }),
        created_at: trx.fn.now(),
      });
    });

    return this.getById(id);
  },

  async confirm(id: number, body: ConfirmInvoiceBody, userId: number, viewerRole: 'admin' | 'staff' = 'admin') {
    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', '发票不存在');
    }
    if (invoice.status !== 'pending') {
      throw new AppError(422, 'BUSINESS_ERROR', '该发票已被处理');
    }

    // 防重复入库：同一供应商 + 发票号若已有其它已确认发票，则拦截。
    // PRD 将"重复发票"列为驳回原因；重复确认会虚增库存与应付，必须在入库前阻断。
    if (body.supplierId && body.invoiceNumber) {
      const dup = await db('invoices')
        .where('supplier_id', body.supplierId)
        .where('invoice_number', body.invoiceNumber)
        .where('status', 'confirmed')
        .whereNot('id', id)
        .first();
      if (dup) {
        throw new AppError(
          409,
          'DUPLICATE_INVOICE',
          `该供应商已存在相同发票号(${body.invoiceNumber})的已确认发票(#${dup.id})，疑似重复入库`
        );
      }
    }

    let newProductsCreated = 0;
    let inventoryUpdated = 0;
    const priceAlerts: any[] = [];

    const priceThreshold = Number(await SettingModel.get('price_alert_threshold') || '0.1');

    await db.transaction(async (trx) => {
      // 清除旧的 invoice_items
      await trx('invoice_items').where('invoice_id', id).delete();

      for (const item of body.items) {
        let productId = item.productId;

        // 新产品自动创建
        if (item.isNewProduct && !productId) {
          const [newId] = await trx('products').insert({
            name_en: item.productNameEn,
            name_zh: item.productNameZh || null,
            category_id: item.categoryId || null,
            default_supplier_id: body.supplierId || null,
            default_unit: item.unit,
            default_price: item.unitPrice,
          });
          productId = newId;

          const existingInv = await trx('inventory').where('product_id', productId).first();
          if (existingInv) {
            await trx('inventory').where('product_id', productId).update({ unit: item.unit, updated_at: trx.fn.now() });
          } else {
            await trx('inventory').insert({ product_id: productId, store_id: DEFAULT_STORE_ID, quantity: 0, unit: item.unit });
          }

          newProductsCreated++;
        }

        // 创建发票明细
        await trx('invoice_items').insert({
          invoice_id: id,
          product_id: productId,
          raw_name_en: item.productNameEn,
          raw_name_zh: item.productNameZh || null,
          raw_product_code: item.productCode || null,
          raw_product_number: item.productNumber || null,
          raw_un: item.un || null,
          raw_tax_code: item.taxCode || null,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
        });

        // 更新库存（统一走带行锁、按门店范围的库存原语，消除与销售并发的丢更新、补齐 store_id）
        if (productId) {
          await adjustStockTx(trx, {
            productId,
            storeId: DEFAULT_STORE_ID,
            delta: item.quantity,
            type: 'in',
            invoiceId: id,
            userId,
            unit: item.unit,
          });

          await trx('inventory')
            .where('product_id', productId)
            .where('store_id', DEFAULT_STORE_ID)
            .update({
              last_restock_date: body.invoiceDate,
              last_restock_quantity: item.quantity,
              updated_at: trx.fn.now(),
            });

          inventoryUpdated++;

          // 价格波动检测
          const priceHistory = await trx('invoice_items')
            .select('invoice_items.unit_price')
            .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
            .where('invoice_items.product_id', productId)
            .where('invoices.status', 'confirmed')
            .orderBy('invoices.invoice_date', 'desc')
            .limit(2);

          if (priceHistory.length >= 2) {
            const prevPrice = Number(priceHistory[1].unit_price);
            const currPrice = item.unitPrice;
            if (prevPrice > 0) {
              const changePercent = ((currPrice - prevPrice) / prevPrice) * 100;
              if (Math.abs(changePercent) > priceThreshold * 100) {
                const product = await trx('products').where('id', productId).first();
                priceAlerts.push({
                  productId,
                  productName: `${product?.name_en || ''} ${product?.name_zh || ''}`.trim(),
                  previousPrice: prevPrice,
                  currentPrice: currPrice,
                  changePercent: Math.round(changePercent * 10) / 10,
                });
              }
            }
          }

          // 更新产品默认价格
          await trx('products').where('id', productId).whereNull('deleted_at')
            .update({ default_price: item.unitPrice, updated_at: trx.fn.now() });
        }
      }

      // 更新发票状态
      await trx('invoices').where({ id }).update({
        supplier_id: body.supplierId,
        invoice_number: body.invoiceNumber,
        invoice_date: new Date(body.invoiceDate),
        customer_code: body.customerCode,
        subtotal: body.subtotal,
        has_tax: !!body.hasTax,
        tax_amount: body.taxAmount,
        grand_total: body.grandTotal,
        status: 'confirmed',
        confirmed_by: userId,
        confirmed_at: new Date(),
        notes: body.notes,
        updated_at: trx.fn.now(),
      });

      await trx('audit_logs').insert({
        user_id: userId,
        action: 'confirm_invoice',
        entity_type: 'invoice',
        entity_id: id,
        details: JSON.stringify({
          invoiceNumber: body.invoiceNumber,
          grandTotal: body.grandTotal,
          newProductsCreated,
          inventoryUpdated,
        }),
        created_at: trx.fn.now(),
      });
    });

    // 事务外：发送通知（非关键操作）
    for (const alert of priceAlerts) {
      try {
        await NotificationModel.createForAllAdmins({
          type: 'price_alert',
          title: '价格异常波动',
          message: `${alert.productName} 价格从 $${alert.previousPrice} 变为 $${alert.currentPrice}（${alert.changePercent > 0 ? '+' : ''}${alert.changePercent}%）`,
          link: `/products/${alert.productId}/price-history`,
        });
      } catch { /* ignore notification errors */ }
    }

    // 更新供应商模板
    if (body.supplierId && invoice.ocr_raw_result) {
      try {
        await SupplierTemplateModel.incrementSuccess(body.supplierId);
      } catch { /* ignore */ }
    }

    return {
      invoiceId: id,
      status: 'confirmed',
      newProductsCreated,
      inventoryUpdated,
      priceAlerts: viewerRole === 'admin' ? priceAlerts : [],
    };
  },

  async reject(id: number, reason: string, userId: number) {
    const invoice = await InvoiceModel.findById(id);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', '发票不存在');
    }
    if (invoice.status !== 'pending') {
      throw new AppError(422, 'BUSINESS_ERROR', '该发票已被处理');
    }

    await InvoiceModel.update(id, {
      status: 'rejected',
      confirmed_by: userId,
      confirmed_at: new Date(),
      notes: reason,
    } as any);

    await AuditLogModel.create({
      user_id: userId,
      action: 'reject_invoice',
      entity_type: 'invoice',
      entity_id: id,
      details: JSON.stringify({ reason }),
    });
  },
};
