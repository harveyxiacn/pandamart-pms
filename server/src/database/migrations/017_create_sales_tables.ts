import { Knex } from 'knex';

/**
 * 销售出库模块：闭合进销存（此前只能采购入库）。
 * - sales_orders：一次销售单（POS 风格，创建即完成；可作废并回补库存）。
 * - sales_items：销售明细，记录售价 unit_price 与成本快照 cost_price（为未来毛利分析预留）。
 * - inventory_logs 增加 sales_order_id，使销售出库可追溯（销售仍记为 type='out'，
 *   与现有用量/补货分析口径一致）。
 */
export const DEFAULT_STORE_ID = 1;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sales_orders', (table) => {
    table.increments('id').unsigned().primary();
    table
      .integer('store_id')
      .unsigned()
      .notNullable()
      .defaultTo(DEFAULT_STORE_ID)
      .references('id')
      .inTable('stores');
    table.string('order_no', 50).notNullable().unique();
    table.decimal('total', 12, 2).notNullable().defaultTo(0);
    table.enum('status', ['completed', 'voided']).notNullable().defaultTo('completed');
    table.string('note', 500).nullable();
    table.integer('sold_by').unsigned().notNullable().references('id').inTable('users');
    table.integer('voided_by').unsigned().nullable().references('id').inTable('users');
    table.dateTime('voided_at').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('store_id', 'idx_sales_orders_store_id');
    table.index('status', 'idx_sales_orders_status');
    table.index('created_at', 'idx_sales_orders_created_at');
  });

  await knex.schema.createTable('sales_items', (table) => {
    table.increments('id').unsigned().primary();
    table
      .integer('sales_order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('sales_orders')
      .onDelete('CASCADE');
    table.integer('product_id').unsigned().notNullable().references('id').inTable('products');
    table.decimal('quantity', 10, 2).notNullable();
    table.string('unit', 20).notNullable().defaultTo('Case');
    table.decimal('unit_price', 12, 2).notNullable();
    table.decimal('cost_price', 12, 2).nullable();
    table.decimal('line_total', 12, 2).notNullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('sales_order_id', 'idx_sales_items_order_id');
    table.index('product_id', 'idx_sales_items_product_id');
  });

  await knex.schema.alterTable('inventory_logs', (table) => {
    table
      .integer('sales_order_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('sales_orders')
      .onDelete('SET NULL');
    table.index('sales_order_id', 'idx_inventory_logs_sales_order_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inventory_logs', (table) => {
    table.dropForeign(['sales_order_id']);
    table.dropIndex('sales_order_id', 'idx_inventory_logs_sales_order_id');
    table.dropColumn('sales_order_id');
  });
  await knex.schema.dropTableIfExists('sales_items');
  await knex.schema.dropTableIfExists('sales_orders');
}
