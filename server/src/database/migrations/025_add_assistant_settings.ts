import { Knex } from 'knex';

/**
 * 智能助手模式设置（迁移 025）。
 *
 * 默认 local：不依赖任何 LLM，直接基于实时资料库回答与预警；
 * 管理员可在「系统设置」切换为 llm（需要配置 AI 提供商）或 auto（有提供商时用 LLM）。
 *
 * 用「按 key 补齐」而不是整体插入：生产库已有 settings 行，不能覆盖管理员改过的值。
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex('settings').where({ key: 'assistant_mode' }).first();
  if (!exists) {
    await knex('settings').insert({
      key: 'assistant_mode',
      value: 'local',
      description: '智能助手默认模式：local（本地规则）/ llm（大模型）/ auto',
    });
  }

  const cacheTtl = await knex('settings').where({ key: 'assistant_snapshot_ttl_seconds' }).first();
  if (!cacheTtl) {
    await knex('settings').insert({
      key: 'assistant_snapshot_ttl_seconds',
      value: '60',
      description: '本地资料库快照缓存秒数，写操作会立即失效缓存',
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('settings').whereIn('key', ['assistant_mode', 'assistant_snapshot_ttl_seconds']).delete();
}
