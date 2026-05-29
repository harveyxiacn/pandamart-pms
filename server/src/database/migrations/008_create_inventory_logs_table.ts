import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('inventory_logs', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('product_id').unsigned().notNullable().references('id').inTable('products');
    table.enum('type', ['in', 'out', 'adjust', 'stocktake']).notNullable();
    table.decimal('quantity', 10, 2).notNullable();
    table.decimal('quantity_before', 10, 2).notNullable();
    table.decimal('quantity_after', 10, 2).notNullable();
    table.integer('invoice_id').unsigned().nullable().references('id').inTable('invoices').onDelete('SET NULL');
    table.string('reason', 500).nullable();
    table.integer('operated_by').unsigned().notNullable().references('id').inTable('users');
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('product_id', 'idx_inventory_logs_product_id');
    table.index('type', 'idx_inventory_logs_type');
    table.index('invoice_id', 'idx_inventory_logs_invoice_id');
    table.index('created_at', 'idx_inventory_logs_created_at');
    table.index(['product_id', 'created_at'], 'idx_inventory_logs_product_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory_logs');
}
