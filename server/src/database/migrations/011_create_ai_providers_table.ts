import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_providers', (table) => {
    table.increments('id').unsigned().primary();
    table.string('name', 100).notNullable();
    table.string('base_url', 500).notNullable();
    table.text('api_key_encrypted').notNullable();
    table.string('model', 100).notNullable();
    table.enum('thinking_effort', ['xhigh', 'high', 'medium', 'low']).nullable();
    table.boolean('supports_vision').notNullable().defaultTo(true);
    table.enum('purpose', ['ocr', 'analysis', 'chat', 'all']).notNullable().defaultTo('all');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.boolean('is_default').notNullable().defaultTo(false);
    table.integer('max_tokens').notNullable().defaultTo(4096);
    table.decimal('temperature', 3, 2).notNullable().defaultTo(0.30);
    table.dateTime('last_test_at').nullable();
    table.boolean('last_test_success').nullable();
    table.integer('last_test_latency_ms').nullable();
    table.text('notes').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index(['purpose', 'is_active'], 'idx_ai_providers_purpose');
    table.index('is_default', 'idx_ai_providers_is_default');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_providers');
}
