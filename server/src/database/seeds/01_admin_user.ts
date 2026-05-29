import { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex('users').where('username', 'admin').first();
  if (existing) return;

  const seedPassword = process.env.SEED_ADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD;
  if (!seedPassword) {
    throw new Error('缺少 SEED_ADMIN_PASSWORD（或 E2E_ADMIN_PASSWORD）环境变量，无法创建默认管理员');
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(seedPassword)) {
    throw new Error('SEED_ADMIN_PASSWORD 必须至少8位且包含字母和数字');
  }

  const passwordHash = await bcrypt.hash(seedPassword, 12);

  await knex('users').insert({
    username: 'admin',
    password_hash: passwordHash,
    display_name: '管理员',
    email: 'admin@pandamart.com',
    role: 'admin',
    is_active: true,
  });
}
