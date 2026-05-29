import app from '../app';
import db from '../config/database';
import { env } from '../config/env';
import path from 'path';
import type { Server } from 'http';
import { encrypt } from '../utils/crypto';

type ApiError = {
  code: string;
  message: string;
  details?: unknown[];
};

type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
  error?: ApiError;
};

type LoginPayload = {
  token: string;
  expiresIn: number;
  user: {
    id: number;
    username: string;
    role: string;
  };
};

type SupplierListPayload = {
  items: Array<{ id: number; name: string }>;
};

type UserListPayload = Array<{
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}>;

type InvoiceListPayload = {
  items: Array<{
    id: number;
    status: string;
  }>;
};

const E2E_ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME || 'admin';
const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || '';

if (!E2E_ADMIN_PASSWORD) {
  throw new Error('E2E_ADMIN_PASSWORD 未配置（可通过 E2E_ADMIN_PASSWORD 或 SEED_ADMIN_PASSWORD 提供）');
}

const runMigrations = parseBoolean(process.env.E2E_RUN_MIGRATIONS, env.nodeEnv !== 'production');
const runSeeds = parseBoolean(process.env.E2E_RUN_SEEDS, env.nodeEnv !== 'production');
const runWriteFlow = parseBoolean(process.env.E2E_WRITE_TEST, false);
const runSecurityRegression = parseBoolean(process.env.E2E_SECURITY_REGRESSION, true);
const runRateLimitRegression = parseBoolean(process.env.E2E_RATE_LIMIT_REGRESSION, false);

const e2eLoginMax = parsePositiveInt(process.env.E2E_RATE_LIMIT_LOGIN_MAX, 2);
const e2eQueryMax = parsePositiveInt(process.env.E2E_RATE_LIMIT_QUERY_MAX, 1);
const e2eOcrMax = parsePositiveInt(process.env.E2E_RATE_LIMIT_OCR_MAX, 2);
const e2eAiMax = parsePositiveInt(process.env.E2E_RATE_LIMIT_AI_MAX, 2);
const e2eExportMax = parsePositiveInt(process.env.E2E_RATE_LIMIT_EXPORT_MAX, 2);
const e2eAiProviderTestMax = parsePositiveInt(process.env.E2E_RATE_LIMIT_AI_PROVIDER_TEST_MAX, 2);

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.floor(parsed);
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function stringifyBody(body: unknown): string {
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

async function requestJson<T>(
  baseUrl: string,
  endpoint: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {}
): Promise<{ status: number; body: ApiResponse<T> | Record<string, unknown> | null }> {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  if (!text) {
    return { status: response.status, body: null };
  }

  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: { raw: text } };
  }
}

async function startTestServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server: Server = app.listen(0, '127.0.0.1');

    server.once('error', reject);
    server.once('listening', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('无法获取测试服务器端口'));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((err) => {
              if (err) {
                closeReject(err);
              } else {
                closeResolve();
              }
            });
          }),
      });
    });
  });
}

async function prepareDatabase(): Promise<void> {
  await db.raw('SELECT 1');
  console.log('[E2E] 数据库连接正常');

  if (runMigrations) {
    const migrationsDir = path.resolve(__dirname, '../database/migrations');
    const [batchNo, migrationFiles] = await db.migrate.latest({
      directory: migrationsDir,
      extension: 'ts',
    });
    console.log(`[E2E] 迁移完成，batch=${batchNo}，执行文件数=${migrationFiles.length}`);
  }

  if (runSeeds) {
    const seedsDir = path.resolve(__dirname, '../database/seeds');
    const seedFiles = await db.seed.run({
      directory: seedsDir,
      extension: 'ts',
    });
    console.log(`[E2E] Seed 完成，执行文件数=${seedFiles.length}`);
  }
}

async function runReadOnlyFlow(baseUrl: string): Promise<string> {
  const health = await requestJson<{ status: string }>(baseUrl, '/api/v1/health');
  ensure(
    health.status === 200 && (health.body as ApiResponse<{ status: string }>)?.success === true,
    `健康检查失败: status=${health.status}, body=${stringifyBody(health.body)}`
  );

  const unauthorized = await requestJson(baseUrl, '/api/v1/categories/flat');
  ensure(
    unauthorized.status === 401,
    `未认证访问校验失败: status=${unauthorized.status}, body=${stringifyBody(unauthorized.body)}`
  );

  const login = await requestJson<LoginPayload>(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      username: E2E_ADMIN_USERNAME,
      password: E2E_ADMIN_PASSWORD,
    },
  });

  ensure(
    login.status === 200 && (login.body as ApiResponse<LoginPayload>)?.success === true,
    `登录失败: status=${login.status}, body=${stringifyBody(login.body)}`
  );

  const token = (login.body as ApiResponse<LoginPayload>)?.data?.token;
  ensure(typeof token === 'string' && token.length > 0, '登录成功但未返回 token');

  const me = await requestJson<{ username: string }>(baseUrl, '/api/v1/auth/me', { token });
  ensure(
    me.status === 200 && (me.body as ApiResponse<{ username: string }>)?.success === true,
    `读取个人信息失败: status=${me.status}, body=${stringifyBody(me.body)}`
  );

  const categories = await requestJson<unknown[]>(baseUrl, '/api/v1/categories/flat', { token });
  ensure(
    categories.status === 200 &&
      (categories.body as ApiResponse<unknown[]>)?.success === true &&
      Array.isArray((categories.body as ApiResponse<unknown[]>)?.data),
    `分类接口失败: status=${categories.status}, body=${stringifyBody(categories.body)}`
  );

  console.log('[E2E] 只读链路验证通过（health/login/auth/categories）');
  return token;
}

