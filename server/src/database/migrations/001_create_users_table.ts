import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').unsigned().primary();
    table.string('username', 50).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('display_name', 100).notNullable();
    table.string('email', 255).nullable();
    table.enum('role', ['admin', 'staff']).notNullable().defaultTo('staff');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('last_login_at').nullable();
    table.integer('login_attempts').notNullable().defaultTo(0);
    table.dateTime('locked_until').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('role', 'idx_users_role');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
