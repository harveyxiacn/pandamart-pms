import { Knex } from 'knex';

/**
 * 为高频分析查询补充复合索引：
 * - invoices(status, invoice_date)：仪表盘/趋势/价格波动等大量 `WHERE status='confirmed' AND invoice_date >= ?`
 * - inventory_logs(product_id, type, created_at)：补货建议按 product_id + type='out' + 近4周时间范围聚合
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (table) => {
    table.index(['status', 'invoice_date'], 'idx_invoices_status_date');
  });

  await knex.schema.alterTable('inventory_logs', (table) => {
    table.index(['product_id', 'type', 'created_at'], 'idx_inventory_logs_prod_type_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (table) => {
    table.dropIndex(['status', 'invoice_date'], 'idx_invoices_status_date');
  });

  await knex.schema.alterTable('inventory_logs', (table) => {
    table.dropIndex(['product_id', 'type', 'created_at'], 'idx_inventory_logs_prod_type_date');
  });
}