async function loginAndGetToken(baseUrl: string, username: string, password: string): Promise<string> {
  const login = await requestJson<LoginPayload>(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { username, password },
  });

  ensure(
    login.status === 200 && (login.body as ApiResponse<LoginPayload>)?.success === true,
    `登录失败(username=${username}): status=${login.status}, body=${stringifyBody(login.body)}`
  );

  const token = (login.body as ApiResponse<LoginPayload>)?.data?.token;
  ensure(typeof token === 'string' && token.length > 0, `登录成功但未返回 token(username=${username})`);
  return token;
}

async function createUser(
  baseUrl: string,
  adminToken: string,
  user: { username: string; password: string; displayName: string; role: 'admin' | 'staff' }
): Promise<number> {
  const create = await requestJson<{ id: number }>(baseUrl, '/api/v1/users', {
    method: 'POST',
    token: adminToken,
    body: {
      username: user.username,
      password: user.password,
      displayName: user.displayName,
      role: user.role,
    },
  });

  ensure(
    create.status === 201 && (create.body as ApiResponse<{ id: number }>)?.success === true,
    `创建用户失败(username=${user.username}): status=${create.status}, body=${stringifyBody(create.body)}`
  );

  const userId = Number((create.body as ApiResponse<{ id: number }>)?.data?.id);
  ensure(Number.isInteger(userId) && userId > 0, `创建用户成功但 id 无效(username=${user.username})`);
  return userId;
}

async function expectForbidden(
  baseUrl: string,
  endpoint: string,
  options: { method?: string; token: string; body?: unknown; label: string }
): Promise<void> {
  const result = await requestJson(baseUrl, endpoint, {
    method: options.method,
    token: options.token,
    body: options.body,
  });

  ensure(
    result.status === 403,
    `${options.label} 预期 403，实际 status=${result.status}, body=${stringifyBody(result.body)}`
  );
}

async function expectWeakPasswordRejected(
  baseUrl: string,
  endpoint: string,
  options: { method: string; token: string; body: unknown; label: string }
): Promise<void> {
  const result = await requestJson(baseUrl, endpoint, {
    method: options.method,
    token: options.token,
    body: options.body,
  });

  ensure(
    result.status === 400,
    `${options.label} 预期 400，实际 status=${result.status}, body=${stringifyBody(result.body)}`
  );
}

async function ensureSupplierFixture(suffix: string): Promise<number> {
  const existing = await db('suppliers').whereNull('deleted_at').select('id').orderBy('id', 'asc').first();
  if (existing?.id) return Number(existing.id);

  const [supplierId] = await db('suppliers').insert({
    name: `E2E供应商-${suffix}`,
    code: `E2E-SUP-${suffix}`,
    is_active: true,
  });
  return Number(supplierId);
}

async function ensureProductFixture(suffix: string, supplierId: number): Promise<number> {
  const existing = await db('products').whereNull('deleted_at').select('id').orderBy('id', 'asc').first();
  if (existing?.id) return Number(existing.id);

  const [productId] = await db('products').insert({
    name_en: `E2E PRODUCT ${suffix}`,
    name_zh: null,
    default_supplier_id: supplierId,
    default_unit: 'Case',
    default_price: 12.5,
    is_active: true,
  });

  await db('inventory').insert({
    product_id: Number(productId),
    quantity: 0,
    unit: 'Case',
  });

  return Number(productId);
}

async function ensureAiProviderFixture(suffix: string): Promise<number> {
  const existing = await db('ai_providers').select('id').where('is_active', true).orderBy('id', 'asc').first();
  if (existing?.id) return Number(existing.id);

  const [id] = await db('ai_providers').insert({
    name: `E2E RL Provider ${suffix}`,
    base_url: 'http://127.0.0.1:8317',
    api_key_encrypted: encrypt('e2e-rate-limit-api-key'),
    model: 'gpt-5.2',
    thinking_effort: 'medium',
    supports_vision: true,
    purpose: 'all',
    is_active: true,
    is_default: true,
    max_tokens: 512,
    temperature: 0.3,
    notes: 'e2e rate-limit fixture',
  });

  return Number(id);
}

