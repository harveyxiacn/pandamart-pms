import OpenAI from 'openai';
import { AiProviderModel } from '../models/AiProvider';
import { AiProviderConfig, AiProviderRow } from '../types';
import { decrypt } from '../utils/crypto';
import logger from '../utils/logger';

function rowToConfig(row: AiProviderRow): AiProviderConfig {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: decrypt(row.api_key_encrypted),
    model: row.model,
    thinkingEffort: row.thinking_effort,
    supportsVision: !!row.supports_vision,
    purpose: row.purpose,
    isActive: !!row.is_active,
    maxTokens: row.max_tokens,
    temperature: Number(row.temperature),
  };
}

function normalizeBaseUrl(rawUrl: string, preferV1: boolean): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    if (!preferV1) {
      return trimmed;
    }
    return /\/v\d+$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
  }

  const path = url.pathname.replace(/\/+$/, '');
  const hasVersionPath = /\/v\d+$/i.test(path);
  if (preferV1 && !hasVersionPath) {
    url.pathname = path ? `${path}/v1` : '/v1';
  } else {
    url.pathname = path || '/';
  }

  const normalized = url.toString();
  return normalized.replace(/\/$/, '');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 仅对瞬时错误重试：限流(429)、服务端错误(5xx)、超时与网络错误。
// 4xx（鉴权/请求格式错误）属确定性失败，不重试。
function isTimeoutError(err: any): boolean {
  const code = String(err?.code || '');
  if (code === 'ETIMEDOUT') return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('超时');
}

function isRetryableError(err: any): boolean {
  const status = Number(err?.status || err?.response?.status || 0);
  if (status === 429 || (status >= 500 && status < 600)) return true;
  const code = String(err?.code || '');
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
    return true;
  }
  const msg = String(err?.message || '').toLowerCase();
  return isTimeoutError(err) || msg.includes('socket hang up');
}

// 指数退避重试：默认 3 次（1 次首发 + 2 次重试），退避 500ms / 1500ms。
// retryOnTimeout=false 时不对超时重试——用于 Vision 等非幂等且可能"已成功但响应超时"的调用，避免重复计费。
async function withRetry<T>(
  action: () => Promise<T>,
  label: string,
  opts: { maxAttempts?: number; retryOnTimeout?: boolean } = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const retryOnTimeout = opts.retryOnTimeout ?? true;
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (err: any) {
      lastErr = err;
      const retryable = isRetryableError(err) && !(retryOnTimeout === false && isTimeoutError(err));
      if (attempt >= maxAttempts || !retryable) {
        throw err;
      }
      const delay = 500 * Math.pow(3, attempt - 1);
      logger.warn(
        `LLM 调用 [${label}] 第 ${attempt} 次失败（${err?.message || err}），${delay}ms 后重试`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

export const llmService = {
  async getProvider(purpose: string): Promise<AiProviderConfig> {
    const row = await AiProviderModel.findByPurpose(purpose);
    if (!row) {
      throw new Error(`未找到可用的 AI 提供商 (用途: ${purpose})`);
    }
    return rowToConfig(row);
  },

  createClient(provider: AiProviderConfig, preferV1: boolean = true): OpenAI {
    return new OpenAI({
      baseURL: normalizeBaseUrl(provider.baseUrl, preferV1),
      apiKey: provider.apiKey,
    });
  },

  async withClientFallback<T>(
    provider: AiProviderConfig,
    action: (client: OpenAI) => Promise<T>
  ): Promise<T> {
    const preferredUrl = normalizeBaseUrl(provider.baseUrl, true);
    const rawUrl = normalizeBaseUrl(provider.baseUrl, false);

    try {
      return await action(this.createClient(provider, true));
    } catch (err: any) {
      const isNotFound = Number(err?.status || err?.response?.status) === 404;
      if (!isNotFound || preferredUrl === rawUrl) {
        throw err;
      }

      logger.warn(`LLM 调用 404，回退到原始 Base URL 重试: ${rawUrl}`);
      return action(this.createClient(provider, false));
    }
  },

  async chatCompletion(
    purpose: string,
    messages: any[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: any;
    }
  ): Promise<string> {
    const provider = await this.getProvider(purpose);

    const requestBody: any = {
      model: provider.model,
      messages,
      temperature: options?.temperature ?? provider.temperature,
      max_tokens: options?.maxTokens ?? provider.maxTokens,
    };

    if (provider.thinkingEffort) {
      requestBody.thinking = { effort: provider.thinkingEffort };
    }

    if (options?.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }

    logger.debug(`LLM 调用 [${provider.name}] model=${provider.model}`);

    const response = await withRetry(
      () => this.withClientFallback(provider, async (client) => client.chat.completions.create(requestBody)),
      `chat:${provider.name}`
    );
    return response.choices[0]?.message?.content || '';
  },

  // 支持工具调用（function calling）：返回完整的 assistant 消息（含 tool_calls），由调用方编排工具循环
  async chatCompletionRaw(
    purpose: string,
    messages: any[],
    options?: { temperature?: number; maxTokens?: number; tools?: any[]; toolChoice?: any }
  ): Promise<any> {
    const provider = await this.getProvider(purpose);

    const requestBody: any = {
      model: provider.model,
      messages,
      temperature: options?.temperature ?? provider.temperature,
      max_tokens: options?.maxTokens ?? provider.maxTokens,
    };
    if (provider.thinkingEffort) requestBody.thinking = { effort: provider.thinkingEffort };
    if (options?.tools && options.tools.length) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.toolChoice ?? 'auto';
    }

    const response = await withRetry(
      () => this.withClientFallback(provider, async (client) => client.chat.completions.create(requestBody)),
      `chat-tools:${provider.name}`
    );
    return response.choices[0]?.message;
  },

  async visionCompletion(imageBase64: string, prompt: string, mimeType: string = 'image/jpeg'): Promise<string> {
    const provider = await this.getProvider('ocr');
    if (!provider.supportsVision) {
      throw new Error('当前 AI 提供商不支持图片识别');
    }

    logger.debug(`LLM Vision 调用 [${provider.name}] model=${provider.model}`);
    // 每次尝试单独计时（180s），瞬时失败/超时按指数退避重试
    const response = await withRetry(
      () =>
        withTimeout(
          this.withClientFallback(provider, async (client) =>
            client.chat.completions.create({
              model: provider.model,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt },
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                    },
                  ],
                },
              ],
              max_tokens: Math.min(provider.maxTokens, 4096),
              temperature: 0.1,
            })
          ),
          180000,
          'OCR 图片识别超时，请稍后重试'
        ),
      `vision:${provider.name}`,
      { retryOnTimeout: false } // 视觉识别可能"已成功但响应超时"，超时不重试以免重复计费
    );

    return response.choices[0]?.message?.content || '';
  },

  async testConnection(
    providerConfig: AiProviderConfig
  ): Promise<{ success: boolean; message: string; latencyMs: number; modelResponse: string | null }> {
    const start = Date.now();
    try {
      const response = await this.withClientFallback(providerConfig, async (client) =>
        client.chat.completions.create({
          model: providerConfig.model,
          messages: [{ role: 'user', content: '请回复 "ok"' }],
          max_tokens: 10,
        })
      );

      const modelResponse = response.choices[0]?.message?.content || '';
      return {
        success: true,
        message: '连接成功',
        latencyMs: Date.now() - start,
        modelResponse,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        latencyMs: Date.now() - start,
        modelResponse: null,
      };
    }
  },
};
