import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 50).notNullable();
    table.string('entity_type', 50).notNullable();
    table.integer('entity_id').unsigned().nullable();
    table.json('details').nullable();
    table.string('ip_address', 45).nullable();
    table.string('user_agent', 500).nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('user_id', 'idx_audit_logs_user_id');
    table.index('action', 'idx_audit_logs_action');
    table.index(['entity_type', 'entity_id'], 'idx_audit_logs_entity');
    table.index('created_at', 'idx_audit_logs_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}
