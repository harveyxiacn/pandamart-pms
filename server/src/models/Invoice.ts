import db from '../config/database';
import { InvoiceRow } from '../types';

const TABLE = 'invoices';

export const InvoiceModel = {
  async findById(id: number): Promise<any | undefined> {
    return db(TABLE)
      .select(
        'invoices.*',
        'suppliers.name as supplier_name',
        'uploader.display_name as uploaded_by_name',
        'confirmer.display_name as confirmed_by_name'
      )
      .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .leftJoin('users as uploader', 'invoices.uploaded_by', 'uploader.id')
      .leftJoin('users as confirmer', 'invoices.confirmed_by', 'confirmer.id')
      .where('invoices.id', id)
      .first();
  },

  ALLOWED_SORT_FIELDS: ['created_at', 'invoice_date', 'grand_total', 'status', 'invoice_number', 'updated_at'] as string[],

  async findAll(filters?: {
    status?: string;
    supplierId?: number;
    dateFrom?: string;
    dateTo?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ items: any[]; total: number }> {
    const query = db(TABLE)
      .select(
        'invoices.id',
        'invoices.supplier_id',
        'invoices.invoice_number',
        'invoices.invoice_date',
        'invoices.customer_code',
        'invoices.subtotal',
        'invoices.has_tax',
        'invoices.tax_amount',
        'invoices.grand_total',
        'invoices.file_path',
        'invoices.file_type',
        'invoices.ocr_method',
        'invoices.status',
        'invoices.uploaded_by',
        'invoices.confirmed_by',
        'invoices.confirmed_at',
        'invoices.notes',
        'invoices.created_at',
        'invoices.updated_at',
        'suppliers.name as supplier_name',
        'uploader.display_name as uploaded_by_name',
        'confirmer.display_name as confirmed_by_name'
      )
      .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .leftJoin('users as uploader', 'invoices.uploaded_by', 'uploader.id')
      .leftJoin('users as confirmer', 'invoices.confirmed_by', 'confirmer.id');

    if (filters?.status) query.where('invoices.status', filters.status);
    if (filters?.supplierId) query.where('invoices.supplier_id', filters.supplierId);
    if (filters?.dateFrom) query.where('invoices.invoice_date', '>=', filters.dateFrom);
    if (filters?.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);
    if (filters?.keyword) {
      query.where('invoices.invoice_number', 'like', `%${filters.keyword}%`);
    }

    const countQuery = db(TABLE);
    if (filters?.status) countQuery.where('status', filters.status);
    if (filters?.supplierId) countQuery.where('supplier_id', filters.supplierId);
    if (filters?.dateFrom) countQuery.where('invoice_date', '>=', filters.dateFrom);
    if (filters?.dateTo) countQuery.where('invoice_date', '<=', filters.dateTo);
    if (filters?.keyword) countQuery.where('invoice_number', 'like', `%${filters.keyword}%`);

    const countResult = await countQuery.count('id as total').first();
    const total = Number(countResult?.total || 0);

    const sortBy = this.ALLOWED_SORT_FIELDS.includes(filters?.sortBy || '') ? filters!.sortBy! : 'created_at';
    const sortOrder = filters?.sortOrder || 'desc';
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;

    const items = await query
      .orderBy(`invoices.${sortBy}`, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { items, total };
  },

  async create(data: Partial<InvoiceRow>): Promise<number> {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id: number, data: Partial<InvoiceRow>): Promise<number> {
    return db(TABLE).where({ id }).update({ ...data, updated_at: db.fn.now() });
  },

  async delete(id: number): Promise<number> {
    return db(TABLE).where({ id }).delete();
  },

  async getItemCount(id: number): Promise<number> {
    const result = await db('invoice_items').where('invoice_id', id).count('id as count').first();
    return Number(result?.count || 0);
  },

  async getBySupplier(supplierId: number, filters?: {
    page?: number;
    pageSize?: number;
  }): Promise<{ items: InvoiceRow[]; total: number }> {
    const countResult = await db(TABLE).where('supplier_id', supplierId).count('id as total').first();
    const total = Number(countResult?.total || 0);
    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const items = await db(TABLE)
      .where('supplier_id', supplierId)
      .orderBy('invoice_date', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items, total };
  },
};
