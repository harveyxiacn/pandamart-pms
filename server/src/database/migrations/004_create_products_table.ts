import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (table) => {
    table.increments('id').unsigned().primary();
    table.string('sku', 50).nullable().unique();
    table.string('barcode', 50).nullable();
    table.string('name_en', 300).notNullable();
    table.string('name_zh', 300).nullable();
    table.integer('category_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL');
    table.integer('default_supplier_id').unsigned().nullable().references('id').inTable('suppliers').onDelete('SET NULL');
    table.string('default_unit', 20).notNullable().defaultTo('Case');
    table.decimal('default_price', 12, 2).nullable();
    table.string('image_url', 500).nullable();
    table.text('notes').nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('deleted_at').nullable();

    table.index('name_en', 'idx_products_name_en');
    table.index('name_zh', 'idx_products_name_zh');
    table.index('category_id', 'idx_products_category_id');
    table.index('default_supplier_id', 'idx_products_default_supplier_id');
    table.index('deleted_at', 'idx_products_deleted_at');
  });

  // 全文搜索索引
  await knex.raw('ALTER TABLE products ADD FULLTEXT INDEX idx_products_search (name_en, name_zh)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('products');
}
