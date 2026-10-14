import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { supplierService } from '../services/supplier.service';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';

const router = Router();

function redactProductPrice<T extends Record<string, any>>(product: T): Omit<T, 'default_price' | 'defaultPrice'> {
  const clone: Record<string, any> = { ...product };
  delete clone.default_price;
  delete clone.defaultPrice;
  return clone as Omit<T, 'default_price' | 'defaultPrice'>;
}

// GET /api/v1/suppliers
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const result = await supplierService.getAll({
      page,
      pageSize,
      keyword: req.query.keyword as string,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    });
    sendSuccess(res, result);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// GET /api/v1/suppliers/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const includeFinancial = req.user!.role === 'admin';
    const id = parseInt(req.params.id as string);
    const supplier = await supplierService.getById(id, { includeFinancial });
    sendSuccess(res, supplier);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/suppliers
router.post(
  '/',
  authenticate,
  adminOnly,
  validate([{ field: 'name', required: true, type: 'string', minLength: 1 }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = await supplierService.create(req.body, req.user!.sub);
      sendSuccess(res, { id }, '供应商创建成功', 201);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// PUT /api/v1/suppliers/:id
router.put('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await supplierService.update(id, req.body, req.user!.sub);
    sendSuccess(res, null, '供应商更新成功');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// DELETE /api/v1/suppliers/:id
router.delete('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await supplierService.delete(id, req.user!.sub);
    sendSuccess(res, null, '供应商已删除');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/suppliers/:id/products
router.get('/:id/products', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isStaff = req.user!.role === 'staff';
    const id = parseInt(req.params.id as string);
    const products = await supplierService.getProducts(id);
    sendSuccess(res, isStaff ? products.map((item: any) => redactProductPrice(item)) : products);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/suppliers/:id/invoices
router.get('/:id/invoices', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { page, pageSize } = parsePagination(req.query);
    const result = await supplierService.getInvoices(id, { page, pageSize });
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

export default router;