function ensureNotRateLimited(status: number, label: string, body: unknown): void {
  ensure(
    status !== 429,
    `${label} 预期未触发限流，实际 429: body=${stringifyBody(body)}`
  );
}

async function createInvoiceFixture(options: {
  invoiceNumber: string;
  supplierId: number;
  uploadedBy: number;
  status: 'pending' | 'confirmed' | 'rejected';
  grandTotal: number;
}): Promise<number> {
  const [invoiceId] = await db('invoices').insert({
    supplier_id: options.supplierId,
    invoice_number: options.invoiceNumber,
    invoice_date: '2026-01-15',
    customer_code: null,
    subtotal: options.grandTotal,
    has_tax: false,
    tax_amount: 0,
    grand_total: options.grandTotal,
    file_path: 'uploads/invoices/e2e-fixture.pdf',
    file_type: 'pdf',
    ocr_method: 'manual',
    ocr_raw_result: null,
    status: options.status,
    uploaded_by: options.uploadedBy,
    confirmed_by: options.status === 'confirmed' ? options.uploadedBy : null,
    confirmed_at: options.status === 'confirmed' ? db.fn.now() : null,
    notes: 'e2e fixture',
  });

  return Number(invoiceId);
}

async function createInvoiceItemFixture(options: {
  invoiceId: number;
  productId: number;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
}): Promise<void> {
  await db('invoice_items').insert({
    invoice_id: options.invoiceId,
    product_id: options.productId,
    raw_name_en: `E2E PRODUCT ${options.productId}`,
    raw_name_zh: null,
    raw_product_code: null,
    raw_product_number: null,
    raw_un: options.unit,
    raw_tax_code: 'E',
    quantity: options.quantity,
    unit: options.unit,
    unit_price: options.unitPrice,
    line_total: options.lineTotal,
  });
}

