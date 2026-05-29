import { ProductModel } from '../models/Product';
import { InventoryModel } from '../models/Inventory';
import { AuditLogModel } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { buildPagination } from '../utils/helpers';

export const productService = {
  async getAll(filters: any) {
    const { items, total } = await ProductModel.findAll(filters);
    const pagination = buildPagination(
      filters.page || 1,
      filters.pageSize || 20,
      total
    );
    return { items, pagination };
  },

  async getById(id: number) {
    const product = await ProductModel.findById(id);
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', '产品不存在');
    }
    return product;
  },

  async create(data: any, userId: number) {
    if (data.sku) {
      const existing = await ProductModel.findBySku(data.sku);
      if (existing) {
        throw new AppError(409, 'CONFLICT', `SKU "${data.sku}" 已存在`);
      }
    }

    const productId = await ProductModel.create({
      sku: data.sku || null,
      barcode: data.barcode || null,
      name_en: data.nameEn,
      name_zh: data.nameZh || null,
      category_id: data.categoryId || null,
      default_supplier_id: data.defaultSupplierId || null,
      default_unit: data.defaultUnit || 'Case',
      default_price: data.defaultPrice || null,
      selling_price: data.sellingPrice ?? null,
      is_perishable: data.isPerishable ?? false,
      shelf_life_days: data.shelfLifeDays ?? null,
      notes: data.notes || null,
    });

    // 自动创建库存记录
    await InventoryModel.upsert(productId, {
      unit: data.defaultUnit || 'Case',
      quantity: 0,
    } as any);

    await AuditLogModel.create({
      user_id: userId,
      action: 'create',
      entity_type: 'product',
      entity_id: productId,
      details: JSON.stringify({ name: data.nameEn }),
    });

    return productId;
  },

  async update(id: number, data: any, userId: number) {
    const product = await ProductModel.findById(id);
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', '产品不存在');
    }

    if (data.sku && data.sku !== product.sku) {
      const existing = await ProductModel.findBySku(data.sku);
      if (existing) {
        throw new AppError(409, 'CONFLICT', `SKU "${data.sku}" 已存在`);
      }
    }

    const updateData: any = {};
    if (data.sku !== undefined) updateData.sku = data.sku || null;
    if (data.barcode !== undefined) updateData.barcode = data.barcode || null;
    if (data.nameEn !== undefined) updateData.name_en = data.nameEn;
    if (data.nameZh !== undefined) updateData.name_zh = data.nameZh || null;
    if (data.categoryId !== undefined) updateData.category_id = data.categoryId || null;
    if (data.defaultSupplierId !== undefined) updateData.default_supplier_id = data.defaultSupplierId || null;
    if (data.defaultUnit !== undefined) updateData.default_unit = data.defaultUnit;
    if (data.defaultPrice !== undefined) updateData.default_price = data.defaultPrice;
    if (data.sellingPrice !== undefined) updateData.selling_price = data.sellingPrice ?? null;
    if (data.isPerishable !== undefined) updateData.is_perishable = data.isPerishable;
    if (data.shelfLifeDays !== undefined) updateData.shelf_life_days = data.shelfLifeDays ?? null;
    if (data.notes !== undefined) updateData.notes = data.notes || null;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;

    await ProductModel.update(id, updateData);

    await AuditLogModel.create({
      user_id: userId,
      action: 'update',
      entity_type: 'product',
      entity_id: id,
      details: JSON.stringify(updateData),
    });
  },

  async delete(id: number, userId: number) {
    const product = await ProductModel.findById(id);
    if (!product) {
      throw new AppError(404, 'NOT_FOUND', '产品不存在');
    }

    await ProductModel.softDelete(id);

    await AuditLogModel.create({
      user_id: userId,
      action: 'delete',
      entity_type: 'product',
      entity_id: id,
      details: JSON.stringify({ name: product.name_en }),
    });
  },

  async search(keyword: string, limit = 10) {
    return ProductModel.search(keyword, limit);
  },
};
