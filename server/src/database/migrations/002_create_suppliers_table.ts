import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('suppliers', (table) => {
    table.increments('id').unsigned().primary();
    table.string('name', 200).notNullable();
    table.string('code', 50).nullable().unique();
    table.string('contact_name', 100).nullable();
    table.string('phone', 50).nullable();
    table.string('email', 255).nullable();
    table.text('address').nullable();
    table.text('notes').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('deleted_at').nullable();

    table.index('name', 'idx_suppliers_name');
    table.index('deleted_at', 'idx_suppliers_deleted_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('suppliers');
}
