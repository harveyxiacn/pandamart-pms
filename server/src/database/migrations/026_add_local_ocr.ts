import { Knex } from 'knex';

/**
 * 本地发票 OCR（迁移 026）。
 *
 * - invoices.ocr_method 增加 local_ocr，用于区分 Tesseract 本地识别与 text_extract（文本层解析）。
 * - settings 增加 invoice_ocr_mode：
 *   auto（默认，本地优先，低置信度才用 LLM）、local（只用本地，不调用 AI）、llm（保持原有 AI 优先）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (table) => {
    table.enum('ocr_method', ['text_extract', 'local_ocr', 'ai_vision', 'excel_parse', 'manual']).notNullable().alter();
  });

  const exists = await knex('settings').where({ key: 'invoice_ocr_mode' }).first();
  if (!exists) {
    await knex('settings').insert({
      key: 'invoice_ocr_mode',
      value: 'auto',
      description: '发票识别模式：auto（本地优先）/ local（仅本地，不调用 AI）/ llm（AI 优先）',
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('settings').where({ key: 'invoice_ocr_mode' }).delete();
  await knex('invoices').where({ ocr_method: 'local_ocr' }).update({ ocr_method: 'text_extract' });
  await knex.schema.alterTable('invoices', (table) => {
    table.enum('ocr_method', ['text_extract', 'ai_vision', 'excel_parse', 'manual']).notNullable().alter();
  });
}
