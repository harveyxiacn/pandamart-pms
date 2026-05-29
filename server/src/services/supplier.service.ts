import { SupplierModel } from '../models/Supplier';
import { InvoiceModel } from '../models/Invoice';
import { ProductModel } from '../models/Product';
import { AuditLogModel } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';
import db from '../config/database';

export const supplierService = {
  async getAll(filters: any) {
    const { items, total } = await SupplierModel.findAll(filters);
    const pagination = buildPagination(
      filters.page || 1,
      filters.pageSize || 20,
      total
    );
    return { items, pagination };
  },

  async getById(id: number, options?: { includeFinancial?: boolean }) {
    const includeFinancial = options?.includeFinancial !== false;
    const supplier = await SupplierModel.findById(id);
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', '供应商不存在');
    }

    // 统计信息
    const stats = await db('invoices')
      .where('supplier_id', id)
      .select(
        db.raw('COUNT(*) as totalInvoices'),
        db.raw('COALESCE(SUM(grand_total), 0) as totalAmount'),
        db.raw('MAX(invoice_date) as lastInvoiceDate')
      )
      .first();

    const productCount = await db('products')
      .where('default_supplier_id', id)
      .whereNull('deleted_at')
      .count('id as count')
      .first();

    return {
      ...supplier,
      stats: {
        totalInvoices: Number(stats?.totalInvoices || 0),
        productCount: Number(productCount?.count || 0),
        lastInvoiceDate: stats?.lastInvoiceDate || null,
        ...(includeFinancial ? { totalAmount: Number(stats?.totalAmount || 0) } : {}),
      },
    };
  },

  async create(data: any, userId: number) {
    const supplierId = await SupplierModel.create({
      name: data.name,
      code: data.code || null,
      contact_name: data.contactName || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      notes: data.notes || null,
    });

    await AuditLogModel.create({
      user_id: userId,
      action: 'create',
      entity_type: 'supplier',
      entity_id: supplierId,
      details: JSON.stringify({ name: data.name }),
    });

    return supplierId;
  },

  async update(id: number, data: any, userId: number) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', '供应商不存在');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.code !== undefined) updateData.code = data.code || null;
    if (data.contactName !== undefined) updateData.contact_name = data.contactName || null;
    if (data.phone !== undefined) updateData.phone = data.phone || null;
    if (data.email !== undefined) updateData.email = data.email || null;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;

    await SupplierModel.update(id, updateData);

    await AuditLogModel.create({
      user_id: userId,
      action: 'update',
      entity_type: 'supplier',
      entity_id: id,
      details: JSON.stringify(updateData),
    });
  },

  async delete(id: number, userId: number) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', '供应商不存在');
    }

    await SupplierModel.softDelete(id);

    await AuditLogModel.create({
      user_id: userId,
      action: 'delete',
      entity_type: 'supplier',
      entity_id: id,
      details: JSON.stringify({ name: supplier.name }),
    });
  },

  async getProducts(id: number) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', '供应商不存在');
    }
    return ProductModel.findBySupplier(id);
  },

  async getInvoices(id: number, filters?: any) {
    const supplier = await SupplierModel.findById(id);
    if (!supplier) {
      throw new AppError(404, 'NOT_FOUND', '供应商不存在');
    }
    return InvoiceModel.getBySupplier(id, filters);
  },
};
