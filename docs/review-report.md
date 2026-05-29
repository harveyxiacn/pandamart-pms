# PandaMart PMS 项目审查与优化报告

> 版本：v1.0  
> 日期：2026-03-05  
> 审查范围：全栈代码、数据库设计、架构、安全、性能、UX、测试覆盖  
> 审查基准：开发日志 #1 ~ #12 完成后的代码快照

---

## 目录

1. [项目现状总结](#1-项目现状总结)
2. [架构与代码质量审查](#2-架构与代码质量审查)
3. [安全性审查](#3-安全性审查)
4. [性能优化建议](#4-性能优化建议)
5. [前端优化建议](#5-前端优化建议)
6. [后端优化建议](#6-后端优化建议)
7. [数据库优化建议](#7-数据库优化建议)
8. [测试覆盖优化](#8-测试覆盖优化)
9. [新功能建议与设计](#9-新功能建议与设计)
10. [优先级排序与实施路线图](#10-优先级排序与实施路线图)

---

## 1. 项目现状总结

### 1.1 已完成功能

| 模块 | 状态 | 完成度 |
|------|------|--------|
| 用户认证（JWT + 账号锁定） | ✅ 已完成 | 100% |
| 发票 OCR（PDF/图片/Excel） | ✅ 已完成 | 95% |
| 发票管理（CRUD + 确认/驳回/回滚） | ✅ 已完成 | 100% |
| 库存管理（入库/出库/盘点/预警） | ✅ 已完成 | 90% |
| 产品管理（CRUD + 搜索） | ✅ 已完成 | 90% |
| 供应商管理 | ✅ 已完成 | 85% |
| 数据分析仪表盘 | ✅ 已完成 | 85% |
| AI 对话 + 洞察 + 订货建议 | ✅ 已完成 | 80% |
| AI 多提供商管理 | ✅ 已完成 | 95% |
| 通知系统 | ✅ 已完成 | 75% |
| 审计日志 | ✅ 已完成 | 90% |
| 数据导出 | ✅ 已完成 | 80% |
| 前端测试 | ✅ 已完成 | 30%（仅基础） |
| 后端 E2E 测试 | ✅ 已完成 | 60% |

### 1.2 技术栈健康度

- **前端**：React 18 + Vite 7 + TailwindCSS 3 + Zustand + Recharts — 选型合理，版本较新
- **后端**：Express 4 + Knex 3 + TypeScript — 稳定成熟
- **数据库**：MariaDB 10.x — 适合共享主机
- **AI 层**：openai SDK + 多提供商抽象 — 设计灵活

---

## 2. 架构与代码质量审查

### 2.1 ✅ 优点

- **分层清晰**：Routes → Services → Models 三层分离，职责明确
- **统一错误处理**：`AppError` + `errorHandler` 中间件，API 响应格式一致
- **审计可追溯**：关键操作均写入 `audit_logs`
- **AI 抽象层**：`llm.service.ts` 统一封装多提供商，支持 BaseURL 回退
- **OCR 混合方案**：PDF 文本提取 → LLM Vision 降级，兼顾成本和准确率
- **前端懒加载**：所有页面 `lazy()` 按需加载
- **前端 UI 组件化**：Button/Input/Select/Card/Badge/Modal/Table 统一封装

### 2.2 ⚠️ 需改进项

#### A. 后端 TypeScript 类型安全不足

**问题**：多处使用 `any` 类型，失去 TypeScript 类型保护。

```typescript
// invoice.service.ts:31 — filters 参数为 any
async getAll(filters: any) { ... }

// invoice.service.ts:40 — map 回调参数为 any
items.map(async (inv: any) => { ... })

// InvoiceModel.findById 返回 Promise<any>
async findById(id: number): Promise<any | undefined> { ... }
```

**建议**：为所有 Model 返回值和 Service 参数定义明确的 interface，至少覆盖核心数据流（Invoice/Product/Inventory）。

#### B. 路由层缺少统一 async 错误捕获

**问题**：每个路由处理器都重复 `try/catch + sendError` 模式。

```typescript
// 当前模式（每个路由都重复）
router.get('/', authenticate, async (req, res) => {
  try {
    // ...
  } catch (err: any) {
    sendError(res, err.statusCode || 500, err.code || 'INTERNAL_ERROR', err.message);
  }
});
```

**建议**：引入 `asyncHandler` 高阶函数，消除重复代码：

```typescript
function asyncHandler(fn: (req: AuthRequest, res: Response) => Promise<void>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
// 路由简化为：
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await invoiceService.getAll({ ... });
  sendSuccess(res, result);
}));
```

#### C. 发票列表页过度膨胀

**问题**：`InvoiceListPage.tsx` 高达 **827 行 / 33KB**，包含列表、详情弹窗、编辑表单、重算逻辑全部内联。

**建议**：拆分为：
- `InvoiceListPage.tsx` — 列表 + 筛选
- `InvoiceDetailModal.tsx` — 详情/编辑弹窗
- `InvoiceEditForm.tsx` — 编辑表单逻辑
- `useInvoiceDetail.ts` — 详情数据 hook

#### D. N+1 查询问题

**问题**：`invoiceService.getAll()` 内层循环对每条发票调用 `InvoiceModel.getItemCount(inv.id)`。

```typescript
// invoice.service.ts:39-57
const formattedItems = await Promise.all(
  items.map(async (inv: any) => {
    const itemCount = await InvoiceModel.getItemCount(inv.id); // ← 每行一个查询
    // ...
  })
);
```

**建议**：用子查询或 `LEFT JOIN + COUNT` 一次性获取：

```sql
SELECT invoices.*, COUNT(invoice_items.id) as item_count
FROM invoices LEFT JOIN invoice_items ON invoices.id = invoice_items.invoice_id
GROUP BY invoices.id
```

#### E. 对话上下文存内存

**问题**：`ai-chat.service.ts` 用 `Map` 存对话历史，服务重启即丢失，多实例不共享。

```typescript
const conversations = new Map<string, { messages: any[]; createdAt: number }>();
```

**建议**：
- **短期**：当前单实例部署可接受，但应在代码中标注 TODO
- **中期**：迁移到数据库表 `ai_conversations` + `ai_messages`，支持对话回溯
- **长期**：如扩展多实例，使用 Redis 缓存

---

## 3. 安全性审查

### 3.1 🔴 高风险

#### A. JWT Secret 硬编码默认值

```typescript
// config/env.ts:20
jwt: {
  secret: process.env.JWT_SECRET || '<hardcoded-default-jwt-secret>',
},
```

**风险**：如果 `.env` 未配置 `JWT_SECRET`，生产环境将使用可预测的默认密钥。  
**建议**：生产环境启动时检测并强制要求 `JWT_SECRET` 已配置，否则拒绝启动。

```typescript
if (env.nodeEnv === 'production' && !process.env.JWT_SECRET) {
  throw new Error('生产环境必须配置 JWT_SECRET');
}
```

#### B. AI 加密密钥硬编码默认值

```typescript
// config/env.ts:24
aiEncryptionKey: process.env.AI_ENCRYPTION_KEY || '<hardcoded-default-ai-encryption-key>',
```

**风险**：AES-256 密钥可预测，API Key 等敏感数据可被解密。  
**建议**：同上，生产环境强制要求配置。

#### C. 发票文件路径遍历风险

```typescript
// invoice.routes.ts:147
const filePath = path.resolve(__dirname, '../../', invoice.filePath);
```

**风险**：`invoice.filePath` 来自数据库，如果被注入恶意路径（如 `../../etc/passwd`），可能读取任意文件。  
**建议**：验证 `filePath` 在 `uploads/` 目录内：

```typescript
const basePath = path.resolve(__dirname, '../../uploads');
const resolved = path.resolve(basePath, invoice.filePath);
if (!resolved.startsWith(basePath)) {
  sendError(res, 403, 'FORBIDDEN', '非法文件路径');
  return;
}
```

### 3.2 🟡 中风险

#### D. SQL 注入 — sortBy 参数未校验

```typescript
// Invoice.ts:68
const sortBy = filters?.sortBy || 'created_at';
// 直接拼接到 orderBy
.orderBy(`invoices.${sortBy}`, sortOrder)
```

**建议**：白名单校验 `sortBy`：

```typescript
const ALLOWED_SORT_FIELDS = ['created_at', 'invoice_date', 'grand_total', 'status'];
const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'created_at';
```

#### E. 上传文件 MIME 类型校验可绕过

**问题**：允许 `application/octet-stream` 在扩展名合法时通过，攻击者可上传恶意文件。  
**建议**：增加 magic bytes 检测（使用 `file-type` 库）验证真实文件类型。

#### F. Rate Limit 基于 IP，共享主机可能失效

**问题**：Namecheap 共享主机可能在反向代理后面，所有请求共享同一 IP。  
**建议**：配置 `trust proxy`，并基于 `X-Forwarded-For` 限速：

```typescript
app.set('trust proxy', 1);
```

### 3.3 🟢 低风险但建议改进

- **JWT 过期时间**：当前默认 86400 秒（24 小时），建议缩短到 8 小时 + Refresh Token 机制
- **密码复杂度**：当前无密码强度校验，建议至少 8 位 + 数字 + 字母
- **CORS 配置**：仅单一来源，生产环境需更新为实际域名
- **Helmet 中间件**：建议添加 `helmet` 设置安全响应头

---

## 4. 性能优化建议

### 4.1 后端查询优化

| 问题 | 位置 | 影响 | 建议 |
|------|------|------|------|
| N+1 查询 | `invoiceService.getAll()` | 列表页 20 条发票 = 21 次查询 | JOIN + 子查询合并 |
| 补货建议串行查询 | `analyticsService.getReorderSuggestions()` | 每个低库存产品 1 次查询 | 批量查询周消耗 |
| 产品匹配串行查询 | `ocrService.matchProducts()` | 每个 OCR 识别项 1 次搜索 | 批量 FULLTEXT 查询 |
| 重复查询过滤条件 | `InvoiceModel.findAll()` | 主查询和 COUNT 查询各写一遍 filter | 抽取 buildFilter 函数 |
| 价格变化 raw SQL | `analyticsService.getPriceChanges()` | 两次子查询扫全表 | 添加物化视图或缓存 |

### 4.2 缓存策略

当前系统无任何缓存层。建议引入：

- **仪表盘数据**：`getDashboard()` 结果缓存 5 分钟（高频访问 + 聚合查询成本高）
- **分类列表**：`categories` 变动极少，缓存 1 小时
- **AI Provider 配置**：`getProvider()` 每次 LLM 调用都查数据库，缓存 10 分钟
- **实现方式**：内存缓存（`node-cache` 或简单 Map + TTL），单实例足够

```typescript
// 示例：简单 TTL 缓存
const cache = new Map<string, { data: any; expiresAt: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return fn().then(data => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}
```

### 4.3 OCR 性能

- **当前**：PNG 上传识别约 45.9 秒，大部分耗时在 LLM Vision API
- **建议**：
  1. 多页 PDF 仅提取前 N 页（发票通常 1-3 页）
  2. 图片预压缩已有（sharp），但可进一步降低 DPI（当前 2200px 仍偏大，可降至 1600px）
  3. 考虑**异步处理**：上传后立即返回，通过 WebSocket/轮询通知完成

### 4.4 前端性能

- **Bundle Size**：Recharts 体积较大（~400KB），仅 Analytics 页使用，确认已按页懒加载 ✅
- **InvoiceListPage (33KB)**：单文件过大，影响首次加载和 HMR 速度
- **图片懒加载**：Logo 等静态资源建议用 WebP 格式 + `loading="lazy"`

---

## 5. 前端优化建议

### 5.1 状态管理优化

#### A. 页面内状态过度使用 useState

**问题**：`InvoiceScanPage.tsx` 有 **14 个 useState**，`InvoiceListPage.tsx` 状态更多。复杂表单状态管理混乱。

**建议**：
- 复杂表单使用 `useReducer` 或 `react-hook-form`
- 考虑引入 `react-hook-form + zod` 做表单验证，减少手动状态管理

#### B. 缺少全局 loading/error 状态

**问题**：每个页面自行管理 `loading`、`error` 状态，代码重复。

**建议**：创建通用 hook：

```typescript
function useApi<T>(fetcher: () => Promise<T>, deps: any[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ...
}
```

### 5.2 UX 改进

| 项目 | 当前状况 | 建议 |
|------|----------|------|
| 全局 Toast 通知 | 部分页面 alert/内联提示 | 统一 Toast 组件（如 react-hot-toast） |
| 表格排序 | 部分支持 | 全部表格支持列头点击排序 |
| 键盘导航 | 仅 Modal ESC | 表格行支持方向键导航 |
| 空状态 | 无统一空状态 UI | 统一空状态插图 + 引导操作 |
| 加载骨架屏 | "页面加载中..." 文本 | Skeleton UI 骨架屏 |
| 暗色模式 | 未支持 | 可选——TailwindCSS darkMode 配置 |
| 移动端体验 | 底部导航已有 | 表格横向滚动 + 卡片视图切换 |

### 5.3 可访问性 (a11y)

- Modal 缺少 `aria-labelledby` / `aria-describedby`
- 表格缺少 `<caption>` 和 `scope` 属性
- 颜色对比度需检查（红白主题的浅色文字）
- 建议安装 `eslint-plugin-jsx-a11y` 自动检测

---

## 6. 后端优化建议

### 6.1 代码结构

| 优化项 | 说明 | 优先级 |
|--------|------|--------|
| asyncHandler 封装 | 消除路由层重复 try/catch | 高 |
| 参数校验统一化 | 核心路由（invoice/product）增加 validator 中间件 | 高 |
| Service 返回类型 | 所有 Service 方法定义返回 interface | 中 |
| 日志结构化 | 当前日志为字符串拼接，改为 JSON 结构化日志 | 中 |
| 配置校验 | 启动时校验必填环境变量 | 高 |

### 6.2 OCR 服务拆分

`ocr.service.ts` 高达 **777 行**，建议拆分：

```
services/
├── ocr/
│   ├── ocr.service.ts        — 主入口 + processFile
│   ├── ocr.parser.ts         — parseAiResponse + JSON 解析
│   ├── ocr.text-enricher.ts  — enrichRecognizedFromText + 规则补全
│   ├── ocr.product-matcher.ts — matchProducts + findBestMatch
│   └── ocr.prompts.ts        — INVOICE_OCR_PROMPT / TEXT_PARSE_PROMPT
```

### 6.3 发票确认事务化

**问题**：`invoiceService.confirm()` 包含多步操作（创建明细 → 更新库存 → 写日志 → 检测价格），但**未使用数据库事务**。如果中途失败，数据会处于不一致状态。

```typescript
// 当前：非事务
for (const item of body.items) {
  await InvoiceItemModel.create({ ... });       // 步骤1
  await InventoryModel.adjustQuantity(...);     // 步骤2 — 如果这里失败？
  await InventoryLogModel.create({ ... });      // 步骤3
}
await InvoiceModel.update(id, { status: 'confirmed' }); // 步骤4
```

**建议**：包裹在 `db.transaction()` 中（与 `rollbackConfirm` 保持一致）。

### 6.4 邮件通知

**问题**：`nodemailer` 已在依赖中但未见实际使用。`notification.service.ts` 仅写数据库。  
**建议**：实现邮件发送逻辑，至少支持库存预警邮件和发票确认通知邮件。

---

## 7. 数据库优化建议

### 7.1 缺失索引

| 表 | 建议新增索引 | 理由 |
|----|-------------|------|
| `invoice_items` | `(invoice_id, product_id)` 复合索引 | 确认入库时按 invoice_id 删除再插入 |
| `invoice_items` | `(product_id, invoice_id)` 复合索引 | 价格历史查询频繁 |
| `invoices` | `(status, created_at)` 复合索引 | 列表页按状态筛选 + 排序 |
| `inventory_logs` | `(product_id, type, created_at)` 复合索引 | 周消耗量计算查询 |

### 7.2 数据归档

**问题**：`audit_logs` 和 `inventory_logs` 会持续增长，无自动清理机制。

**建议**：
- 添加定期归档脚本（cron job / npm script）
- `audit_logs` 保留 12 个月
- `notifications` 已读超 3 个月自动清理
- `inventory_logs` 保留 12 个月

```typescript
// 示例归档脚本
async function archiveOldData() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  await db('audit_logs').where('created_at', '<', cutoff).delete();
  await db('inventory_logs').where('created_at', '<', cutoff).delete();
  // notifications: 已读 + 3个月前
  const notifCutoff = new Date();
  notifCutoff.setMonth(notifCutoff.getMonth() - 3);
  await db('notifications').where('is_read', 1).where('created_at', '<', notifCutoff).delete();
}
```

### 7.3 字段优化

- `invoices.ocr_raw_result` 为 JSON 类型，较大（几KB~几十KB），列表查询时不需要，但 `findAll` 用了 `SELECT *`  
  → **建议**：列表查询排除 `ocr_raw_result`，仅详情查询返回
- `products` 缺少 `barcode` 字段的索引 → 补充索引以支持条码扫描场景

---

## 8. 测试覆盖优化

### 8.1 当前覆盖率

| 层 | 测试类型 | 覆盖 | 评价 |
|----|---------|------|------|
| 前端 | 单元测试 | 4 个文件 / 7 个用例 | 🔴 严重不足 |
| 后端 | E2E 脚本 | 1 个文件（全流程冒烟） | 🟡 覆盖核心流程但不够细 |
| API | 接口测试 | 手动联调 | 🔴 无自动化 |
| 集成 | 浏览器测试 | 无 | 🔴 无 |

### 8.2 建议测试计划

#### 高优先级
1. **后端 Service 单元测试**：`invoice.service.ts`、`inventory.service.ts`、`ocr.service.ts` 的核心方法
2. **API 路由测试**：使用 `supertest` 测试关键路由（auth、invoice、inventory）
3. **前端页面 Smoke 测试**：每个页面至少能渲染不报错

#### 中优先级
4. **OCR 解析测试**：用固定 JSON/文本输入测试 `parseAiResponse`、`enrichRecognizedFromText`
5. **前端表单测试**：发票编辑、产品创建等核心表单交互
6. **E2E 浏览器测试**：Playwright 覆盖登录 → 上传发票 → 确认入库 → 查看库存

#### 低优先级
7. **快照测试**：UI 组件回归检测
8. **负载测试**：模拟 100 并发请求验证限速和数据库连接池

---

## 9. 新功能建议与设计

### 9.1 📊 多发票批量上传与队列处理

**背景**：当前每次只能上传 1 个文件，周发票量 30-100 张，逐个上传效率低。

**设计方案**：
- 前端支持拖拽多文件上传（最多 10 个）
- 后端引入**任务队列**（简单版可用内存队列 + 串行处理）
- 新增 `upload_tasks` 表记录任务状态
- 前端轮询或 WebSocket 展示每个文件的处理进度
- 完成后统一跳转到"待审核"列表

```
upload_tasks:
  id, user_id, file_path, file_name, status(queued/processing/done/failed),
  invoice_id(nullable), error_message, created_at, completed_at
```

### 9.2 📱 条码扫描快速入库

**背景**：实际到货验收时，扫条码比手动查找高效。

**设计方案**：
- 前端新增"快速入库"页面，调用手机摄像头扫码（`html5-qrcode` 库）
- 扫码后自动查询 `products.barcode` 匹配产品
- 显示产品信息 + 输入数量即可快速入库
- 支持连续扫描模式（扫完一个自动准备下一个）
- 移动端优先设计

### 9.3 📈 价格趋势图表 + 历史对比

**背景**：当前价格波动仅显示"最近两次"对比，无法看长期趋势。

**设计方案**：
- 产品详情页新增"价格历史"Tab
- 折线图展示最近 12 个月价格走势（X 轴=采购日期，Y 轴=单价）
- 支持与同品类平均价对比
- 标注异常波动点（超出 ±10%）
- API：`GET /api/v1/products/:id/price-history?months=12`

### 9.4 🔔 WebSocket 实时通知

**背景**：当前通知仅存数据库，用户需手动刷新。

**设计方案**：
- 引入 `socket.io`（Express 集成简单）
- 认证后建立 WebSocket 连接
- 事件推送：库存预警、价格异常、发票待审核、OCR 完成
- 前端 Header 通知铃铛实时显示未读数
- 支持浏览器桌面通知（Notification API）

### 9.5 📋 采购订单生成

**背景**：AI 订货建议生成后，无法直接转化为可执行的采购订单。

**设计方案**：

```
purchase_orders:
  id, supplier_id, order_number, status(draft/sent/received/cancelled),
  notes, total_amount, created_by, created_at, updated_at

purchase_order_items:
  id, order_id, product_id, quantity, unit, unit_price, line_total
```

- 从"补货建议"一键生成采购订单草稿
- 支持按供应商分组
- 订单可导出 PDF 发送给供应商
- 收货后关联到发票，闭环管理

### 9.6 🏷️ 产品标签与智能分组

**背景**：产品仅有单一分类，无法灵活标记（如"促销品"、"季节性"、"即将停售"）。

**设计方案**：
- 新增 `product_tags` 多对多表
- 前端产品页支持打标签
- 按标签筛选产品列表
- AI 分析时可按标签维度聚合

### 9.7 📊 供应商评分与对比

**背景**：当前供应商管理仅有基础信息，无法评估供应商质量。

**设计方案**：
- 自动计算供应商评分维度：
  - 价格稳定性（价格波动率）
  - 供货频率（月均发票数）
  - 品类覆盖度
  - 历史交易额
- 供应商详情页展示雷达图
- 同品类不同供应商价格对比
- API：`GET /api/v1/suppliers/:id/scorecard`

### 9.8 🌐 多语言支持 (i18n)

**背景**：当前 UI 中英文混用，面向亚洲超市可能需要中英文切换。

**设计方案**：
- 引入 `react-i18next`
- 默认中文，支持英文切换
- 翻译文件按模块组织：`locales/zh/invoice.json`、`locales/en/invoice.json`
- 后端错误消息也支持语言参数

### 9.9 📱 PWA 离线支持

**背景**：超市网络可能不稳定，关键操作（查库存、记录出库）需离线可用。

**设计方案**：
- Vite PWA 插件 (`vite-plugin-pwa`)
- Service Worker 缓存静态资源
- 库存查询支持离线读取（IndexedDB 缓存最近数据）
- 离线操作记录队列，上线后自动同步

---

## 10. 优先级排序与实施路线图

### Phase 1：安全加固与关键 Bug 修复（1-2 天）

| # | 任务 | 优先级 |
|---|------|--------|
| 1 | 生产环境强制 JWT_SECRET / AI_ENCRYPTION_KEY | 🔴 P0 |
| 2 | sortBy 白名单校验（防 SQL 注入） | 🔴 P0 |
| 3 | 文件路径遍历防护 | 🔴 P0 |
| 4 | 发票确认包裹数据库事务 | 🔴 P0 |
| 5 | `trust proxy` 配置 + helmet 中间件 | 🟡 P1 |

### Phase 2：性能优化（2-3 天）

| # | 任务 | 优先级 |
|---|------|--------|
| 6 | 修复 N+1 查询（发票列表、补货建议） | 🔴 P0 |
| 7 | 列表查询排除 `ocr_raw_result` 大字段 | 🟡 P1 |
| 8 | 仪表盘数据缓存 | 🟡 P1 |
| 9 | AI Provider 配置缓存 | 🟡 P1 |
| 10 | 补充缺失数据库索引 | 🟢 P2 |

### Phase 3：代码质量（3-5 天）

| # | 任务 | 优先级 |
|---|------|--------|
| 11 | asyncHandler 封装路由 | 🟡 P1 |
| 12 | OCR 服务拆分 | 🟡 P1 |
| 13 | InvoiceListPage 拆分 | 🟡 P1 |
| 14 | TypeScript 类型补全（核心 Model/Service） | 🟡 P1 |
| 15 | 全局 Toast 通知组件 | 🟢 P2 |

### Phase 4：测试补全（3-5 天）

| # | 任务 | 优先级 |
|---|------|--------|
| 16 | 后端 Service 单元测试 | 🟡 P1 |
| 17 | API 路由 supertest 测试 | 🟡 P1 |
| 18 | OCR 解析单元测试 | 🟢 P2 |
| 19 | 前端页面 Smoke 测试 | 🟢 P2 |

### Phase 5：新功能迭代（按业务价值排序）

| # | 功能 | 业务价值 | 工作量 |
|---|------|----------|--------|
| 20 | 多发票批量上传 + 队列 | ⭐⭐⭐⭐⭐ | 3-5 天 |
| 21 | 条码扫描快速入库 | ⭐⭐⭐⭐⭐ | 2-3 天 |
| 22 | 价格趋势图表 | ⭐⭐⭐⭐ | 1-2 天 |
| 23 | WebSocket 实时通知 | ⭐⭐⭐⭐ | 2-3 天 |
| 24 | 采购订单生成 | ⭐⭐⭐⭐ | 3-5 天 |
| 25 | 供应商评分 | ⭐⭐⭐ | 2-3 天 |
| 26 | 产品标签系统 | ⭐⭐⭐ | 1-2 天 |
| 27 | 多语言支持 | ⭐⭐ | 3-5 天 |
| 28 | PWA 离线支持 | ⭐⭐ | 3-5 天 |
| 29 | 数据归档脚本 | ⭐⭐⭐ | 1 天 |

---

## 附录：快速参考

### 关键文件清单（需优先关注）

| 文件 | 行数 | 关注点 |
|------|------|--------|
| `server/src/services/ocr.service.ts` | 777 | 需拆分、类型补全 |
| `server/src/services/invoice.service.ts` | 479 | confirm 需事务化 |
| `server/src/services/analytics.service.ts` | 408 | N+1 查询、raw SQL |
| `client/src/pages/InvoiceListPage.tsx` | 827 | 需拆分组件 |
| `client/src/pages/InvoiceScanPage.tsx` | 528 | 状态过多，需 useReducer |
| `server/src/config/env.ts` | 43 | 安全默认值问题 |
| `server/src/models/Invoice.ts` | 109 | SELECT * + sortBy 注入 |

---

*报告完毕。建议从 Phase 1（安全加固）开始，再按 Phase 2-5 逐步推进。*
