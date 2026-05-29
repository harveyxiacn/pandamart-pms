import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('invoice_items', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('invoice_id').unsigned().notNullable().references('id').inTable('invoices').onDelete('CASCADE');
    table.integer('product_id').unsigned().nullable().references('id').inTable('products').onDelete('SET NULL');
    table.string('raw_name_en', 300).nullable();
    table.string('raw_name_zh', 300).nullable();
    table.decimal('quantity', 10, 2).notNullable();
    table.string('unit', 20).notNullable();
    table.decimal('unit_price', 12, 2).notNullable();
    table.decimal('line_total', 12, 2).notNullable();
    table.decimal('matched_confidence', 3, 2).nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('invoice_id', 'idx_invoice_items_invoice_id');
    table.index('product_id', 'idx_invoice_items_product_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invoice_items');
}
