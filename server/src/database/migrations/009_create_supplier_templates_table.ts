import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('supplier_templates', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('supplier_id').unsigned().notNullable().unique().references('id').inTable('suppliers').onDelete('CASCADE');
    table.enum('template_type', ['regex', 'positional', 'ai_prompt']).notNullable();
    table.json('template_config').notNullable();
    table.string('sample_file_path', 500).nullable();
    table.integer('success_count').notNullable().defaultTo(0);
    table.dateTime('last_used_at').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('supplier_templates');
}