async function runRateLimitRegressionChecks(baseUrl: string, adminToken: string): Promise<void> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const rateStaffId = await createUser(baseUrl, adminToken, {
    username: `e2e_rl_staff_${suffix}`,
    password: 'RateStaff123',
    displayName: 'E2E RL Staff',
    role: 'staff',
  });
  const rateStaffToken = await loginAndGetToken(baseUrl, `e2e_rl_staff_${suffix}`, 'RateStaff123');
  ensure(rateStaffId > 0, '创建限流 staff 用户失败');

  await createUser(baseUrl, adminToken, {
    username: `e2e_rl_admin_${suffix}`,
    password: 'RateAdmin123',
    displayName: 'E2E RL Admin',
    role: 'admin',
  });
  const rateAdminToken = await loginAndGetToken(baseUrl, `e2e_rl_admin_${suffix}`, 'RateAdmin123');
  const providerId = await ensureAiProviderFixture(suffix);

  // 1) 登录限流应保持 IP 范围，并且不与通用限流叠加
  for (let i = 0; i < e2eLoginMax; i++) {
    const loginAttempt = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        username: `e2e_missing_user_${suffix}`,
        password: `WrongPass${i}`,
      },
    });
    ensureNotRateLimited(loginAttempt.status, `登录限流前置请求 #${i + 1}`, loginAttempt.body);
  }
  const loginBlocked = await requestJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      username: `e2e_missing_user_${suffix}`,
      password: 'WrongPassFinal',
    },
  });
  ensure(
    loginBlocked.status === 429,
    `登录限流阈值请求应返回429: status=${loginBlocked.status}, body=${stringifyBody(loginBlocked.body)}`
  );

  // 2) 普通查询限流应按用户隔离
  for (let i = 0; i < e2eQueryMax; i++) {
    const adminQuery = await requestJson(baseUrl, '/api/v1/categories/flat', { token: rateAdminToken });
    ensure(
      adminQuery.status === 200 && (adminQuery.body as ApiResponse)?.success === true,
      `Admin 查询基线失败: status=${adminQuery.status}, body=${stringifyBody(adminQuery.body)}`
    );
  }
  const adminQueryBlocked = await requestJson(baseUrl, '/api/v1/categories/flat', { token: rateAdminToken });
  ensure(
    adminQueryBlocked.status === 429,
    `Admin 查询超额应返回429: status=${adminQueryBlocked.status}, body=${stringifyBody(adminQueryBlocked.body)}`
  );
  const staffQueryIsolated = await requestJson(baseUrl, '/api/v1/categories/flat', { token: rateStaffToken });
  ensure(
    staffQueryIsolated.status === 200 && (staffQueryIsolated.body as ApiResponse)?.success === true,
    `用户级限流隔离失败（staff 不应因 admin 超额而被限流）: status=${staffQueryIsolated.status}, body=${stringifyBody(staffQueryIsolated.body)}`
  );

  // 3) OCR 上传应使用独立阈值并且不叠加通用限流
  for (let i = 0; i < e2eOcrMax; i++) {
    const uploadAttempt = await requestJson(baseUrl, '/api/v1/invoices/upload', {
      method: 'POST',
      token: rateAdminToken,
      body: {},
    });
    ensureNotRateLimited(uploadAttempt.status, `OCR 上传前置请求 #${i + 1}`, uploadAttempt.body);
  }
  const uploadBlocked = await requestJson(baseUrl, '/api/v1/invoices/upload', {
    method: 'POST',
    token: rateAdminToken,
    body: {},
  });
  ensure(
    uploadBlocked.status === 429,
    `OCR 上传超额应返回429: status=${uploadBlocked.status}, body=${stringifyBody(uploadBlocked.body)}`
  );

  // 4) AI 接口应使用独立阈值并且不叠加通用限流
  for (let i = 0; i < e2eAiMax; i++) {
    const aiAttempt = await requestJson(baseUrl, '/api/v1/ai/insights', { token: rateAdminToken });
    ensureNotRateLimited(aiAttempt.status, `AI 请求前置 #${i + 1}`, aiAttempt.body);
  }
  const aiBlocked = await requestJson(baseUrl, '/api/v1/ai/insights', { token: rateAdminToken });
  ensure(
    aiBlocked.status === 429,
    `AI 请求超额应返回429: status=${aiBlocked.status}, body=${stringifyBody(aiBlocked.body)}`
  );

  // 5) 导出接口应使用独立阈值并且不叠加通用限流
  for (let i = 0; i < e2eExportMax; i++) {
    const exportAttempt = await requestJson(baseUrl, '/api/v1/export/full-backup', { token: rateAdminToken });
    ensureNotRateLimited(exportAttempt.status, `导出请求前置 #${i + 1}`, exportAttempt.body);
  }
  const exportBlocked = await requestJson(baseUrl, '/api/v1/export/full-backup', { token: rateAdminToken });
  ensure(
    exportBlocked.status === 429,
    `导出请求超额应返回429: status=${exportBlocked.status}, body=${stringifyBody(exportBlocked.body)}`
  );

  // 6) AI provider 测试应使用独立阈值并且不叠加通用限流
  for (let i = 0; i < e2eAiProviderTestMax; i++) {
    const testAttempt = await requestJson(baseUrl, `/api/v1/ai-providers/${providerId}/test`, {
      method: 'POST',
      token: rateAdminToken,
      body: {},
    });
    ensureNotRateLimited(testAttempt.status, `AI Provider 测试前置 #${i + 1}`, testAttempt.body);
  }
  const testBlocked = await requestJson(baseUrl, `/api/v1/ai-providers/${providerId}/test`, {
    method: 'POST',
    token: rateAdminToken,
    body: {},
  });
  ensure(
    testBlocked.status === 429,
    `AI Provider 测试超额应返回429: status=${testBlocked.status}, body=${stringifyBody(testBlocked.body)}`
  );

  console.log('[E2E] 限流回归验证通过（用户维度 + 专用限流不叠加）');
}

