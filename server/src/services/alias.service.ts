import db from '../config/database';
import logger from '../utils/logger';

/**
 * 供应商商品别名学习（学习型匹配器）。
 *
 * 问题：OCR 把发票行与系统商品关联时只做「模糊名称匹配」，对新供应商/新写法命中率低。
 * 人在「发票确认」环节手动修正商品归属后，这一知识此前会被丢弃，下次发票仍需重新猜。
 *
 * 方案：把人工确认过的原始字段（条码 / 供应商货号 / 归一化名称）沉淀为
 * (supplier_id, alias_type, alias_key) → product_id 的学习映射；OCR 再次遇到
 * 同供应商同字段时按 barcode > code > name 优先、命中次数高者优先直接命中。
 *
 * 键归一化与候选派生为纯函数（normalizeAliasKey / deriveAliasCandidates），可单测。
 */

export type AliasType = 'barcode' | 'code' | 'name';

const TABLE = 'supplier_product_aliases';
const ALIAS_KEY_MAX = 160;
const TYPE_PRIORITY: Record<AliasType, number> = { barcode: 0, code: 1, name: 2 };

/** 归一化别名键；无法形成有效键（过短/非条码）时返回 null。 */
export function normalizeAliasKey(type: AliasType, raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  if (type === 'barcode') {
    const digits = text.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 16) return null;
    return digits;
  }

  if (type === 'code') {
    const key = text.toUpperCase().replace(/\s+/g, '');
    return key.length >= 3 ? key.slice(0, ALIAS_KEY_MAX) : null;
  }

  // name：去符号、小写（保留中日韩等 Unicode 字母数字）。
  // 中文名常为 2 字（如「绍菜」），故长度下限取 2，而非 code 的 3。
  const key = text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  return key.length >= 2 ? key.slice(0, ALIAS_KEY_MAX) : null;
}

export interface AliasCandidate {
  type: AliasType;
  key: string;
}

/** 从一条 OCR/发票明细派生候选别名键（去重）。 */
export function deriveAliasCandidates(item: {
  productNumber?: unknown;
  productCode?: unknown;
  productNameEn?: unknown;
  productNameZh?: unknown;
}): AliasCandidate[] {
  const out: AliasCandidate[] = [];
  const seen = new Set<string>();
  const push = (type: AliasType, raw: unknown) => {
    const key = normalizeAliasKey(type, raw);
    if (!key) return;
    const dedupe = `${type}:${key}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push({ type, key });
  };

  push('barcode', item.productNumber);
  push('code', item.productCode);
  push('name', item.productNameEn);
  push('name', item.productNameZh);
  return out;
}

export const aliasService = {
  /** 从已确认的发票明细学习（幂等 upsert，命中次数累加）。失败不抛出。 */
  async learnFromConfirm(
    supplierId: number | null | undefined,
    items: Array<{
      productId: number | null;
      productNumber?: unknown;
      productCode?: unknown;
      productNameEn?: unknown;
      productNameZh?: unknown;
    }>
  ): Promise<number> {
    if (!supplierId) return 0;
    let learned = 0;

    for (const item of items) {
      if (!item.productId) continue;
      const candidates = deriveAliasCandidates(item);
      for (const candidate of candidates) {
        try {
          await db(TABLE)
            .insert({
              supplier_id: supplierId,
              alias_type: candidate.type,
              alias_key: candidate.key,
              product_id: item.productId,
              hits: 1,
            })
            .onConflict(['supplier_id', 'alias_type', 'alias_key'])
            .merge({
              product_id: item.productId,
              hits: db.raw('hits + 1'),
              updated_at: db.fn.now(),
            });
          learned += 1;
        } catch (err) {
          logger.warn('别名学习失败（已忽略）:', err);
        }
      }
    }

    return learned;
  },

  /** 按供应商 + 明细字段查已学习映射，返回最匹配的 product_id（无则 null）。 */
  async lookup(
    supplierId: number | null | undefined,
    item: {
      productNumber?: unknown;
      productCode?: unknown;
      productNameEn?: unknown;
      productNameZh?: unknown;
    }
  ): Promise<{ productId: number; type: AliasType; key: string } | null> {
    if (!supplierId) return null;
    const candidates = deriveAliasCandidates(item);
    if (candidates.length === 0) return null;

    const keys = candidates.map((c) => c.key);
    const rows = await db(TABLE)
      .where('supplier_id', supplierId)
      .whereIn('alias_key', keys)
      .select('alias_type', 'alias_key', 'product_id', 'hits');

    if (rows.length === 0) return null;

    const byKey = new Map<string, any>(rows.map((r: any) => [r.alias_key, r]));
    const ranked = candidates
      .map((c) => ({ candidate: c, row: byKey.get(c.key) }))
      .filter((entry) => entry.row)
      .sort((a, b) => {
        const pa = TYPE_PRIORITY[a.candidate.type];
        const pb = TYPE_PRIORITY[b.candidate.type];
        if (pa !== pb) return pa - pb;
        return Number(b.row.hits) - Number(a.row.hits);
      });

    if (ranked.length === 0) return null;
    const best = ranked[0];
    return {
      productId: Number(best.row.product_id),
      type: best.candidate.type,
      key: best.candidate.key,
    };
  },

  /** 已学习的别名（可按供应商过滤），联动商品名便于人工核对/清理。 */
  async list(filters: { supplierId?: number; limit?: number } = {}) {
    const q = db(TABLE)
      .join('products', 'supplier_product_aliases.product_id', 'products.id')
      .join('suppliers', 'supplier_product_aliases.supplier_id', 'suppliers.id')
      .whereNull('products.deleted_at')
      .select(
        'supplier_product_aliases.id',
        'supplier_product_aliases.supplier_id',
        'supplier_product_aliases.alias_type',
        'supplier_product_aliases.alias_key',
        'supplier_product_aliases.product_id',
        'supplier_product_aliases.hits',
        'supplier_product_aliases.updated_at',
        'products.name_en as product_name_en',
        'products.name_zh as product_name_zh',
        'suppliers.name as supplier_name'
      )
      .orderBy('supplier_product_aliases.hits', 'desc')
      .orderBy('supplier_product_aliases.updated_at', 'desc');

    if (filters.supplierId) q.where('supplier_product_aliases.supplier_id', filters.supplierId);

    const limit = Math.max(1, Math.min(500, Math.trunc(filters.limit || 100)));
    const rows = await q.limit(limit);

    return rows.map((r: any) => ({
      id: r.id,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      aliasType: r.alias_type,
      aliasKey: r.alias_key,
      productId: r.product_id,
      productName: r.product_name_zh || r.product_name_en,
      hits: Number(r.hits),
      updatedAt: r.updated_at,
    }));
  },

  async remove(id: number): Promise<number> {
    return db(TABLE).where('id', id).delete();
  },
};
