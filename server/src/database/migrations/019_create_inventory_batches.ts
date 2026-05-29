import { Knex } from 'knex';

/**
 * 批次 / 保质期管理（生鲜短保）。多店就绪：batch 带 store_id。
 * - products.is_perishable / shelf_life_days：标记需保质期管理的商品及货架期（天）。
 * - inventory_batches：每个收货批次一行，记录保质期与剩余数量，用于临期/过期预警与报损。
 *   说明：库存总量仍以 inventory.quantity 为准；批次为保质期跟踪台账，
 *   收货时入批次（同步增库存），过期时报损（同步减库存）。销售按 FIFO 扣批次为后续增强项。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table) => {
    table.boolean('is_perishable').notNullable().defaultTo(false).after('selling_price');
    table.integer('shelf_life_days').unsigned().nullable().after('is_perishable');
  });

  await knex.schema.createTable('inventory_batches', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    table.integer('store_id').unsigned().notNullable().defaultTo(1).references('id').inTable('stores');
    table.string('batch_no', 80).nullable();
    table.date('expiry_date').nullable();
    table.date('received_date').nullable();
    table.decimal('quantity', 10, 2).notNullable().defaultTo(0);
    table.enum('status', ['active', 'depleted', 'disposed']).notNullable().defaultTo('active');
    table.integer('invoice_id').unsigned().nullable().references('id').inTable('invoices').onDelete('SET NULL');
    table.string('note', 500).nullable();
    table.integer('created_by').unsigned().nullable().references('id').inTable('users');
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['product_id', 'store_id'], 'idx_batches_product_store');
    table.index(['status', 'expiry_date'], 'idx_batches_status_expiry');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_batches');
  await knex.schema.alterTable('products', (table) => {
    table.dropColumn('shelf_life_days');
    table.dropColumn('is_perishable');
  });
}
