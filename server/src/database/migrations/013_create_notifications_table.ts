import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('type', ['stock_alert', 'price_alert', 'system', 'invoice']).notNullable();
    table.string('title', 200).notNullable();
    table.text('message').notNullable();
    table.boolean('is_read').notNullable().defaultTo(false);
    table.string('link', 500).nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('user_id', 'idx_notifications_user_id');
    table.index(['user_id', 'is_read'], 'idx_notifications_is_read');
    table.index('created_at', 'idx_notifications_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
}
