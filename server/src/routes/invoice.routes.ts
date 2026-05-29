import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { uploadInvoice } from '../middleware/upload';
import { uploadLimiter } from '../middleware/rateLimit';
import { invoiceService } from '../services/invoice.service';
import { ocrService } from '../services/ocr.service';
import { AuditLogModel } from '../models/AuditLog';
import { AuthRequest } from '../types';
import { sendSuccess, sendError, parsePagination, getClientIp } from '../utils/helpers';

const router = Router();

// POST /api/v1/invoices/upload
router.post(
  '/upload',
  authenticate,
  uploadLimiter,
  uploadInvoice.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        sendError(res, 400, 'BAD_REQUEST', '请上传文件');
        return;
      }

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'upload_invoice',
        entity_type: 'invoice',
        details: JSON.stringify({ filename: req.file.originalname, size: req.file.size }),
        ip_address: getClientIp(req),
      });

      const result = await ocrService.processFile(req.file.path, req.user!.sub);

      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// POST /api/v1/invoices/:id/confirm
router.post(
  '/:id/confirm',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const result = await invoiceService.confirm(id, req.body, req.user!.sub, req.user!.role);
      sendSuccess(res, result, `发票已确认入库，${result.inventoryUpdated}个产品库存已更新${result.newProductsCreated > 0 ? `，${result.newProductsCreated}个新产品已创建` : ''}`);
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// POST /api/v1/invoices/:id/reject
router.post(
  '/:id/reject',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      await invoiceService.reject(id, req.body.reason || '', req.user!.sub);
      sendSuccess(res, null, '发票已驳回');
    } catch (err: any) {
      sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
    }
  }
);

// PUT /api/v1/invoices/:id
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const result = await invoiceService.updatePending(id, req.body, req.user!.sub);
    sendSuccess(res, result, '发票已更新');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// DELETE /api/v1/invoices/:id
router.delete('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    await invoiceService.deletePendingOrRejected(id, req.user!.sub);
    sendSuccess(res, null, '发票已删除');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// POST /api/v1/invoices/:id/rollback-confirm
router.post('/:id/rollback-confirm', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const result = await invoiceService.rollbackConfirm(id, req.user!.sub, req.body?.reason || '');
    sendSuccess(res, result, '发票已回滚为待处理');
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/invoices
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isStaff = req.user!.role === 'staff';
    const requestedStatus = req.query.status as string | undefined;
    if (isStaff && requestedStatus && requestedStatus !== 'pending') {
      sendError(res, 403, 'FORBIDDEN', '店员仅可访问待处理发票');
      return;
    }

    const { page, pageSize } = parsePagination(req.query);
    const result = await invoiceService.getAll({
      page,
      pageSize,
      status: isStaff ? 'pending' : requestedStatus,
      supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
      keyword: req.query.keyword as string,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as string,
    });
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/invoices/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const invoice = await invoiceService.getById(id, req.user!.role);
    sendSuccess(res, invoice);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

// GET /api/v1/invoices/:id/file
router.get('/:id/file', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const invoice = await invoiceService.getById(id, req.user!.role);

    const basePath = path.resolve(__dirname, '../../uploads');
    // 防目录穿越：normalize 后必须严格位于 uploads 目录内（含 path.sep 边界判断，
    // 避免 /uploads-evil 这类前缀绕过），且不能等于 basePath 本身。
    const filePath = path.normalize(path.resolve(__dirname, '../../', invoice.filePath));
    const inside = filePath === basePath || filePath.startsWith(basePath + path.sep);
    if (!inside || !fs.existsSync(filePath)) {
      sendError(res, 404, 'NOT_FOUND', '文件不存在');
      return;
    }

    res.sendFile(filePath);
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});

export default router;
