import { Knex } from 'knex';

/**
 * 应付账款：供应商付款记录。
 * 应付 = 该供应商所有已确认发票 grand_total 之和 − 已付款之和（按需实时计算，不冗余存储）。
 * supplier_payments 记录每一笔付款，可选关联具体发票。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('supplier_payments', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('supplier_id').unsigned().notNullable().references('id').inTable('suppliers');
    table.integer('invoice_id').unsigned().nullable().references('id').inTable('invoices').onDelete('SET NULL');
    table.decimal('amount', 12, 2).notNullable();
    table.string('method', 40).nullable();
    table.date('paid_at').notNullable();
    table.string('note', 500).nullable();
    table.integer('created_by').unsigned().nullable().references('id').inTable('users');
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

    table.index('supplier_id', 'idx_supplier_payments_supplier_id');
    table.index('invoice_id', 'idx_supplier_payments_invoice_id');
    table.index('paid_at', 'idx_supplier_payments_paid_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('supplier_payments');
}
