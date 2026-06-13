import { Router, Response } from 'express';
import * as XLSX from 'xlsx';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { exportLimiter } from '../middleware/rateLimit';
import { AuthRequest } from '../types';
import { sendSuccess, sendError } from '../utils/helpers';
import { analyticsService } from '../services/analytics.service';
import db from '../config/database';

const router = Router();

// GET /api/v1/export/invoices
router.get('/invoices', authenticate, adminOnly, exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const query = db('invoices')
      .select(
        'invoices.invoice_number',
        'invoices.invoice_date',
        'suppliers.name as supplier_name',
        'invoices.grand_total',
        'invoices.status',
        'invoices.ocr_method',
        'users.display_name as uploaded_by',
        'invoices.created_at'
      )
      .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .leftJoin('users', 'invoices.uploaded_by', 'users.id')
      .orderBy('invoices.created_at', 'desc');

    if (req.query.dateFrom) query.where('invoices.invoice_date', '>=', req.query.dateFrom);
    if (req.query.dateTo) query.where('invoices.invoice_date', '<=', req.query.dateTo);
    if (req.query.status) query.where('invoices.status', req.query.status);

    const data = await query;
    const rows = data.map((r: any) => ({
      '发票号': r.invoice_number,
      '发票日期': r.invoice_date,
      '供应商': r.supplier_name || '',
      '总金额': Number(r.grand_total),
      '状态': r.status === 'confirmed' ? '已确认' : r.status === 'rejected' ? '已驳回' : '待确认',
      '识别方式': r.ocr_method,
      '上传人': r.uploaded_by,
      '创建时间': r.created_at,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '发票列表');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=invoices.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/export/inventory
router.get('/inventory', authenticate, adminOnly, exportLimiter, async (_req: AuthRequest, res: Response) => {
  try {
    const data = await db('inventory')
      .select(
        'products.sku',
        'products.name_en',
        'products.name_zh',
        'categories.name as category_name',
        'inventory.quantity',
        'inventory.unit',
        'inventory.safe_stock',
        'inventory.last_restock_date',
        'products.default_price'
      )
      .join('products', 'inventory.product_id', 'products.id')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .whereNull('products.deleted_at')
      .orderBy('products.name_en');

    const rows = data.map((r: any) => ({
      'SKU': r.sku || '',
      '英文名': r.name_en,
      '中文名': r.name_zh || '',
      '分类': r.category_name || '',
      '库存': Number(r.quantity),
      '单位': r.unit,
      '安全库存': r.safe_stock ? Number(r.safe_stock) : '',
      '最近补货日期': r.last_restock_date || '',
      '默认进价': r.default_price ? Number(r.default_price) : '',
      '库存状态': r.safe_stock && Number(r.quantity) < Number(r.safe_stock) ? '低库存' : '正常',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '库存列表');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=inventory.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/export/suppliers
router.get('/suppliers', authenticate, adminOnly, exportLimiter, async (_req: AuthRequest, res: Response) => {
  try {
    const data = await db('suppliers')
      .whereNull('deleted_at')
      .orderBy('name');

    const rows = data.map((r: any) => ({
      '编号': r.code || '',
      '名称': r.name,
      '联系人': r.contact_name || '',
      '电话': r.phone || '',
      '邮箱': r.email || '',
      '地址': r.address || '',
      '状态': r.is_active ? '启用' : '停用',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '供应商列表');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=suppliers.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/export/purchases
router.get('/purchases', authenticate, adminOnly, exportLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.query.dateFrom || !req.query.dateTo) {
      sendError(res, 400, 'BAD_REQUEST', '必须提供 dateFrom 和 dateTo 参数');
      return;
    }

    const query = db('invoice_items')
      .select(
        'invoices.invoice_number',
        'invoices.invoice_date',
        'suppliers.name as supplier_name',
        'products.sku',
        'products.name_en',
        'products.name_zh',
        'categories.name as category_name',
        'invoice_items.raw_name_en',
        'invoice_items.quantity',
        'invoice_items.unit',
        'invoice_items.unit_price',
        'invoice_items.line_total'
      )
      .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
      .leftJoin('products', 'invoice_items.product_id', 'products.id')
      .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .where('invoices.status', 'confirmed')
      .where('invoices.invoice_date', '>=', req.query.dateFrom)
      .where('invoices.invoice_date', '<=', req.query.dateTo)
      .orderBy('invoices.invoice_date', 'desc');

    if (req.query.supplierId) query.where('invoices.supplier_id', req.query.supplierId);

    const data = await query;
    const rows = data.map((r: any) => ({
      '发票号': r.invoice_number,
      '发票日期': r.invoice_date,
      '供应商': r.supplier_name || '',
      'SKU': r.sku || '',
      '英文名': r.name_en || r.raw_name_en || '',
      '中文名': r.name_zh || '',
      '分类': r.category_name || '',
      '数量': Number(r.quantity),
      '单位': r.unit,
      '单价': Number(r.unit_price),
      '小计': Number(r.line_total),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '采购明细');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=purchases.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/export/full-backup
router.get('/full-backup', authenticate, adminOnly, exportLimiter, async (_req: AuthRequest, res: Response) => {
  try {
    // 大表统一硬上限，避免在 400M 内存的 VPS 上把整个备份一次性构建成超大 JSON 字符串
    const CAP = 50000;
    // 记录每张大表是否触达上限（命中说明数据被截断，恢复时需注意）
    const truncated: Record<string, boolean> = {};

    // ai_providers 排除密钥列（api_key_encrypted，IV 已内嵌其中）；users 排除 password_hash
    // 用 columnInfo 动态推导可导出列，避免后续迁移新增列时此处漂移
    const [aiProviderCols, userCols] = await Promise.all([
      db('ai_providers').columnInfo(),
      db('users').columnInfo(),
    ]);
    const aiProviderColumns = Object.keys(aiProviderCols).filter((c) => c !== 'api_key_encrypted');
    const userColumns = Object.keys(userCols).filter((c) => c !== 'password_hash');

    const [
      products,
      suppliers,
      categories,
      inventory,
      invoices,
      invoiceItems,
      settings,
      salesOrders,
      salesItems,
      supplierPayments,
      inventoryBatches,
      inventoryLogs,
      auditLogs,
      notifications,
      aiProviders,
      users,
    ] = await Promise.all([
      db('products').whereNull('deleted_at'),
      db('suppliers').whereNull('deleted_at'),
      db('categories'),
      db('inventory').join('products', 'inventory.product_id', 'products.id').whereNull('products.deleted_at').select('inventory.*'),
      db('invoices').orderBy('created_at', 'desc').limit(CAP),
      db('invoice_items').orderBy('id', 'desc').limit(CAP),
      db('settings'),
      db('sales_orders').orderBy('id', 'desc').limit(CAP),
      db('sales_items').orderBy('id', 'desc').limit(CAP),
      db('supplier_payments').orderBy('id', 'desc').limit(CAP),
      db('inventory_batches').orderBy('id', 'desc').limit(CAP),
      db('inventory_logs').orderBy('id', 'desc').limit(CAP),
      db('audit_logs').orderBy('id', 'desc').limit(CAP),
      db('notifications').orderBy('id', 'desc').limit(CAP),
      // ai_providers：排除加密密钥列
      db('ai_providers').select(aiProviderColumns).orderBy('id', 'desc').limit(CAP),
      // users：排除 password_hash 列
      db('users').select(userColumns).orderBy('id', 'desc').limit(CAP),
    ]);

    // 标记触达上限（== CAP 即可能被截断）的表
    for (const [name, rows] of Object.entries({
      invoices,
      invoiceItems,
      salesOrders,
      salesItems,
      supplierPayments,
      inventoryBatches,
      inventoryLogs,
      auditLogs,
      notifications,
      aiProviders,
      users,
    })) {
      if ((rows as any[]).length >= CAP) truncated[name] = true;
    }

    const backup = {
      exportedAt: new Date().toISOString(),
      version: '1.1.0',
      limit: CAP,
      truncated,
      data: {
        products,
        suppliers,
        categories,
        inventory,
        invoices,
        invoiceItems,
        settings,
        salesOrders,
        salesItems,
        supplierPayments,
        inventoryBatches,
        inventoryLogs,
        auditLogs,
        notifications,
        aiProviders,
        users,
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=pandamart-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(backup));
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/export/reorder-suggestions
router.get('/reorder-suggestions', authenticate, adminOnly, exportLimiter, async (_req: AuthRequest, res: Response) => {
  try {
    const data = await analyticsService.getReorderSuggestions();

    const rows = data.map((r) => ({
      'SKU/英文名': r.nameEn,
      '中文名': r.nameZh || '',
      '当前库存': Number(r.currentStock),
      '安全库存': Number(r.safeStock),
      '周均消耗': Number(r.avgWeeklyUsage),
      '建议补货量': Number(r.suggestedQuantity),
      '建议供应商': r.suggestedSupplier?.name || '',
      '最近进价': Number(r.lastPrice),
      '预计成本': Number(r.estimatedCost),
      '紧急度': r.urgency === 'high' ? '高' : r.urgency === 'medium' ? '中' : '低',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '补货建议');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reorder-suggestions.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

export default router;
