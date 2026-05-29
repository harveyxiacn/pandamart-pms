import db from '../config/database';
import { InventoryModel } from '../models/Inventory';
import { SettingModel } from '../models/Setting';

export const analyticsService = {
  async getDashboard() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

    // 计算本周起始（周一）
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // 本月起始
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // 今日统计
    const todayStats = await db('invoices')
      .where('invoice_date', '>=', todayStart)
      .where('status', 'confirmed')
      .select(
        db.raw('COUNT(*) as invoiceCount'),
        db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
      )
      .first();

    const pendingCount = await db('invoices')
      .where('status', 'pending')
      .count('id as count')
      .first();

    // 低库存预警数
    const lowStockResult = await db('inventory')
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .count('inventory.id as count')
      .first();

    // 本周统计
    const weekStats = await db('invoices')
      .where('invoice_date', '>=', weekStartStr)
      .where('status', 'confirmed')
      .select(
        db.raw('COUNT(*) as invoiceCount'),
        db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
      )
      .first();

    // 本月统计
    const monthStats = await db('invoices')
      .where('invoice_date', '>=', monthStart)
      .where('status', 'confirmed')
      .select(
        db.raw('COUNT(*) as invoiceCount'),
        db.raw('COALESCE(SUM(grand_total), 0) as totalAmount')
      )
      .first();

    // 最近发票
    const recentInvoices = await db('invoices')
      .select('invoices.id', 'suppliers.name as supplierName', 'invoices.invoice_number as invoiceNumber',
        'invoices.grand_total as grandTotal', 'invoices.status', 'invoices.created_at as createdAt')
      .leftJoin('suppliers', 'invoices.supplier_id', 'suppliers.id')
      .orderBy('invoices.created_at', 'desc')
      .limit(5);

    // 低库存产品
    const lowStockProducts = await db('inventory')
      .select('inventory.product_id as productId', 'products.name_en as nameEn',
        'products.name_zh as nameZh', 'inventory.quantity', 'inventory.safe_stock as safeStock', 'inventory.unit')
      .join('products', 'inventory.product_id', 'products.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .orderByRaw('(inventory.safe_stock - inventory.quantity) DESC')
      .limit(10);

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
    };
  },

  async getPurchaseTrend(filters: { period?: string; dateFrom?: string; dateTo?: string }) {
    const period = filters.period || 'week';
    let groupExpr: string;
    let dateFormat: string;

    switch (period) {
      case 'day':
        groupExpr = 'DATE(invoice_date)';
        dateFormat = '%Y-%m-%d';
        break;
      case 'month':
        groupExpr = "DATE_FORMAT(invoice_date, '%Y-%m-01')";
        dateFormat = '%Y-%m';
        break;
      default: // week
        groupExpr = "DATE(DATE_SUB(invoice_date, INTERVAL WEEKDAY(invoice_date) DAY))";
        dateFormat = '%Y-%m-%d';
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
    const limit = filters.limit || 20;
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
      const slowDays = Number(await SettingModel.get('slow_moving_days') || '30');

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
          this.on('invoice_items.invoice_id', '=', 'invoices.id')
            .andOn('invoices.status', '=', db.raw("'confirmed'"));
        })
        .leftJoin('categories', 'products.category_id', 'categories.id')
        .leftJoin('inventory', 'products.id', 'inventory.product_id')
        .whereNull('products.deleted_at')
        .where('products.is_active', true)
        .groupBy('products.id')
        .havingRaw('MAX(invoices.invoice_date) IS NULL OR DATEDIFF(NOW(), MAX(invoices.invoice_date)) > ?', [slowDays])
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
    const threshold = filters.threshold || 10;
    const limit = filters.limit || 50;

    // 获取每个产品最近两次采购价格
    const data = await db.raw(`
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
        WHERE ii.product_id IS NOT NULL
      ) curr ON p.id = curr.product_id AND curr.rn = 1
      INNER JOIN (
        SELECT ii.product_id, ii.unit_price,
          ROW_NUMBER() OVER (PARTITION BY ii.product_id ORDER BY inv.invoice_date DESC) as rn
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id AND inv.status = 'confirmed'
        WHERE ii.product_id IS NOT NULL
      ) prev ON p.id = prev.product_id AND prev.rn = 2
      LEFT JOIN invoices curr_inv ON curr.invoice_id = curr_inv.id
      LEFT JOIN suppliers s ON curr_inv.supplier_id = s.id
      WHERE p.deleted_at IS NULL
        AND prev.unit_price > 0
        AND ABS((curr.unit_price - prev.unit_price) / prev.unit_price * 100) > ?
      ORDER BY ABS((curr.unit_price - prev.unit_price) / prev.unit_price) DESC
      LIMIT ?
    `, [threshold, limit]);

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
      percentage: grandTotal > 0 ? Math.round((Number(row.totalAmount) / grandTotal) * 1000) / 10 : 0,
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
      percentage: grandTotal > 0 ? Math.round((Number(row.totalAmount) / grandTotal) * 1000) / 10 : 0,
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
        'suppliers.name as supplierName',
        'products.default_price as lastPrice'
      )
      .join('products', 'inventory.product_id', 'products.id')
      .leftJoin('suppliers', 'products.default_supplier_id', 'suppliers.id')
      .whereNull('products.deleted_at')
      .whereNotNull('inventory.safe_stock')
      .whereRaw('inventory.quantity < inventory.safe_stock')
      .orderByRaw('(inventory.safe_stock - inventory.quantity) DESC');

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
        db.raw('COALESCE(SUM(COALESCE(sales_items.cost_price, 0) * sales_items.quantity), 0) as cost'),
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
        db.raw('SUM(sales_items.line_total - COALESCE(sales_items.cost_price, 0) * sales_items.quantity) as profit'),
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
    const days = filters.days || 30;
    const limit = filters.limit || 20;
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
};