async function runStaffFinancialVisibilityChecks(
  baseUrl: string,
  staffToken: string,
  adminToken: string,
  staffUserId: number
): Promise<void> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const supplierId = await ensureSupplierFixture(suffix);
  const productId = await ensureProductFixture(suffix, supplierId);

  const pendingInvoiceId = await createInvoiceFixture({
    invoiceNumber: `E2E-PENDING-${suffix}`,
    supplierId,
    uploadedBy: staffUserId,
    status: 'pending',
    grandTotal: 88,
  });

  const pendingEditInvoiceId = await createInvoiceFixture({
    invoiceNumber: `E2E-PENDING-EDIT-${suffix}`,
    supplierId,
    uploadedBy: staffUserId,
    status: 'pending',
    grandTotal: 66,
  });

  const confirmedInvoiceId = await createInvoiceFixture({
    invoiceNumber: `E2E-CONFIRMED-${suffix}`,
    supplierId,
    uploadedBy: staffUserId,
    status: 'confirmed',
    grandTotal: 199,
  });
  await createInvoiceItemFixture({
    invoiceId: confirmedInvoiceId,
    productId,
    quantity: 1,
    unit: 'Case',
    unitPrice: 10,
    lineTotal: 10,
  });

  const staffInvoiceList = await requestJson<InvoiceListPayload>(baseUrl, '/api/v1/invoices', {
    token: staffToken,
  });
  ensure(
    staffInvoiceList.status === 200 && (staffInvoiceList.body as ApiResponse<InvoiceListPayload>)?.success === true,
    `Staff 读取发票列表失败: status=${staffInvoiceList.status}, body=${stringifyBody(staffInvoiceList.body)}`
  );
  const staffInvoiceItems = (staffInvoiceList.body as ApiResponse<InvoiceListPayload>)?.data?.items || [];
  ensure(
    staffInvoiceItems.every((item) => item.status === 'pending'),
    `Staff 发票列表应仅包含 pending: ${stringifyBody(staffInvoiceItems)}`
  );

  const staffConfirmedFilter = await requestJson(baseUrl, '/api/v1/invoices?status=confirmed', {
    token: staffToken,
  });
  ensure(
    staffConfirmedFilter.status === 403,
    `Staff 访问 confirmed 发票列表预期 403，实际 status=${staffConfirmedFilter.status}, body=${stringifyBody(staffConfirmedFilter.body)}`
  );

  const staffPendingDetail = await requestJson(baseUrl, `/api/v1/invoices/${pendingInvoiceId}`, {
    token: staffToken,
  });
  ensure(
    staffPendingDetail.status === 200 && (staffPendingDetail.body as ApiResponse)?.success === true,
    `Staff 读取 pending 发票详情失败: status=${staffPendingDetail.status}, body=${stringifyBody(staffPendingDetail.body)}`
  );

  const staffConfirmedDetail = await requestJson(baseUrl, `/api/v1/invoices/${confirmedInvoiceId}`, {
    token: staffToken,
  });
  ensure(
    staffConfirmedDetail.status === 403,
    `Staff 读取 confirmed 发票详情预期 403，实际 status=${staffConfirmedDetail.status}, body=${stringifyBody(staffConfirmedDetail.body)}`
  );

  const staffConfirmedFile = await requestJson(baseUrl, `/api/v1/invoices/${confirmedInvoiceId}/file`, {
    token: staffToken,
  });
  ensure(
    staffConfirmedFile.status === 403,
    `Staff 下载 confirmed 发票文件预期 403，实际 status=${staffConfirmedFile.status}, body=${stringifyBody(staffConfirmedFile.body)}`
  );

  const staffPendingUpdate = await requestJson(baseUrl, `/api/v1/invoices/${pendingEditInvoiceId}`, {
    method: 'PUT',
    token: staffToken,
    body: {
      supplierId,
      invoiceNumber: `E2E-PENDING-EDITED-${suffix}`,
      invoiceDate: '2026-01-20',
      customerCode: null,
      items: [
        {
          productId,
          productNameEn: `E2E PRODUCT ${suffix}`,
          productNameZh: null,
          quantity: 2,
          unit: 'Case',
          unitPrice: 11,
          lineTotal: 22,
        },
      ],
      subtotal: 22,
      hasTax: false,
      taxAmount: 0,
      grandTotal: 22,
      notes: 'staff pending edit',
    },
  });
  ensure(
    staffPendingUpdate.status === 200 && (staffPendingUpdate.body as ApiResponse)?.success === true,
    `Staff 编辑 pending 发票失败: status=${staffPendingUpdate.status}, body=${stringifyBody(staffPendingUpdate.body)}`
  );

  const pendingConfirmInvoiceId = await createInvoiceFixture({
    invoiceNumber: `E2E-PENDING-CONFIRM-${suffix}`,
    supplierId,
    uploadedBy: staffUserId,
    status: 'pending',
    grandTotal: 16,
  });
  const staffConfirm = await requestJson<{
    invoiceId: number;
    status: string;
    newProductsCreated: number;
    inventoryUpdated: number;
    priceAlerts: Array<unknown>;
  }>(baseUrl, `/api/v1/invoices/${pendingConfirmInvoiceId}/confirm`, {
    method: 'POST',
    token: staffToken,
    body: {
      supplierId,
      invoiceNumber: `E2E-PENDING-CONFIRM-${suffix}`,
      invoiceDate: '2026-01-20',
      customerCode: null,
      notes: 'staff confirm boundary check',
      subtotal: 16,
      hasTax: false,
      taxAmount: 0,
      grandTotal: 16,
      items: [
        {
          productId,
          productNameEn: `E2E PRODUCT ${suffix}`,
          productNameZh: null,
          productCode: null,
          productNumber: null,
          un: 'Case',
          taxCode: 'E',
          quantity: 1,
          unit: 'Case',
          unitPrice: 16,
          lineTotal: 16,
          isNewProduct: false,
        },
      ],
    },
  });
  ensure(
    staffConfirm.status === 200 && (staffConfirm.body as ApiResponse)?.success === true,
    `Staff 确认 pending 发票失败: status=${staffConfirm.status}, body=${stringifyBody(staffConfirm.body)}`
  );
  const staffConfirmData = (staffConfirm.body as ApiResponse<any>)?.data || {};
  ensure(
    Array.isArray(staffConfirmData.priceAlerts) && staffConfirmData.priceAlerts.length === 0,
    `Staff 确认响应不应暴露历史价格告警: ${stringifyBody(staffConfirm.body)}`
  );

  const staffProductList = await requestJson(baseUrl, '/api/v1/products?page=1&pageSize=20', {
    token: staffToken,
  });
  ensure(
    staffProductList.status === 200 && (staffProductList.body as ApiResponse)?.success === true,
    `Staff 读取产品列表失败: status=${staffProductList.status}, body=${stringifyBody(staffProductList.body)}`
  );
  const products = ((staffProductList.body as ApiResponse<any>)?.data?.items || []) as any[];
  const targetProduct = products.find((item) => Number(item.id) === productId) || products[0];
  ensure(!!targetProduct, `产品列表为空，无法校验价格字段隐藏: body=${stringifyBody(staffProductList.body)}`);
  ensure(
    !Object.prototype.hasOwnProperty.call(targetProduct, 'default_price') &&
      !Object.prototype.hasOwnProperty.call(targetProduct, 'defaultPrice'),
    `Staff 产品列表不应暴露默认价格字段: ${stringifyBody(targetProduct)}`
  );

  const staffProductDetail = await requestJson(baseUrl, `/api/v1/products/${productId}`, {
    token: staffToken,
  });
  ensure(
    staffProductDetail.status === 200 && (staffProductDetail.body as ApiResponse)?.success === true,
    `Staff 读取产品详情失败: status=${staffProductDetail.status}, body=${stringifyBody(staffProductDetail.body)}`
  );
  const staffProductDetailData = (staffProductDetail.body as ApiResponse<any>)?.data || {};
  ensure(
    !Object.prototype.hasOwnProperty.call(staffProductDetailData, 'default_price') &&
      !Object.prototype.hasOwnProperty.call(staffProductDetailData, 'defaultPrice'),
    `Staff 产品详情不应暴露默认价格字段: ${stringifyBody(staffProductDetailData)}`
  );

  const staffPriceHistory = await requestJson(baseUrl, `/api/v1/products/${productId}/price-history`, {
    token: staffToken,
  });
  ensure(
    staffPriceHistory.status === 403,
    `Staff 访问产品价格历史预期 403，实际 status=${staffPriceHistory.status}, body=${stringifyBody(staffPriceHistory.body)}`
  );

  const staffSupplierProducts = await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}/products`, {
    token: staffToken,
  });
  ensure(
    staffSupplierProducts.status === 200 && (staffSupplierProducts.body as ApiResponse)?.success === true,
    `Staff 读取供应商产品列表失败: status=${staffSupplierProducts.status}, body=${stringifyBody(staffSupplierProducts.body)}`
  );
  const supplierProducts = ((staffSupplierProducts.body as ApiResponse<any>)?.data || []) as any[];
  ensure(
    supplierProducts.every(
      (item) =>
        !Object.prototype.hasOwnProperty.call(item, 'default_price') &&
        !Object.prototype.hasOwnProperty.call(item, 'defaultPrice')
    ),
    `Staff 供应商产品列表不应暴露默认价格字段: ${stringifyBody(supplierProducts)}`
  );

  const staffSupplierDetail = await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}`, {
    token: staffToken,
  });
  ensure(
    staffSupplierDetail.status === 200 && (staffSupplierDetail.body as ApiResponse)?.success === true,
    `Staff 读取供应商详情失败: status=${staffSupplierDetail.status}, body=${stringifyBody(staffSupplierDetail.body)}`
  );
  const supplierStats = (staffSupplierDetail.body as ApiResponse<any>)?.data?.stats || {};
  ensure(
    !Object.prototype.hasOwnProperty.call(supplierStats, 'totalAmount'),
    `Staff 供应商详情不应暴露总采购金额: ${stringifyBody(supplierStats)}`
  );

  const staffSupplierInvoices = await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}/invoices`, {
    token: staffToken,
  });
  ensure(
    staffSupplierInvoices.status === 403,
    `Staff 访问供应商发票历史预期 403，实际 status=${staffSupplierInvoices.status}, body=${stringifyBody(staffSupplierInvoices.body)}`
  );

  const adminConfirmedFilter = await requestJson(baseUrl, '/api/v1/invoices?status=confirmed', {
    token: adminToken,
  });
  ensure(
    adminConfirmedFilter.status === 200 && (adminConfirmedFilter.body as ApiResponse)?.success === true,
    `Admin 读取 confirmed 发票列表应保持可用: status=${adminConfirmedFilter.status}, body=${stringifyBody(adminConfirmedFilter.body)}`
  );

  const adminPriceHistory = await requestJson(baseUrl, `/api/v1/products/${productId}/price-history`, {
    token: adminToken,
  });
  ensure(
    adminPriceHistory.status === 200 && (adminPriceHistory.body as ApiResponse)?.success === true,
    `Admin 读取价格历史应保持可用: status=${adminPriceHistory.status}, body=${stringifyBody(adminPriceHistory.body)}`
  );

  const adminSupplierInvoices = await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}/invoices`, {
    token: adminToken,
  });
  ensure(
    adminSupplierInvoices.status === 200 && (adminSupplierInvoices.body as ApiResponse)?.success === true,
    `Admin 读取供应商发票历史应保持可用: status=${adminSupplierInvoices.status}, body=${stringifyBody(adminSupplierInvoices.body)}`
  );

  const adminSupplierDetail = await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}`, {
    token: adminToken,
  });
  const adminStats = (adminSupplierDetail.body as ApiResponse<any>)?.data?.stats || {};
  ensure(
    Object.prototype.hasOwnProperty.call(adminStats, 'totalAmount'),
    `Admin 供应商详情应保留总采购金额字段: ${stringifyBody(adminStats)}`
  );

  console.log('[E2E] 财务可见性边界验证通过（staff受限/admin不变）');
}

async function runSecurityHardeningChecks(baseUrl: string, adminToken: string): Promise<void> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const staffUsername = `e2e_staff_${suffix}`;
  const staffPassword = 'Staff1234';
  const staffId = await createUser(baseUrl, adminToken, {
    username: staffUsername,
    password: staffPassword,
    displayName: 'E2E Staff',
    role: 'staff',
  });
  const staffToken = await loginAndGetToken(baseUrl, staffUsername, staffPassword);

  await runStaffFinancialVisibilityChecks(baseUrl, staffToken, adminToken, staffId);

  await expectForbidden(baseUrl, '/api/v1/analytics/dashboard', {
    token: staffToken,
    label: 'Staff 访问 analytics dashboard',
  });

  await expectForbidden(baseUrl, '/api/v1/ai/reorder-advice', {
    method: 'POST',
    token: staffToken,
    body: {},
    label: 'Staff 访问 AI reorder-advice',
  });

  await expectForbidden(baseUrl, '/api/v1/ai/insights', {
    token: staffToken,
    label: 'Staff 访问 AI insights',
  });

  await expectForbidden(baseUrl, '/api/v1/inventory/1/adjust', {
    method: 'POST',
    token: staffToken,
    body: { type: 'adjust', quantity: 1, reason: 'e2e-check' },
    label: 'Staff 手动调整库存',
  });

  const disableStaff = await requestJson(baseUrl, `/api/v1/users/${staffId}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { isActive: false },
  });
  ensure(
    disableStaff.status === 200 && (disableStaff.body as ApiResponse)?.success === true,
    `禁用 staff 失败: status=${disableStaff.status}, body=${stringifyBody(disableStaff.body)}`
  );

  const disabledStaffCall = await requestJson(baseUrl, '/api/v1/categories/flat', { token: staffToken });
  ensure(
    disabledStaffCall.status === 401,
    `禁用用户旧 token 预期 401，实际 status=${disabledStaffCall.status}, body=${stringifyBody(disabledStaffCall.body)}`
  );

  const adminUserUsername = `e2e_admin_${suffix}`;
  const adminUserPassword = 'Admin1234';
  const adminUserId = await createUser(baseUrl, adminToken, {
    username: adminUserUsername,
    password: adminUserPassword,
    displayName: 'E2E Admin',
    role: 'admin',
  });
  const demotedAdminToken = await loginAndGetToken(baseUrl, adminUserUsername, adminUserPassword);

  const demote = await requestJson(baseUrl, `/api/v1/users/${adminUserId}`, {
    method: 'PUT',
    token: adminToken,
    body: { role: 'staff' },
  });
  ensure(
    demote.status === 200 && (demote.body as ApiResponse)?.success === true,
    `降权 admin 失败: status=${demote.status}, body=${stringifyBody(demote.body)}`
  );

  const demotedAdminCall = await requestJson<UserListPayload>(baseUrl, '/api/v1/users', {
    token: demotedAdminToken,
  });
  ensure(
    demotedAdminCall.status === 403,
    `降权用户旧 admin token 预期 403，实际 status=${demotedAdminCall.status}, body=${stringifyBody(demotedAdminCall.body)}`
  );

  await expectWeakPasswordRejected(baseUrl, '/api/v1/users', {
    method: 'POST',
    token: adminToken,
    body: {
      username: `e2e_weak_create_${suffix}`,
      password: 'abcdefgh',
      displayName: 'WeakCreate',
      role: 'staff',
    },
    label: '创建用户弱密码校验',
  });

  const passwordUserUsername = `e2e_pwd_${suffix}`;
  const passwordUserPassword = 'Pass1234';
  const passwordUserId = await createUser(baseUrl, adminToken, {
    username: passwordUserUsername,
    password: passwordUserPassword,
    displayName: 'Pwd User',
    role: 'staff',
  });
  const passwordUserToken = await loginAndGetToken(baseUrl, passwordUserUsername, passwordUserPassword);

  await expectWeakPasswordRejected(baseUrl, '/api/v1/auth/password', {
    method: 'PUT',
    token: passwordUserToken,
    body: {
      currentPassword: passwordUserPassword,
      newPassword: 'ab12cd3',
    },
    label: '修改密码弱密码校验',
  });

  await expectWeakPasswordRejected(baseUrl, `/api/v1/users/${passwordUserId}/reset-password`, {
    method: 'PUT',
    token: adminToken,
    body: {
      newPassword: '12345678',
    },
    label: '重置密码弱密码校验',
  });

  console.log('[E2E] 安全加固回归验证通过（权限/Token即时失效/弱密码）');
}

