import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('inventory', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('product_id').unsigned().notNullable().unique().references('id').inTable('products').onDelete('CASCADE');
    table.decimal('quantity', 10, 2).notNullable().defaultTo(0);
    table.string('unit', 20).notNullable().defaultTo('Case');
    table.decimal('safe_stock', 10, 2).nullable();
    table.date('last_restock_date').nullable();
    table.decimal('last_restock_quantity', 10, 2).nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['quantity', 'safe_stock'], 'idx_inventory_quantity_safe');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('inventory');
}
