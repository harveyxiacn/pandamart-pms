import { Knex } from 'knex';

/**
 * JWT 令牌失效机制（优化报告 SEC-5 / 审计 SEC-N6）：
 * users 增加 token_version（无符号整型，默认 0）。签发 JWT 时把当前 token_version 写入载荷 tv，
 * 鉴权中间件校验 token 的 tv 是否等于库中当前值；改密 / 管理员重置密码 / 改角色时递增 token_version，
 * 使该用户此前签发的所有令牌立即失效（无需等待 24h 过期）。
 *
 * 兼容旧令牌：迁移后历史令牌不含 tv（视为 0），与默认 token_version=0 相等，故部署当下不强制全员重登，
 * 仅在后续敏感变更后失效。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.integer('token_version').unsigned().notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('token_version');
  });
}
