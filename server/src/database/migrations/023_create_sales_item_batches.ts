import { Knex } from 'knex';

/**
 * 销售 FIFO 批次扣减（优化报告 DATA-5 / 模块设计 §4.6）：
 * 此前销售只扣 inventory.quantity，不回写 inventory_batches，导致「批次剩余量合计」与
 * 「库存总量」长期漂移；迁移 019 亦把"销售按 FIFO 扣批次"标注为后续增强项。
 *
 * 本迁移落地两件事：
 * 1. sales_item_batches：记录每一条销售明细实际消耗了哪些批次、各消耗多少。
 *    作废销售单时据此精确回补到原批次（而非盲目加回某个批次）。
 *    - sales_item_id 级联删除；batch_id 置空（批次行被清理时保留扣减历史）。
 * 2. inventory_batches (product_id, store_id, status, expiry_date) 复合索引：
 *    支撑 FIFO 选取时按「同商品同门店、状态 active、按到期日升序」加锁读，避免全表扫描。
 *
 * 说明：批次仍为"保质期台账"，库存总量以 inventory.quantity 为准；
 * 仅对存在批次的商品做 FIFO 扣减，无批次商品（多数非生鲜）行为不变，不阻塞销售。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sales_item_batches', (table) => {
    table.increments('id').unsigned().primary();
    table
      .integer('sales_item_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('sales_items')
      .onDelete('CASCADE');
    table
      .integer('batch_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('inventory_batches')
      .onDelete('SET NULL');
    table.decimal('quantity', 10, 2).notNullable();
    table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['sales_item_id'], 'idx_sib_sales_item');
    table.index(['batch_id'], 'idx_sib_batch');
  });

  await knex.schema.alterTable('inventory_batches', (table) => {
    table.index(
      ['product_id', 'store_id', 'status', 'expiry_date'],
      'idx_batches_fifo'
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('inventory_batches', (table) => {
    table.dropIndex(['product_id', 'store_id', 'status', 'expiry_date'], 'idx_batches_fifo');
  });
  await knex.schema.dropTableIfExists('sales_item_batches');
}
