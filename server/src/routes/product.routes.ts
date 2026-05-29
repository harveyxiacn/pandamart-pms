import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { uploadProduct, uploadExcel } from '../middleware/upload';
import { validate } from '../middleware/validator';
import { productService } from '../services/product.service';
import { InvoiceItemModel } from '../models/InvoiceItem';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination, buildPagination } from '../utils/helpers';
import * as XLSX from 'xlsx';
import { ProductModel } from '../models/Product';
import db from '../config/database';

const router = Router();

function redactProductPrice<T extends Record<string, any>>(product: T): Omit<T, 'default_price' | 'defaultPrice'> {
  const clone: Record<string, any> = { ...product };
  delete clone.default_price;
  delete clone.defaultPrice;
  return clone as Omit<T, 'default_price' | 'defaultPrice'>;
}

// GET /api/v1/products
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isStaff = req.user!.role === 'staff';
    const { page, pageSize } = parsePagination(req.query);
    const result = await productService.getAll({
      page,
      pageSize,
      keyword: req.query.keyword as string,
      categoryId: req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined,
      supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
    });
    if (isStaff) {
      result.items = result.items.map((item: any) => redactProductPrice(item));
    }
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/products/export
router.get('/export', authenticate, adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const products = await db('products')
      .select('products.*', 'categories.name as category_name', 'suppliers.name as supplier_name')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .leftJoin('suppliers', 'products.default_supplier_id', 'suppliers.id')
      .whereNull('products.deleted_at')
      .orderBy('products.name_en');

    const data = products.map((p: any) => ({
      SKU: p.sku || '',
      '英文名': p.name_en,
      '中文名': p.name_zh || '',
      '分类': p.category_name || '',
      '默认供应商': p.supplier_name || '',
      '默认单位': p.default_unit,
      '默认进价': p.default_price || '',
      '状态': p.is_active ? '启用' : '停用',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, '产品列表');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
    res.send(buffer);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/products/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isStaff = req.user!.role === 'staff';
    const id = parseInt(req.params.id as string);
    const product = await productService.getById(id);
    sendSuccess(res, isStaff ? redactProductPrice(product as any) : product);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/products
router.post(
  '/',
  authenticate,
  adminOnly,
  validate([{ field: 'nameEn', required: true, type: 'string', minLength: 1 }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const productId = await productService.create(req.body, req.user!.sub);
      sendSuccess(res, { id: productId }, '产品创建成功', 201);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// PUT /api/v1/products/:id
router.put('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await productService.update(id, req.body, req.user!.sub);
    sendSuccess(res, null, '产品更新成功');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// DELETE /api/v1/products/:id
router.delete('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await productService.delete(id, req.user!.sub);
    sendSuccess(res, null, '产品已删除');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/products/import
router.post(
  '/import',
  authenticate,
  adminOnly,
  uploadExcel.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        sendError(res, 400, 'BAD_REQUEST', '请上传 Excel 文件');
        return;
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const nameEn = row['英文名'] || row['name_en'] || row['Name'] || '';
        if (!nameEn) { skipped++; continue; }

        try {
          await productService.create({
            sku: row['SKU'] || row['sku'] || null,
            nameEn,
            nameZh: row['中文名'] || row['name_zh'] || null,
            defaultUnit: row['单位'] || row['unit'] || 'Case',
            defaultPrice: row['进价'] || row['price'] || null,
          }, req.user!.sub);
          created++;
        } catch {
          skipped++;
        }
      }

      sendSuccess(res, { created, skipped, total: rows.length }, `导入完成：${created}个产品已创建，${skipped}个已跳过`);
    } catch (err: any) {
      sendError(res, 500, 'INTERNAL_ERROR', err.message);
    }
  }
);

// GET /api/v1/products/:id/price-history
router.get('/:id/price-history', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await productService.getById(id); // 验证存在

    const history = await InvoiceItemModel.getPriceHistory(id, {
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    });

    sendSuccess(res, history.map((h: any) => ({
      date: h.date,
      unitPrice: Number(h.unit_price),
      quantity: Number(h.quantity),
      supplierName: h.supplier_name,
      invoiceNumber: h.invoice_number,
    })));
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

export default router;
