import db from '../config/database';
import { SettingModel } from '../models/Setting';
import { parseBoundedInt } from '../utils/helpers';
import { batchService } from './batch.service';

export const analyticsService = {
  async getDashboard() {
    // 所有日期边界都是纯 JS 计算、查询间无数据依赖，先一次性算好再并发发起
    // 全部查询，把约 11 次串行往返压缩为约 3 个连接池批次（PERF-N1）。
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString()
      .split('T')[0];

    // 计算本周起始（周一）
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // 本月起始
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // 昨日起始（今日同比）
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
      .toISOString().split('T')[0];

    // 上周起始（本周同比）
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0];

    // 上月起始（本月同比）
    const prevMonth = new Date(now);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;

    const [
      todayStats,
      pendingCount,
      lowStockResult,
      weekStats,
      monthStats,
      recentInvoices,
      lowStockProducts,
      yesterdayStats,
      prevWeekStats,
      prevMonthStats,
      expSummary,
    ] = await Promise.all([
      // 今日统计
      db('invoices')
        .where('invoice_date', '>=', todayStart)
        .where('status', 'confirmed')
        .select(
          db.raw('COUNT(*) as invoiceCount'),
          db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
        )
        .first(),

      db('invoices')
        .where('status', 'pending')
        .count('id as count')
        .first(),

      // 低库存预警数
      db('inventory')
        .join('products', 'inventory.product_id', 'products.id')
        .whereNull('products.deleted_at')
        .whereNotNull('inventory.safe_stock')
        .whereRaw('inventory.quantity < inventory.safe_stock')
        .count('inventory.id as count')
        .first(),

      // 本周统计
      db('invoices')
        .where('invoice_date', '>=', weekStartStr)
        .where('status', 'confirmed')
        .select(
          db.raw('COUNT(*) as invoiceCount'),
          db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
        )
        .first(),

      // 本月统计
      db('invoices')
        .where('invoice_date', '>=', monthStart)
        .where('status', 'confirmed')
        .select(
          db.raw('COUNT(*) as invoiceCount'),
          db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
        )
        .first(),

      // 最近发票
      db('invoices')
        .select(
          'invoices.id',
          'suppliers.name as supplierName',
          'invoices.invoice_number as invoiceNumber',
          'invoices.grand_total as grandTotal',
          'invoices.status',
          'invoices.created_at as createdAt'
        )
        .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
        .orderBy('invoices.created_at', 'desc')
        .limit(5),

      // 低库存产品
      db('inventory')
        .select(
          'inventory.product_id as productId',
          'products.name_en as nameEn',
          'products.name_zh as nameZh',
          'inventory.quantity',
          'inventory.safe_stock as safeStock',
          'inventory.unit'
        )
        .join('products', 'inventory.product_id', 'products.id')
        .whereNull('products.deleted_at')
        .whereNotNull('inventory.safe_stock')
        .whereRaw('inventory.quantity < inventory.safe_stock')
        .orderByRaw('(inventory.safe_stock - inventory.quantity) DESC')
        .limit(10),

      // 上期对比数据（用于趋势百分比）
      db('invoices')
        .where('invoice_date', '>=', yesterdayStart)
        .where('invoice_date', '<', todayStart)
        .where('status', 'confirmed')
        .select(
          db.raw('COALESCE(SUM(grand_total), 0) as totalAmount'),
          db.raw('COUNT(*) as invoiceCount')
        ).first(),

      db('invoices')
        .where('invoice_date', '>=', prevWeekStartStr)
        .where('invoice_date', '<', weekStartStr)
        .where('status', 'confirmed')
        .select(
          db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
        ).first(),

      db('invoices')
        .where('invoice_date', '>=', prevMonthStart)
        .where('invoice_date', '<', monthStart)
        .where('status', 'confirmed')
        .select(
          db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
        ).first(),

      // 临期批次摘要：表可能不存在，用 .catch 回退空形状以保留原 try/catch 弹性
      batchService.getExpiringSummary(7).catch(() => ({ items: [] as any[] })),
    ]);

    // 临期批次摘要整形
    const expiringBatches = (expSummary.items || []).slice(0, 5).map((item: any) => ({
      productId: item.productId,
      nameEn: item.nameEn,
      nameZh: item.nameZh,
      batchNo: item.batchNo,
      expiryDate: item.expiryDate,
      quantity: item.quantity,
      expired: item.expired,
    }));

    return {
      today: {
        invoiceCount: Number(todayStats?.invoiceCount || 0),
        totalAmount: Number(todayStats?.totalAmount || 0),
        pendingInvoices: Number(pendingCount?.count || 0),
        lowStockAlerts: Number(lowStockResult?.count || 0),
      },
      thisWeek: {
        invoiceCount: Number(weekStats?.invoiceCount || 0),
        totalAmount: Number(weekStats?.totalAmount || 0),
      },
      thisMonth: {
        invoiceCount: Number(monthStats?.invoiceCount || 0),
        totalAmount: Number(monthStats?.totalAmount || 0),
      },
      recentInvoices,
      lowStockProducts,
      comparisons: {
        yesterday: { totalAmount: Number(yesterdayStats?.totalAmount || 0) },
        prevWeek: { totalAmount: Number(prevWeekStats?.totalAmount || 0) },
        prevMonth: { totalAmount: Number(prevMonthStats?.totalAmount || 0) },
      },
      expiringBatches,
    };
  },

  // 规则引擎：无需 LLM 的智能告警
  async getDashboardAlerts() {
    const alerts: Array<{
      id: string;
      type: 'stockout_risk' | 'price_spike' | 'pending_invoice' | 'expiring_batch' | 'slow_mover' | 'cost_increase';
      severity: 'high' | 'medium' | 'low';
      title: string;
      message: string;
      link?: string;
      count?: number;
    }> = [];

    // 各探测组之间互不依赖，先并发计算各组结果（含组内条件子查询），
    // 再按原有固定顺序 push 告警，保证输出与串行版本完全一致（PERF-N3）。
    const [lowStockGroup, pendingGroup, expSummary, priceChanges, slowMovers] = await Promise.all([
      // 组 1：低库存（仅当 low>0 时才发起 zero-stock 子查询）
      (async () => {
        const lowStockCount = await db('inventory')
          .join('products', 'inventory.product_id', 'products.id')
          .whereNull('products.deleted_at')
          .whereNotNull('inventory.safe_stock')
          .whereRaw('inventory.quantity < inventory.safe_stock')
          .count('inventory.id as count')
          .first();
        const lowCount = Number(lowStockCount?.count || 0);
        let zeroCount = 0;
        if (lowCount > 0) {
          const zeroStock = await db('inventory')
            .join('products', 'inventory.product_id', 'products.id')
            .whereNull('products.deleted_at')
            .whereNotNull('inventory.safe_stock')
            .where('inventory.quantity', '<=', 0)
            .count('inventory.id as count')
            .first();
          zeroCount = Number(zeroStock?.count || 0);
        }
        return { lowCount, zeroCount };
      })(),

      // 组 2：待处理发票（仅当 pending>0 时才发起 old-pending 子查询）
      (async () => {
        const pendingInvoices = await db('invoices')
          .where('status', 'pending')
          .count('id as count')
          .first();
        const pendingCount = Number(pendingInvoices?.count || 0);
        let oldCount = 0;
        if (pendingCount > 0) {
          const oldPending = await db('invoices')
            .where('status', 'pending')
            .where('created_at', '<', db.raw('DATE_SUB(NOW(), INTERVAL 3 DAY)'))
            .count('id as count')
            .first();
          oldCount = Number(oldPending?.count || 0);
        }
        return { pendingCount, oldCount };
      })(),

      // 组 3：临期/过期批次（表可能不存在，回退空形状）
      batchService
        .getExpiringSummary(7)
        .catch(() => ({ expiredCount: 0, expiringCount: 0 })),

      // 组 4：价格大幅波动
      this.getPriceChanges({ threshold: 15, limit: 5 }),

      // 组 5：滞销商品
      this.getSalesSlowMovers({ days: 30, limit: 5 }),
    ]);

    // 1. 低库存告警
    const { lowCount, zeroCount } = lowStockGroup;
    if (lowCount > 0) {
      alerts.push({
        id: 'low-stock',
        type: 'stockout_risk',
        severity: zeroCount > 0 ? 'high' : 'medium',
        title: '库存不足',
        message: zeroCount > 0
          ? `${lowCount} 个产品库存低于安全线，其中 ${zeroCount} 个已缺货`
          : `${lowCount} 个产品库存低于安全线，请及时补货`,
        link: '/inventory',
        count: lowCount,
      });
    }

    // 2. 待处理发票
    const { pendingCount, oldCount } = pendingGroup;
    if (pendingCount > 0) {
      alerts.push({
        id: 'pending-invoices',
        type: 'pending_invoice',
        severity: oldCount > 0 ? 'high' : 'medium',
        title: '待处理发票',
        message: oldCount > 0
          ? `${pendingCount} 张发票待处理，其中 ${oldCount} 张已超过 3 天`
          : `${pendingCount} 张发票等待确认入库`,
        link: '/invoices',
        count: pendingCount,
      });
    }

    // 3. 临期/过期批次
    {
      if (expSummary.expiredCount > 0) {
        alerts.push({
          id: 'expired-batches',
          type: 'expiring_batch',
          severity: 'high',
          title: '过期批次',
          message: `${expSummary.expiredCount} 个批次已过期，请尽快报损处理`,
          link: '/batches',
          count: expSummary.expiredCount,
        });
      }
      if (expSummary.expiringCount > 0) {
        alerts.push({
          id: 'expiring-batches',
          type: 'expiring_batch',
          severity: expSummary.expiringCount > 3 ? 'medium' : 'low',
          title: '临期批次',
          message: `${expSummary.expiringCount} 个批次将在 7 天内到期`,
          link: '/batches',
          count: expSummary.expiringCount,
        });
      }
    }

    // 4. 价格大幅波动
    if (priceChanges.length > 0) {
      const increases = priceChanges.filter((p: any) => p.changePercent > 0);
      if (increases.length > 0) {
        alerts.push({
          id: 'price-increase',
          type: 'price_spike',
          severity: 'medium',
          title: '采购价格上涨',
          message: `${increases.length} 个产品近期采购价上涨超过 15%，最高涨幅 +${Math.max(...increases.map((p: any) => p.changePercent))}%`,
          link: '/analytics',
          count: increases.length,
        });
      }
    }

    // 5. 滞销商品预警
    if (slowMovers.items.length > 0) {
      const zeroSales = slowMovers.items.filter((i: any) => i.soldQty === 0);
      if (zeroSales.length > 0) {
        alerts.push({
          id: 'slow-movers',
          type: 'slow_mover',
          severity: 'low',
          title: '滞销商品',
          message: `${zeroSales.length} 个商品近 30 天零销量，占用库存资金`,
          link: '/analytics',
          count: zeroSales.length,
        });
      }
    }

    return alerts;
  },

  // 全局搜索：跨产品、发票、供应商的模糊搜索
  async globalSearch(query: string, limit = 20) {
    if (!query || query.trim().length < 1) return { products: [], invoices: [], suppliers: [] };
    const q = `%${query.trim()}%`;
    const searchLimit = Math.min(limit, 50);

    const [products, invoices, suppliers] = await Promise.all([
      db('products')
        .whereNull('deleted_at')
        .where(function () {
          this.where('name_en', 'like', q)
            .orWhere('name_zh', 'like', q)
            .orWhere('sku', 'like', q)
            .orWhere('barcode', 'like', q);
        })
        .select('id', 'name_en as nameEn', 'name_zh as nameZh', 'sku', 'barcode')
        .limit(searchLimit),
      db('invoices')
        .where(function () {
          this.where('invoice_number', 'like', q)
            .orWhere('notes', 'like', q);
        })
        .select(
          'invoices.id',
          'invoices.invoice_number as invoiceNumber',
          'invoices.grand_total as grandTotal',
          'invoices.status',
          'invoices.invoice_date as invoiceDate',
          'suppliers.name as supplierName'
        )
        .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
        .orderBy('invoices.created_at', 'desc')
        .limit(searchLimit),
      db('suppliers')
        .whereNull('deleted_at')
        .where(function () {
          this.where('name', 'like', q)
            .orWhere('code', 'like', q)
            .orWhere('contact_name', 'like', q)
            .orWhere('phone', 'like', q);
        })
        .select('id', 'name', 'code', 'contact_name as contactName', 'phone')
        .limit(searchLimit),
    ]);

    return { products, invoices, suppliers };
  },

  async getPurchaseTrend(filters: { period?: string; dateFrom?: string; dateTo?: string }) {
    const period = filters.period || 'week';
    let groupExpr: string;
    switch (period) {
      case 'day':
        groupExpr = 'DATE(invoice_date)';
        break;
      case 'month':
        groupExpr = "DATE_FORMAT(invoice_date, '%Y-%m-01')";
        break;
      default: // week
        groupExpr = 'DATE(DATE_SUB(invoice_date, INTERVAL WEEKDAY(invoice_date) DAY))';
        break;
    }

    const query = db('invoices')
      .where('status', 'confirmed')
      .select(
        db.raw(`${groupExpr} as date`),
        db.raw('COALESCE(SUM(grand_total), 0) as amount'),
        db.raw('COUNT(*) as invoiceCount')
      )
      .groupByRaw(groupExpr)
      .orderByRaw(`${groupExpr} ASC`);

    if (filters.dateFrom) query.where('invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) query.where('invoice_date', '<=', filters.dateTo);

    const data = await query;
    return data.map((row: any) => ({
      date: row.date,
      amount: Number(row.amount),
      invoiceCount: Number(row.invoiceCount),
    }));
  },

  async getProductRanking(filters: {
    type?: string;
    limit?: number;
    dateFrom?: string;
    dateTo?: string;
    categoryId?: number;
  }) {
    const limit = parseBoundedInt(filters.limit, { defaultValue: 20, min: 1, max: 100 });
    const type = filters.type || 'top_selling';

    if (type === 'top_selling') {
      const query = db('invoice_items')
        .select(
          'invoice_items.product_id as productId',
          'products.name_en as nameEn',
          'products.name_zh as nameZh',
          'categories.name as category',
          db.raw('SUM(invoice_items.quantity) as totalQuantity'),
          db.raw('SUM(invoice_items.line_total) as totalAmount'),
          db.raw('COUNT(DISTINCT invoice_items.invoice_id) as purchaseCount'),
          db.raw('AVG(invoice_items.unit_price) as avgPrice')
        )
        .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
        .join('products', 'invoice_items.product_id', 'products.id')
        .leftJoin('categories', 'products.category_id', 'categories.id')
        .where('invoices.status', 'confirmed')
        .whereNotNull('invoice_items.product_id')
        .groupBy('invoice_items.product_id')
        .orderBy('totalQuantity', 'desc')
        .limit(limit);

      if (filters.dateFrom) query.where('invoices.invoice_date', '>=', filters.dateFrom);
      if (filters.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);
      if (filters.categoryId) query.where('products.category_id', filters.categoryId);

      const data = await query;
      return data.map((row: any, i: number) => ({
        rank: i + 1,
        productId: row.productId,
        nameEn: row.nameEn,
        nameZh: row.nameZh,
        category: row.category,
        totalQuantity: Number(row.totalQuantity),
        totalAmount: Number(row.totalAmount),
        purchaseCount: Number(row.purchaseCount),
        avgPrice: Math.round(Number(row.avgPrice) * 100) / 100,
      }));
    } else {
      // slow_moving
      const slowDays = Number((await SettingModel.get('slow_moving_days')) || '30');

      const query = db('products')
        .select(
          'products.id as productId',
          'products.name_en as nameEn',
          'products.name_zh as nameZh',
          'categories.name as category',
          db.raw('MAX(invoices.invoice_date) as lastPurchaseDate'),
          db.raw('DATEDIFF(NOW(), MAX(invoices.invoice_date)) as daysSinceLastPurchase'),
          'inventory.quantity as currentStock'
        )
        .leftJoin('invoice_items', 'products.id', 'invoice_items.product_id')
        .leftJoin('invoices', function () {
          this.on('invoice_items.invoice_id', '=', 'invoices.id').andOn(
            'invoices.status',
            '=',
            db.raw("'confirmed'")
          );
        })
        .leftJoin('categories', 'products.category_id', 'categories.id')
        .leftJoin('inventory', 'products.id', 'inventory.product_id')
        .whereNull('products.deleted_at')
        .where('products.is_active', true)
        .groupBy('products.id')
        .havingRaw(
          'MAX(invoices.invoice_date) IS NULL OR DATEDIFF(NOW(), MAX(invoices.invoice_date)) > ?',
          [slowDays]
        )
        .orderByRaw('lastPurchaseDate ASC')
        .limit(limit);

      if (filters.categoryId) query.where('products.category_id', filters.categoryId);

      const data = await query;
      return data.map((row: any) => ({
        productId: row.productId,
        nameEn: row.nameEn,
        nameZh: row.nameZh,
        category: row.category,
        lastPurchaseDate: row.lastPurchaseDate,
        daysSinceLastPurchase: Number(row.daysSinceLastPurchase) || null,
        currentStock: Number(row.currentStock) || 0,
      }));
    }
  },

  async getPriceChanges(filters: {
    threshold?: number;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }) {
    const threshold =
      Number.isFinite(filters.threshold) && filters.threshold! > 0 ? filters.threshold! : 10;
    const limit = parseBoundedInt(filters.limit, { defaultValue: 50, min: 1, max: 100 });

    // 可选日期窗口：约束内层 invoice_items 扫描范围（PERF-5）。
    // 该子句在 curr/prev 两个子查询里各出现一次，绑定值需相应重复。
    const innerClauses: string[] = [];
    const innerBindings: any[] = [];
    if (filters.dateFrom) {
      innerClauses.push('inv.invoice_date >= ?');
      innerBindings.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      innerClauses.push('inv.invoice_date <= ?');
      innerBindings.push(filters.dateTo);
    }
    const dateSql = innerClauses.length ? ` AND ${innerClauses.join(' AND ')}` : '';

    // 获取每个产品（窗口内）最近两次采购价格
    const data = await db.raw(
      `
      SELECT
        p.id as productId,
        p.name_en as nameEn,
        p.name_zh as nameZh,
        curr.unit_price as currentPrice,
        prev.unit_price as previousPrice,
        ROUND(((curr.unit_price - prev.unit_price) / prev.unit_price) * 100, 1) as changePercent,
        curr_inv.invoice_date as changeDate,
        s.name as supplierName
      FROM products p
      INNER JOIN (
        SELECT ii.product_id, ii.unit_price, ii.invoice_id,
          ROW_NUMBER() OVER (PARTITION BY ii.product_id ORDER BY inv.invoice_date DESC) as rn
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id AND inv.status = 'confirmed'
        WHERE ii.product_id IS NOT NULL${dateSql}
      ) curr ON p.id = curr.product_id AND curr.rn = 1
      INNER JOIN (
        SELECT ii.product_id, ii.unit_price,
          ROW_NUMBER() OVER (PARTITION BY ii.product_id ORDER BY inv.invoice_date DESC) as rn
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id AND inv.status = 'confirmed'
        WHERE ii.product_id IS NOT NULL${dateSql}
      ) prev ON p.id = prev.product_id AND prev.rn = 2
      LEFT JOIN invoices curr_inv ON curr.invoice_id = curr_inv.id
      LEFT JOIN suppliers s ON curr_inv.supplier_id = s.id
      WHERE p.deleted_at IS NULL
        AND prev.unit_price > 0
        AND ABS((curr.unit_price - prev.unit_price) / prev.unit_price * 100) > ?
      ORDER BY ABS((curr.unit_price - prev.unit_price) / prev.unit_price) DESC
      LIMIT ?
    `,
      [...innerBindings, ...innerBindings, threshold, limit]
    );

    return (data[0] || []).map((row: any) => ({
      productId: row.productId,
      nameEn: row.nameEn,
      nameZh: row.nameZh,
      previousPrice: Number(row.previousPrice),
      currentPrice: Number(row.currentPrice),
      changePercent: Number(row.changePercent),
      changeDate: row.changeDate,
      supplierName: row.supplierName,
    }));
  },

  async getSupplierDistribution(filters: { dateFrom?: string; dateTo?: string }) {
    const query = db('invoices')
      .select(
        'invoices.supplier_id as supplierId',
        'suppliers.name as supplierName',
        db.raw('SUM(invoices.grand_total) as totalAmount'),
        db.raw('COUNT(*) as invoiceCount')
      )
      .join('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .where('invoices.status', 'confirmed')
      .whereNotNull('invoices.supplier_id')
      .groupBy('invoices.supplier_id')
      .orderBy('totalAmount', 'desc');

    if (filters.dateFrom) query.where('invoices.invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);

    const data = await query;
    const grandTotal = data.reduce((sum: number, row: any) => sum + Number(row.totalAmount), 0);

    return data.map((row: any) => ({
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      totalAmount: Number(row.totalAmount),
      percentage:
        grandTotal > 0 ? Math.round((Number(row.totalAmount) / grandTotal) * 1000) / 10 : 0,
      invoiceCount: Number(row.invoiceCount),
    }));
  },

  async getCategoryDistribution(filters: { dateFrom?: string; dateTo?: string }) {
    const query = db('invoice_items')
      .select(
        'categories.id as categoryId',
        'categories.name as categoryName',
        db.raw('SUM(invoice_items.line_total) as totalAmount'),
        db.raw('COUNT(DISTINCT invoice_items.product_id) as productCount')
      )
      .join('invoices', 'invoice_items.invoice_id', 'invoices.id')
      .join('products', 'invoice_items.product_id', 'products.id')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .where('invoices.status', 'confirmed')
      .whereNotNull('invoice_items.product_id')
      .groupBy('categories.id')
      .orderBy('totalAmount', 'desc');

    if (filters.dateFrom) query.where('invoices.invoice_date', '>=', filters.dateFrom);
    if (filters.dateTo) query.where('invoices.invoice_date', '<=', filters.dateTo);

    const data = await query;
    const grandTotal = data.reduce((sum: number, row: any) => sum + Number(row.totalAmount), 0);

    return data.map((row: any) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName || '未分类',
      totalAmount: Number(row.totalAmount),
      percentage:
        grandTotal > 0 ? Math.round((Number(row.totalAmount) / grandTotal) * 1000) / 10 : 0,
      productCount: Number(row.productCount),
    }));
  },

  async getReorderSuggestions() {
    const data = await db('inventory')
      .select(
        'inventory.product_id as productId',
        'products.name_en as nameEn',
        'products.name_zh as nameZh',
        'inventory.quantity as currentStock',
        'inventory.safe_stock as safeStock',
        'inventory.unit',
        'products.default_supplier_id',
        'products.category_id as categoryId',
        'suppliers.name as supplierName',
        'products.default_price as lastPrice'
      )
      .join('products', 'inventory.product_id', 'products.id')
      .leftJoin('suppliers', 'products.default_supplier_id', 'suppliers.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .orderByRaw('(inventory.safe_stock - inventory.quantity) DESC')
      // 结果上限：补货建议按缺口降序取最紧急的前 N 项，避免大目录下无界返回（PERF-N2）
      .limit(200);

    // 一次性批量查询所有低库存产品近4周的出库消耗，避免在循环内逐个查询（N+1）
    const productIds = data.map((row: any) => row.productId);
    const usageRows = productIds.length
      ? await db('inventory_logs')
          .whereIn('product_id', productIds)
          .where('type', 'out')
          .where('created_at', '>=', db.raw('DATE_SUB(NOW(), INTERVAL 4 WEEK)'))
          .groupBy('product_id')
          .select('product_id', db.raw('COALESCE(SUM(ABS(quantity)), 0) as totalUsage'))
      : [];
    const usageMap = new Map<number, number>(
      usageRows.map((r: any) => [r.product_id, Number(r.totalUsage || 0)])
    );

    // 计算平均周消耗量
    const results = [];
    for (const row of data) {
      const avgWeeklyUsage = (usageMap.get(row.productId) || 0) / 4;
      const deficit = Number(row.safeStock) - Number(row.currentStock);
      const suggestedQuantity = Math.max(deficit, Math.ceil(avgWeeklyUsage * 1.5));

      let urgency: 'high' | 'medium' | 'low' = 'low';
      if (Number(row.currentStock) <= 0) urgency = 'high';
      else if (Number(row.currentStock) < Number(row.safeStock) * 0.5) urgency = 'high';
      else urgency = 'medium';

      results.push({
        productId: row.productId,
        nameEn: row.nameEn,
        nameZh: row.nameZh,
        categoryId: row.categoryId != null ? Number(row.categoryId) : null,
        currentStock: Number(row.currentStock),
        safeStock: Number(row.safeStock),
        avgWeeklyUsage: Math.round(avgWeeklyUsage * 10) / 10,
        suggestedQuantity,
        suggestedSupplier: row.default_supplier_id
          ? { id: row.default_supplier_id, name: row.supplierName }
          : null,
        estimatedCost: suggestedQuantity * Number(row.lastPrice || 0),
        lastPrice: Number(row.lastPrice || 0),
        urgency,
      });
    }

    return results;
  },

  // 毛利汇总：基于已完成销售单的售价与成本快照
  async getProfitSummary(filters: { dateFrom?: string; dateTo?: string }) {
    const base = () => {
      const q = db('sales_items')
        .join('sales_orders', 'sales_items.sales_order_id', 'sales_orders.id')
        .where('sales_orders.status', 'completed');
      if (filters.dateFrom) q.where('sales_orders.created_at', '>=', filters.dateFrom);
      if (filters.dateTo) q.where('sales_orders.created_at', '<=', `${filters.dateTo} 23:59:59`);
      return q;
    };

    const totals = await base()
      .select(
        db.raw('COALESCE(SUM(sales_items.line_total), 0) as revenue'),
        db.raw(
          'COALESCE(SUM(COALESCE(sales_items.cost_price, 0) * sales_items.quantity), 0) as cost'
        ),
        db.raw('COUNT(DISTINCT sales_orders.id) as orderCount')
      )
      .first();

    const revenue = Number(totals?.revenue || 0);
    const cost = Number(totals?.cost || 0);
    const grossProfit = Math.round((revenue - cost) * 100) / 100;
    const margin = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;

    const topProducts = await base()
      .join('products', 'sales_items.product_id', 'products.id')
      .select('products.name_en as nameEn', 'products.name_zh as nameZh')
      .select(
        db.raw('SUM(sales_items.line_total) as revenue'),
        db.raw(
          'SUM(sales_items.line_total - COALESCE(sales_items.cost_price, 0) * sales_items.quantity) as profit'
        ),
        db.raw('SUM(sales_items.quantity) as qty')
      )
      .groupBy('sales_items.product_id', 'products.name_en', 'products.name_zh')
      .orderByRaw('profit DESC')
      .limit(10);

    return {
      revenue: Math.round(revenue * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      grossProfit,
      margin,
      orderCount: Number(totals?.orderCount || 0),
      topProducts: topProducts.map((r: any) => ({
        nameEn: r.nameEn,
        nameZh: r.nameZh,
        revenue: Math.round(Number(r.revenue) * 100) / 100,
        profit: Math.round(Number(r.profit) * 100) / 100,
        qty: Number(r.qty),
      })),
    };
  },

  // 滞销分析：有库存但近 N 天销量为 0 或很低的商品
  async getSalesSlowMovers(filters: { days?: number; limit?: number }) {
    const days = parseBoundedInt(filters.days, { defaultValue: 30, min: 1, max: 365 });
    const limit = parseBoundedInt(filters.limit, { defaultValue: 20, min: 1, max: 100 });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');

    const soldSub = db('sales_items')
      .join('sales_orders', 'sales_items.sales_order_id', 'sales_orders.id')
      .where('sales_orders.status', 'completed')
      .andWhere('sales_orders.created_at', '>=', cutoff)
      .groupBy('sales_items.product_id')
      .select('sales_items.product_id')
      .sum('sales_items.quantity as soldQty')
      .as('s');

    const rows = await db('inventory')
      .join('products', 'inventory.product_id', 'products.id')
      .leftJoin(soldSub, 's.product_id', 'inventory.product_id')
      .whereNull('products.deleted_at')
      .where('inventory.quantity', '>', 0)
      .select(
        'products.id as productId',
        'products.name_en as nameEn',
        'products.name_zh as nameZh',
        'inventory.quantity as currentStock',
        db.raw('COALESCE(s.soldQty, 0) as soldQty')
      )
      .orderByRaw('COALESCE(s.soldQty, 0) ASC, inventory.quantity DESC')
      .limit(limit);

    return {
      days,
      items: rows.map((r: any) => ({
        productId: r.productId,
        nameEn: r.nameEn,
        nameZh: r.nameZh,
        currentStock: Number(r.currentStock),
        soldQty: Number(r.soldQty || 0),
      })),
    };
  },

  // 销售趋势
  async getSalesTrend(filters: { period?: string; dateFrom?: string; dateTo?: string }) {
    const period = filters.period || 'week';
    let groupExpr: string;
    switch (period) {
      case 'day':
        groupExpr = 'DATE(sales_orders.created_at)';
        break;
      case 'month':
        groupExpr = "DATE_FORMAT(sales_orders.created_at, '%Y-%m-01')";
        break;
      default: // week
        groupExpr = 'DATE(DATE_SUB(sales_orders.created_at, INTERVAL WEEKDAY(sales_orders.created_at) DAY))';
        break;
    }
    const query = db('sales_items')
      .join('sales_orders', 'sales_items.sales_order_id', 'sales_orders.id')
      .where('sales_orders.status', 'completed')
      .select(
        db.raw(`${groupExpr} as date`),
        db.raw('COALESCE(SUM(sales_items.line_total), 0) as amount'),
        db.raw('COUNT(DISTINCT sales_orders.id) as orderCount')
      )
      .groupByRaw(groupExpr)
      .orderByRaw(`${groupExpr} ASC`);
    if (filters.dateFrom) query.where('sales_orders.created_at', '>=', filters.dateFrom);
    if (filters.dateTo) query.where('sales_orders.created_at', '<=', `${filters.dateTo} 23:59:59`);
    const data = await query;
    return data.map((row: any) => ({
      date: row.date,
      amount: Number(row.amount),
      orderCount: Number(row.orderCount),
    }));
  },
  // 毛利按分类汇总
  async getProfitByCategory(filters: { dateFrom?: string; dateTo?: string }) {
    const base = db('sales_items')
      .join('sales_orders', 'sales_items.sales_order_id', 'sales_orders.id')
      .join('products', 'sales_items.product_id', 'products.id')
      .leftJoin('categories', 'products.category_id', 'categories.id')
      .where('sales_orders.status', 'completed');
    if (filters.dateFrom) base.where('sales_orders.created_at', '>=', filters.dateFrom);
    if (filters.dateTo) base.where('sales_orders.created_at', '<=', `${filters.dateTo} 23:59:59`);
    const rows = await base
      .select(
        db.raw("COALESCE(categories.name, '未分类') as category"),
        db.raw('COALESCE(SUM(sales_items.line_total), 0) as revenue'),
        db.raw('COALESCE(SUM(COALESCE(sales_items.cost_price, 0) * sales_items.quantity), 0) as cost')
      )
      .groupBy('categories.id')
      .orderByRaw('revenue DESC');
    return rows.map((r: any) => ({
      category: r.category,
      revenue: Math.round(Number(r.revenue) * 100) / 100,
      cost: Math.round(Number(r.cost) * 100) / 100,
      profit: Math.round((Number(r.revenue) - Number(r.cost)) * 100) / 100,
    }));
  },
};
