import { Knex } from 'knex';
import { encrypt } from '../../utils/crypto';

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex('ai_providers').first();
  if (existing) return;

  const seedApiKey = process.env.SEED_DEFAULT_AI_PROVIDER_API_KEY;
  if (!seedApiKey) {
    console.warn('[seed] 跳过默认 AI 提供商初始化：未配置 SEED_DEFAULT_AI_PROVIDER_API_KEY');
    return;
  }

  const apiKeyEncrypted = encrypt(seedApiKey);

  await knex('ai_providers').insert({
    name: '本地 GPT',
    base_url: 'http://127.0.0.1:8317',
    api_key_encrypted: apiKeyEncrypted,
    model: 'gpt-5.2',
    thinking_effort: 'xhigh',
    supports_vision: true,
    purpose: 'all',
    is_active: true,
    is_default: true,
    max_tokens: 32768,
    temperature: 0.30,
    notes: '开发环境默认',
  });
}
