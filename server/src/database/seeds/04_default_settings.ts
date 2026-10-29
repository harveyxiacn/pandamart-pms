import { Knex } from 'knex';

/**
 * 默认系统设置。
 *
 * 逐 key 补齐而不是「表里有任意一行就整体跳过」：迁移 025 会先插入
 * assistant_mode 等新 key，旧写法会导致全新数据库跑 seed 时把其余默认值全部漏掉。
 * 已有的 key 一律保留管理员修改过的值。
 */
export async function seed(knex: Knex): Promise<void> {
  const defaults = [
    { key: 'default_safe_stock', value: '5', description: '默认安全库存量' },
    { key: 'stock_alert_enabled', value: 'true', description: '是否启用库存预警' },
    { key: 'email_notification_enabled', value: 'false', description: '是否启用邮件通知' },
    { key: 'notification_email', value: '""', description: '通知接收邮箱' },
    { key: 'invoice_require_approval', value: 'false', description: '入库是否需要审批' },
    { key: 'slow_moving_days', value: '30', description: '滞销产品判定天数' },
    { key: 'price_alert_threshold', value: '0.1', description: '价格异常波动告警阈值(10%)' },
    {
      key: 'assistant_mode',
      value: 'local',
      description: '智能助手默认模式：local（本地规则）/ llm（大模型）/ auto',
    },
    {
      key: 'assistant_snapshot_ttl_seconds',
      value: '60',
      description: '本地资料库快照缓存秒数，写操作会立即失效缓存',
    },
  ];

  for (const item of defaults) {
    const existing = await knex('settings').where({ key: item.key }).first();
    if (!existing) {
      await knex('settings').insert(item);
    }
  }
}
