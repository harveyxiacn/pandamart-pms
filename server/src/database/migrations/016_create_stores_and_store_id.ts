import { Knex } from 'knex';

/**
 * 多门店就绪基础（当前单店运行，数据层为未来多店预留，避免后续重写）：
 * - 新建 stores 表，并插入默认门店（id=1）。
 * - 给 inventory / inventory_logs / invoices 增加 store_id（默认指向默认门店）。
 * - inventory 唯一键由 product_id 改为 (product_id, store_id)，未来同一商品可在多门店各持一行。
 *
 * 单店阶段：所有写入恒用 store_id=1，UI 不暴露门店选择；
 * 未来加店：仅新增 stores 行 + 让相关方法接收 storeId 参数即可，无需改表结构。
 */
export const DEFAULT_STORE_ID = 1;

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('stores', (table) => {
    table.increments('id').unsigned().primary();
    table.string('name', 100).notNullable();
    table.string('code', 50).nullable().unique();
    table.string('address', 255).nullable();
    table.string('phone', 50).nullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // 默认门店必须先存在，后续 store_id 默认值与外键才有效
  await knex('stores').insert({
    id: DEFAULT_STORE_ID,
    name: '本店',
    code: 'MAIN',
    is_default: true,
    is_active: true,
  });

  // inventory：加 store_id，改唯一键为 (product_id, store_id)
  await knex.schema.alterTable('inventory', (table) => {
    table
      .integer('store_id')
      .unsigned()
      .notNullable()
      .defaultTo(DEFAULT_STORE_ID)
      .references('id')
      .inTable('stores');
  });
  // 先建复合唯一索引（其最左列 product_id 同时满足原 FK 的索引需求），再删旧的单列唯一
  await knex.schema.alterTable('inventory', (table) => {
    table.unique(['product_id', 'store_id'], { indexName: 'uq_inventory_product_store' });
  });
  await knex.schema.alterTable('inventory', (table) => {
    table.dropUnique(['product_id'], 'inventory_product_id_unique');
  });

  await knex.schema.alterTable('inventory_logs', (table) => {
    table
      .integer('store_id')
      .unsigned()
      .notNullable()
      .defaultTo(DEFAULT_STORE_ID)
      .references('id')
      .inTable('stores');
    table.index('store_id', 'idx_inventory_logs_store_id');
  });

  await knex.schema.alterTable('invoices', (table) => {
    table
      .integer('store_id')
      .unsigned()
      .notNullable()
      .defaultTo(DEFAULT_STORE_ID)
      .references('id')
      .inTable('stores');
    table.index('store_id', 'idx_invoices_store_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (table) => {
    table.dropForeign(['store_id']);
    table.dropIndex('store_id', 'idx_invoices_store_id');
    table.dropColumn('store_id');
  });

  await knex.schema.alterTable('inventory_logs', (table) => {
    table.dropForeign(['store_id']);
    table.dropIndex('store_id', 'idx_inventory_logs_store_id');
    table.dropColumn('store_id');
  });

  await knex.schema.alterTable('inventory', (table) => {
    table.dropUnique(['product_id', 'store_id'], 'uq_inventory_product_store');
  });
  await knex.schema.alterTable('inventory', (table) => {
    table.unique(['product_id'], { indexName: 'inventory_product_id_unique' });
    table.dropForeign(['store_id']);
    table.dropColumn('store_id');
  });

  await knex.schema.dropTableIfExists('stores');
}
