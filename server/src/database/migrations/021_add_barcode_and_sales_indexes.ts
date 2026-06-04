import { Knex } from 'knex';

/**
 * 性能索引补充（优化报告 PERF-6 / PERF-7）：
 * - products.barcode：条码查产品（扫码/快速操作）的点查询，避免全表扫描。
 *   使用非唯一索引以兼容历史空值/可能的重复条码，不阻塞迁移。
 * - sales_orders(status, created_at)：毛利/滞销等按 status='completed' + 时间范围聚合。
 *
 * 约定备注：inventory_logs.quantity 记录"数量幅度"（非负），方向由 type 列表达；
 * 库存写入统一经 inventory.service.adjustStockTx（含 forUpdate 行锁与 store_id）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table) => {
    table.index(['barcode'], 'idx_products_barcode');
  });

  await knex.schema.alterTable('sales_orders', (table) => {
    table.index(['status', 'created_at'], 'idx_sales_orders_status_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table) => {
    table.dropIndex(['barcode'], 'idx_products_barcode');
  });

  await knex.schema.alterTable('sales_orders', (table) => {
    table.dropIndex(['status', 'created_at'], 'idx_sales_orders_status_created');
  });
}
