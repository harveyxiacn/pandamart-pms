import { Knex } from 'knex';

/**
 * 商品零售售价（selling_price）。
 * - default_price 是采购成本（员工不可见），selling_price 是对客零售价（收银必需，员工可见）。
 * - 配合 sales_items.cost_price 成本快照，可计算毛利。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table) => {
    table.decimal('selling_price', 12, 2).nullable().after('default_price');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('products', (table) => {
    table.dropColumn('selling_price');
  });
}
