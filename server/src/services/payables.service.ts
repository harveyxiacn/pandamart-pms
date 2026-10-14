import db from '../config/database';
import { AuditLogModel } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { invalidateAnalyticsCache } from '../utils/cache';

export const payablesService = {
  // 各供应商应付汇总：已确认发票总额 − 已付款，输出未结清的（含全部，前端可筛）
  async listPayables() {
    const billed = await db('invoices')
      .where('status', 'confirmed')
      .whereNotNull('supplier_id')
      .groupBy('supplier_id')
      .select(
        'supplier_id',
        db.raw('SUM(grand_total) as billed'),
        db.raw('COUNT(*) as invoice_count'),
        db.raw('MAX(invoice_date) as last_invoice_date')
      );

    const paid = await db('supplier_payments')
      .groupBy('supplier_id')
      .select('supplier_id', db.raw('SUM(amount) as paid'));
    const paidMap = new Map<number, number>(paid.map((p: any) => [p.supplier_id, Number(p.paid)]));

    const suppliers = await db('suppliers').select('id', 'name');
    const nameMap = new Map<number, string>(suppliers.map((s: any) => [s.id, s.name]));

    const rows = billed.map((b: any) => {
      const billedAmt = Number(b.billed);
      const paidAmt = paidMap.get(b.supplier_id) || 0;
      return {
        supplierId: b.supplier_id,
        supplierName: nameMap.get(b.supplier_id) || `#${b.supplier_id}`,
        billed: Math.round(billedAmt * 100) / 100,
        paid: Math.round(paidAmt * 100) / 100,
        outstanding: Math.round((billedAmt - paidAmt) * 100) / 100,
        invoiceCount: Number(b.invoice_count),
        lastInvoiceDate: b.last_invoice_date,
      };
    });

    rows.sort((a, b) => b.outstanding - a.outstanding);

    const totalOutstanding = Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100;
    return { items: rows, totalOutstanding };
  },

  async getSupplierDetail(supplierId: number) {
    const supplier = await db('suppliers').where('id', supplierId).first();
    if (!supplier) throw new AppError(404, 'NOT_FOUND', '供应商不存在');

    const invoices = await db('invoices')
      .where('supplier_id', supplierId)
      .where('status', 'confirmed')
      .orderBy('invoice_date', 'desc')
      .limit(100)
      .select('id', 'invoice_number', 'invoice_date', 'grand_total');

    const payments = await db('supplier_payments')
      .where('supplier_id', supplierId)
      .leftJoin('users', 'supplier_payments.created_by', 'users.id')
      .orderBy('paid_at', 'desc')
      .limit(100)
      .select(
        'supplier_payments.id',
        'supplier_payments.amount',
        'supplier_payments.method',
        'supplier_payments.paid_at',
        'supplier_payments.note',
        'supplier_payments.invoice_id',
        'users.display_name as created_by_name'
      );

    // billed/paid 必须用未截断的聚合查询计算，否则供应商发票或付款超过 100 条时
    // 显示数组被 .limit(100) 截断会导致总额少算、与 listPayables 的 SUM 不一致（DATA-N1）。
    const billedRow = await db('invoices')
      .where('supplier_id', supplierId)
      .where('status', 'confirmed')
      .sum('grand_total as billed')
      .first();
    const paidRow = await db('supplier_payments')
      .where('supplier_id', supplierId)
      .sum('amount as paid')
      .first();
    // 零行时 SUM 返回 NULL，统一回退为 0。
    const billed = Number(billedRow?.billed || 0);
    const paid = Number(paidRow?.paid || 0);

    return {
      supplier: { id: supplier.id, name: supplier.name },
      billed: Math.round(billed * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      outstanding: Math.round((billed - paid) * 100) / 100,
      invoices: invoices.map((i: any) => ({
        id: i.id,
        invoiceNumber: i.invoice_number,
        invoiceDate: i.invoice_date,
        grandTotal: Number(i.grand_total),
      })),
      payments: payments.map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        method: p.method,
        paidAt: p.paid_at,
        note: p.note,
        invoiceId: p.invoice_id,
        createdBy: p.created_by_name,
      })),
    };
  },

  async recordPayment(
    body: {
      supplierId: number;
      amount: number;
      invoiceId?: number | null;
      method?: string;
      paidAt?: string;
      note?: string;
    },
    userId: number
  ) {
    if (!body.supplierId || !(body.amount > 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', '供应商与付款金额无效');
    }
    const supplier = await db('suppliers').where('id', body.supplierId).first();
    if (!supplier) throw new AppError(404, 'NOT_FOUND', '供应商不存在');

    // 若指定关联发票，校验其存在且归属同一供应商，避免把付款挂到无关/不存在的发票上
    let invoiceId: number | null = null;
    if (body.invoiceId) {
      const invoice = await db('invoices').where('id', body.invoiceId).first();
      if (!invoice) throw new AppError(404, 'NOT_FOUND', '关联发票不存在');
      if (Number(invoice.supplier_id) !== Number(body.supplierId)) {
        throw new AppError(400, 'VALIDATION_ERROR', '关联发票不属于该供应商');
      }
      invoiceId = Number(body.invoiceId);
    }

    const [id] = await db('supplier_payments').insert({
      supplier_id: body.supplierId,
      invoice_id: invoiceId,
      amount: body.amount,
      method: body.method || null,
      paid_at: body.paidAt || new Date().toISOString().slice(0, 10),
      note: body.note || null,
      created_by: userId,
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'record_payment',
      entity_type: 'supplier_payment',
      entity_id: id,
      details: JSON.stringify({ supplierId: body.supplierId, amount: body.amount }),
    });

    invalidateAnalyticsCache();

    return { id };
  },
};