async function runWriteValidation(baseUrl: string, token: string): Promise<void> {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const supplierName = `E2E供应商-${suffix}`;
  const supplierCode = `E2E-${suffix}`;
  let supplierId: number | null = null;

  try {
    const create = await requestJson<{ id: number }>(baseUrl, '/api/v1/suppliers', {
      method: 'POST',
      token,
      body: { name: supplierName, code: supplierCode },
    });

    ensure(
      create.status === 201 && (create.body as ApiResponse<{ id: number }>)?.success === true,
      `创建供应商失败: status=${create.status}, body=${stringifyBody(create.body)}`
    );

    supplierId = Number((create.body as ApiResponse<{ id: number }>)?.data?.id);
    ensure(Number.isInteger(supplierId) && supplierId > 0, '创建供应商成功但未返回有效 id');

    const list = await requestJson<SupplierListPayload>(
      baseUrl,
      `/api/v1/suppliers?keyword=${encodeURIComponent(supplierCode)}`,
      { token }
    );
    const found = (list.body as ApiResponse<SupplierListPayload>)?.data?.items?.some(
      (item) => item.id === supplierId
    );

    ensure(
      list.status === 200 && (list.body as ApiResponse<SupplierListPayload>)?.success === true && found,
      `供应商列表校验失败: status=${list.status}, body=${stringifyBody(list.body)}`
    );

    const remove = await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}`, {
      method: 'DELETE',
      token,
    });
    ensure(
      remove.status === 200 && (remove.body as ApiResponse)?.success === true,
      `删除供应商失败: status=${remove.status}, body=${stringifyBody(remove.body)}`
    );

    supplierId = null;
    console.log('[E2E] 写链路验证通过（supplier create/list/delete）');
  } finally {
    if (supplierId) {
      await requestJson(baseUrl, `/api/v1/suppliers/${supplierId}`, {
        method: 'DELETE',
        token,
      });
    }
  }
}

async function main(): Promise<void> {
  console.log(`[E2E] 环境=${env.nodeEnv}, host=${env.db.host}, db=${env.db.name}`);
  console.log(
    `[E2E] 配置: migrations=${runMigrations}, seeds=${runSeeds}, writeFlow=${runWriteFlow}, securityRegression=${runSecurityRegression}, rateLimitRegression=${runRateLimitRegression}`
  );

  await prepareDatabase();

  const server = await startTestServer();
  console.log(`[E2E] 测试服务器已启动: ${server.baseUrl}`);

  try {
    const token = await runReadOnlyFlow(server.baseUrl);

    if (runRateLimitRegression) {
      await runRateLimitRegressionChecks(server.baseUrl, token);
    } else {
      console.log('[E2E] 已跳过限流回归（设置 E2E_RATE_LIMIT_REGRESSION=true 可启用）');
    }

    if (runSecurityRegression) {
      await runSecurityHardeningChecks(server.baseUrl, token);
    } else {
      console.log('[E2E] 已跳过安全加固回归（设置 E2E_SECURITY_REGRESSION=true 可启用）');
    }

    if (runWriteFlow) {
      await runWriteValidation(server.baseUrl, token);
    } else {
      console.log('[E2E] 已跳过写链路（设置 E2E_WRITE_TEST=true 可启用）');
    }

    console.log('[E2E] 集成测试全部通过');
  } finally {
    await server.close();
    await db.destroy();
  }
}

main().catch(async (err) => {
  console.error('[E2E] 集成测试失败');
  console.error(err);
  try {
    await db.destroy();
  } catch {
    // ignore db cleanup error
  }
  process.exit(1);
});
