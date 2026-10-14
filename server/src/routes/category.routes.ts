import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { adminOnly } from '../middleware/permission';
import { validate } from '../middleware/validator';
import { CategoryModel } from '../models/Category';
import { AuditLogModel } from '../models/AuditLog';
import { AuthRequest, CategoryRow } from '../types';
import { sendSuccess, sendError } from '../utils/helpers';
import { sendRouteError } from '../utils/routeError';
import db from '../config/database';

const router = Router();

// 构建树结构
function buildTree(categories: CategoryRow[]): any[] {
  const map = new Map<number, any>();
  const tree: any[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = map.get(cat.id);
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id).children.push(node);
    } else {
      tree.push(node);
    }
  }

  return tree;
}

// GET /api/v1/categories
router.get('/', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const categories = await CategoryModel.findAll();

    // 获取每个分类的产品数量
    const counts = await db('products')
      .select('category_id')
      .count('id as count')
      .whereNull('deleted_at')
      .whereNotNull('category_id')
      .groupBy('category_id');
    const countMap = new Map(counts.map((c: any) => [c.category_id, Number(c.count)]));

    const categoriesWithCount = categories.map((cat) => ({
      ...cat,
      productCount: countMap.get(cat.id) || 0,
    }));

    const tree = buildTree(categoriesWithCount);
    sendSuccess(res, tree);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// GET /api/v1/categories/flat
router.get('/flat', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const categories = await CategoryModel.findAll();
    sendSuccess(res, categories);
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// POST /api/v1/categories
router.post(
  '/',
  authenticate,
  adminOnly,
  validate([{ field: 'name', required: true, type: 'string', minLength: 1 }]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, nameEn, parentId, sortOrder } = req.body;
      const id = await CategoryModel.create({
        name,
        name_en: nameEn || null,
        parent_id: parentId || null,
        sort_order: sortOrder || 0,
      } as any);

      await AuditLogModel.create({
        user_id: req.user!.sub,
        action: 'create',
        entity_type: 'category',
        entity_id: id,
        details: JSON.stringify({ name }),
      });

      sendSuccess(res, { id }, '分类创建成功', 201);
    } catch (err: any) {
      sendRouteError(res, err);
    }
  }
);

// PUT /api/v1/categories/:id
router.put('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const cat = await CategoryModel.findById(id);
    if (!cat) {
      sendError(res, 404, 'NOT_FOUND', '分类不存在');
      return;
    }

    const updateData: any = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.nameEn !== undefined) updateData.name_en = req.body.nameEn;
    if (req.body.parentId !== undefined) updateData.parent_id = req.body.parentId || null;
    if (req.body.sortOrder !== undefined) updateData.sort_order = req.body.sortOrder;

    await CategoryModel.update(id, updateData);
    sendSuccess(res, null, '分类更新成功');
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

// DELETE /api/v1/categories/:id
router.delete('/:id', authenticate, adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const cat = await CategoryModel.findById(id);
    if (!cat) {
      sendError(res, 404, 'NOT_FOUND', '分类不存在');
      return;
    }

    const hasChildren = await CategoryModel.hasChildren(id);
    if (hasChildren) {
      sendError(res, 422, 'BUSINESS_ERROR', '该分类下存在子分类，无法删除');
      return;
    }

    const hasProducts = await CategoryModel.hasProducts(id);
    if (hasProducts) {
      sendError(res, 422, 'BUSINESS_ERROR', '该分类下存在产品，无法删除');
      return;
    }

    await CategoryModel.delete(id);
    sendSuccess(res, null, '分类已删除');
  } catch (err: any) {
    sendRouteError(res, err);
  }
});

export default router;
