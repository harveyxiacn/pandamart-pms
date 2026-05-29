import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoice_items', (table) => {
    table.string('raw_product_code', 120).nullable().after('raw_name_zh');
    table.string('raw_product_number', 120).nullable().after('raw_product_code');
    table.string('raw_un', 32).nullable().after('raw_product_number');
    table.string('raw_tax_code', 8).nullable().after('raw_un');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoice_items', (table) => {
    table.dropColumn('raw_tax_code');
    table.dropColumn('raw_un');
    table.dropColumn('raw_product_number');
    table.dropColumn('raw_product_code');
  });
}
