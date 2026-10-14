import { Knex } from 'knex';

/**
 * 供应商商品别名学习（Supplier Product Alias Learning）。
 *
 * 背景：OCR 识别出的商品行与系统内商品靠「模糊名称匹配」（ocr.service.findBestMatch）关联，
 * 对新供应商/新写法命中率低，且每次都要重新猜。人在发票确认环节修正商品归属后，这个
 * 修正结果本应被记住。
 *
 * 本表把「人工确认过的 原始字段 → 商品」沉淀为别名映射，OCR 下次遇到同供应商同字段即可
 * 高置信度直接命中，匹配准确率随使用逐步提升（学习型匹配器）。
 *
 * 取代此前完全未接线的 supplier_templates（表 + model + template.service 均为死代码：
 * tryMatchTemplate/saveTemplate 从无调用方，incrementSuccess 对永远为空的表做 UPDATE）。
 * supplier_templates 从未被写入过，故直接删除。
 *
 * 键类型 alias_type：
 *   - 'barcode'：原始 product_number（8–16 位数字条码）
 *   - 'code'   ：原始 product_code（供应商货号）
 *   - 'name'   ：原始英文名归一化（去符号、小写）
 * 唯一键 (supplier_id, alias_type, alias_key)：同供应商同一键只保留一条映射（人工修正可覆盖）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('supplier_product_aliases', (table) => {
    table.increments('id').unsigned().primary();
    table
      .integer('supplier_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('suppliers')
      .onDelete('CASCADE');
    table.enum('alias_type', ['barcode', 'code', 'name']).notNullable();
    table.string('alias_key', 160).notNullable();
    table
      .integer('product_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('products')
      .onDelete('CASCADE');
    table.integer('hits').unsigned().notNullable().defaultTo(1);
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['supplier_id', 'alias_type', 'alias_key'], 'uniq_alias_supplier_key');
    table.index(['supplier_id'], 'idx_alias_supplier');
  });

  // 死表清理：supplier_templates 从未被任何流程写入（详见上方说明）
  await knex.schema.dropTableIfExists('supplier_templates');
}

export async function down(knex: Knex): Promise<void> {
  // 忠实还原 009 建表（仅用于回滚）
  await knex.schema.createTable('supplier_templates', (table) => {
    table.increments('id').unsigned().primary();
    table
      .integer('supplier_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable('suppliers')
      .onDelete('CASCADE');
    table.enum('template_type', ['regex', 'positional', 'ai_prompt']).notNullable();
    table.json('template_config').notNullable();
    table.string('sample_file_path', 500).nullable();
    table.integer('success_count').notNullable().defaultTo(0);
    table.dateTime('last_used_at').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.dropTableIfExists('supplier_product_aliases');
}
