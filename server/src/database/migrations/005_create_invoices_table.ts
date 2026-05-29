import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('invoices', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('supplier_id').unsigned().nullable().references('id').inTable('suppliers').onDelete('SET NULL');
    table.string('invoice_number', 100).notNullable();
    table.date('invoice_date').notNullable();
    table.string('customer_code', 50).nullable();
    table.decimal('subtotal', 12, 2).nullable();
    table.boolean('has_tax').notNullable().defaultTo(false);
    table.decimal('tax_amount', 12, 2).nullable();
    table.decimal('grand_total', 12, 2).notNullable();
    table.string('file_path', 500).notNullable();
    table.enum('file_type', ['pdf', 'image', 'excel']).notNullable();
    table.enum('ocr_method', ['text_extract', 'ai_vision', 'excel_parse', 'manual']).notNullable();
    table.json('ocr_raw_result').nullable();
    table.enum('status', ['pending', 'confirmed', 'rejected']).notNullable().defaultTo('pending');
    table.integer('uploaded_by').unsigned().notNullable().references('id').inTable('users');
    table.integer('confirmed_by').unsigned().nullable().references('id').inTable('users');
    table.dateTime('confirmed_at').nullable();
    table.text('notes').nullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
    table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('supplier_id', 'idx_invoices_supplier_id');
    table.index('invoice_number', 'idx_invoices_invoice_number');
    table.index('invoice_date', 'idx_invoices_invoice_date');
    table.index('status', 'idx_invoices_status');
    table.index('uploaded_by', 'idx_invoices_uploaded_by');
    table.index(['supplier_id', 'invoice_date'], 'idx_invoices_supplier_date');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invoices');
}
