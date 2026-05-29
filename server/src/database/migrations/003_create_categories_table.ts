import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('categories', (table) => {
    table.increments('id').unsigned().primary();
    table.string('name', 100).notNullable();
    table.string('name_en', 100).nullable();
    table.integer('parent_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL');
    table.integer('sort_order').notNullable().defaultTo(0);
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('parent_id', 'idx_categories_parent_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('categories');
}
