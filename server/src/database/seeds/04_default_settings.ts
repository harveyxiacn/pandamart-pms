import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex('settings').first();
  if (existing) return;

  await knex('settings').insert([
    { key: 'default_safe_stock', value: '5', description: '默认安全库存量' },
    { key: 'stock_alert_enabled', value: 'true', description: '是否启用库存预警' },
    { key: 'email_notification_enabled', value: 'false', description: '是否启用邮件通知' },
    { key: 'notification_email', value: '""', description: '通知接收邮箱' },
    { key: 'invoice_require_approval', value: 'false', description: '入库是否需要审批' },
    { key: 'slow_moving_days', value: '30', description: '滞销产品判定天数' },
    { key: 'price_alert_threshold', value: '0.1', description: '价格异常波动告警阈值(10%)' },
  ]);
}
