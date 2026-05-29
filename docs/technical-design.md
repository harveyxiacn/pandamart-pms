# 熊猫超市智能库存管理系统 — 系统架构与技术设计文档

> 版本：v1.0  
> 日期：2026-03-04  
> 作者：Cascade AI  
> 状态：草稿

---

## 1. 技术栈选型

### 1.1 总览

| 层级 | 技术选型 | 理由 |
|------|----------|------|
| **前端框架** | React 18 + TypeScript | 生态成熟、组件化开发、类型安全 |
| **前端UI** | TailwindCSS + shadcn/ui | 现代化设计、响应式、高度可定制 |
| **前端构建** | Vite | 极快的开发体验和构建速度 |
| **前端图标** | Lucide React | 轻量、风格统一 |
| **前端图表** | Recharts | 基于React的声明式图表库 |
| **后端框架** | Node.js + Express.js + TypeScript | 与前端统一语言、Namecheap原生支持 |
| **数据库** | MariaDB 10.x | Namecheap共享主机原生支持 |
| **ORM** | Knex.js | 轻量SQL构建器，支持迁移和种子数据 |
| **认证** | JWT (jsonwebtoken) | 无状态认证，适合前后端分离架构 |
| **文件存储** | 服务器本地文件系统 | 发票原件存储在主机上 |
| **PDF解析** | pdf-parse | Node.js原生PDF文本提取 |
| **Excel解析** | xlsx (SheetJS) | 功能全面的Excel解析库 |
| **LLM 调用** | OpenAI SDK (openai npm) | 统一通过 OpenAI 兼容接口调用多种 AI 提供商 |
| **AI 提供商** | 自定义 OpenAI 兼容 / 千问 Qwen / OpenAI 官方 | 可配置 Base URL、API Key、模型名、Thinking Effort |
| **邮件通知** | Nodemailer | Node.js标准邮件发送库 |

### 1.2 技术栈选型理由

**为什么选 Node.js 而非 PHP/Python？**
- Namecheap 共享主机支持 Node.js 6-22，无需额外配置
- 前后端统一 TypeScript，减少上下文切换和类型不一致问题
- npm 生态丰富，PDF/Excel 解析库质量高
- Express.js 轻量灵活，适合中小型项目
- JSON 处理天然优势，适合 API 开发

**为什么用混合 OCR 方案？**
- PDF 文本型发票：直接提取文本（免费、快速、准确率 >98%）
- 图片/扫描型发票：调用 LLM Vision API（精度高、中英文混合识别好）
- Excel 发票：直接解析表格（免费、100%准确）
- 这样最大化利用免费方案，仅在必要时调用付费 API

**为什么用 OpenAI 兼容接口作为统一抽象层？**
- 千问 Qwen、本地部署模型、第三方中转等均提供 OpenAI 兼容端点
- 统一使用 `openai` npm 包，只需切换 `baseURL` 即可对接不同提供商
- 无需为每个提供商写独立适配代码，维护成本极低
- 用户可通过 Web UI 自由添加/切换 AI 提供商，无需修改代码

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端 (Browser)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              React SPA (Vite + TypeScript)            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │  │ 发票识别  │ │ 库存管理  │ │ 数据分析  │ │ 设置   │  │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │   │
│  │  ┌──────────────────────────────────────────────────┐│   │
│  │  │         TailwindCSS + shadcn/ui 组件库           ││   │
│  │  └──────────────────────────────────────────────────┘│   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (REST API + JSON)
┌────────────────────────────┼────────────────────────────────┐
│                    Namecheap 共享主机                        │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │              Node.js + Express.js 后端                  │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │ 认证中间件│ │ 文件处理  │ │ 业务逻辑  │ │ AI调用   │  │ │
│  │  │ (JWT)    │ │ (Multer) │ │ (Service)│ │(OpenAI)  │  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │          Knex.js (Query Builder + Migrations)    │  │ │
│  │  └──────────────────────┬───────────────────────────┘  │ │
│  └─────────────────────────┼──────────────────────────────┘ │
│  ┌─────────────────────────▼──────────────────────────────┐ │
│  │                    MariaDB 10.x                         │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              文件存储 (发票原件/产品图片)                  │ │
│  └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                             │
                             ▼ HTTPS
┌────────────────────────────────────────────────────────────┐
│                    OpenAI API (GPT-4o Vision)               │
│                    用于图片/扫描件 OCR 识别                   │
└────────────────────────────────────────────────────────────┘
```

### 2.2 前端架构

```
src/
├── main.tsx                    # 应用入口
├── App.tsx                     # 根组件，路由配置
├── api/                        # API 调用层
│   ├── client.ts               # Axios 实例配置
│   ├── auth.ts                 # 认证相关 API
│   ├── invoices.ts             # 发票相关 API
│   ├── inventory.ts            # 库存相关 API
│   ├── products.ts             # 产品相关 API
│   ├── suppliers.ts            # 供应商相关 API
│   └── analytics.ts            # 分析相关 API
├── components/                 # 通用组件
│   ├── ui/                     # shadcn/ui 基础组件
│   ├── layout/                 # 布局组件
│   │   ├── Sidebar.tsx         # 侧边栏导航
│   │   ├── Header.tsx          # 顶部栏
│   │   ├── MobileNav.tsx       # 移动端底部导航
│   │   └── MainLayout.tsx      # 主布局容器
│   ├── FileUploader.tsx        # 文件上传组件
│   ├── DataTable.tsx           # 数据表格组件
│   └── ConfirmDialog.tsx       # 确认对话框
├── pages/                      # 页面组件
│   ├── LoginPage.tsx           # 登录页
│   ├── DashboardPage.tsx       # 仪表盘
│   ├── InvoiceScanPage.tsx     # 发票识别页
│   ├── InvoiceListPage.tsx     # 发票列表页
│   ├── InventoryPage.tsx       # 库存管理页
│   ├── ProductsPage.tsx        # 产品管理页
│   ├── SuppliersPage.tsx       # 供应商管理页
│   ├── AnalyticsPage.tsx       # 数据分析页
│   ├── StocktakePage.tsx       # 盘点页
│   ├── SettingsPage.tsx        # 系统设置页
│   └── UsersPage.tsx           # 用户管理页 (Admin)
├── hooks/                      # 自定义 Hooks
│   ├── useAuth.ts              # 认证状态管理
│   ├── usePermission.ts        # 权限检查
│   └── useNotification.ts      # 通知管理
├── store/                      # 状态管理 (Zustand)
│   ├── authStore.ts            # 认证状态
│   └── notificationStore.ts    # 通知状态
├── types/                      # TypeScript 类型定义
│   ├── invoice.ts
│   ├── product.ts
│   ├── inventory.ts
│   ├── supplier.ts
│   └── user.ts
├── utils/                      # 工具函数
│   ├── formatters.ts           # 格式化工具
│   ├── validators.ts           # 验证工具
│   └── constants.ts            # 常量定义
└── styles/
    └── globals.css             # 全局样式 + Tailwind
```

### 2.3 后端架构

```
server/
├── index.ts                    # 应用入口
├── app.ts                      # Express 应用配置
├── config/
│   ├── database.ts             # 数据库连接配置
│   ├── env.ts                  # 环境变量配置
│   └── cors.ts                 # CORS 配置
├── middleware/
│   ├── auth.ts                 # JWT 认证中间件
│   ├── permission.ts           # 权限检查中间件
│   ├── upload.ts               # 文件上传中间件 (Multer)
│   ├── rateLimit.ts            # API 限流
│   ├── errorHandler.ts         # 全局错误处理
│   └── validator.ts            # 请求验证中间件
├── routes/
│   ├── auth.routes.ts          # 认证路由
│   ├── invoice.routes.ts       # 发票路由
│   ├── product.routes.ts       # 产品路由
│   ├── inventory.routes.ts     # 库存路由
│   ├── supplier.routes.ts      # 供应商路由
│   ├── analytics.routes.ts     # 分析路由
│   ├── user.routes.ts          # 用户管理路由
│   └── settings.routes.ts      # 设置路由
├── services/
│   ├── auth.service.ts         # 认证业务逻辑
│   ├── llm.service.ts          # LLM 统一调用服务（多提供商抽象层）
│   ├── invoice.service.ts      # 发票业务逻辑
│   ├── ocr.service.ts          # OCR/AI 识别服务（调用 llm.service）
│   ├── pdf.service.ts          # PDF 解析服务
│   ├── excel.service.ts        # Excel 解析服务
│   ├── product.service.ts      # 产品业务逻辑
│   ├── inventory.service.ts    # 库存业务逻辑
│   ├── supplier.service.ts     # 供应商业务逻辑
│   ├── analytics.service.ts    # 数据分析服务
│   ├── ai-chat.service.ts      # AI 对话服务（智能问答）
│   ├── ai-insight.service.ts   # AI 洞察服务（异常检测/经营分析）
│   ├── notification.service.ts # 通知服务
│   └── template.service.ts     # 供应商模板记忆服务
├── models/                     # 数据模型 (Knex 查询封装)
│   ├── User.ts
│   ├── Invoice.ts
│   ├── InvoiceItem.ts
│   ├── Product.ts
│   ├── Inventory.ts
│   ├── Supplier.ts
│   ├── AiProvider.ts
│   ├── AuditLog.ts
│   └── Setting.ts
├── database/
│   ├── migrations/             # 数据库迁移文件
│   └── seeds/                  # 种子数据
├── types/
│   └── index.ts                # 共享类型定义
├── utils/
│   ├── logger.ts               # 日志工具
│   ├── crypto.ts               # 加密工具
│   └── helpers.ts              # 通用辅助函数
└── uploads/                    # 上传文件存储目录
    ├── invoices/               # 发票原件
    └── products/               # 产品图片
```

---

## 3. 核心模块详细设计

### 3.1 发票识别流程

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐
│ 用户上传   │────▶│ 文件类型检测  │────▶│ 路由到处理器   │
│ 文件      │     │             │     │              │
└──────────┘     └─────────────┘     └──────┬───────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
              ┌─────▼─────┐         ┌──────▼──────┐       ┌──────▼──────┐
              │  PDF 处理   │         │  图片处理    │       │ Excel 处理   │
              │            │         │             │       │             │
              └─────┬─────┘         └──────┬──────┘       └──────┬──────┘
                    │                      │                      │
              ┌─────▼─────┐         ┌──────▼──────┐       ┌──────▼──────┐
              │ 文本提取    │         │ GPT-4o      │       │ SheetJS     │
              │ (pdf-parse)│         │ Vision API  │       │ 直接解析     │
              └─────┬─────┘         └──────┬──────┘       └──────┬──────┘
                    │                      │                      │
              ┌─────▼─────┐               │                      │
              │ 有文本？    │               │                      │
              │ Yes / No  │               │                      │
              └──┬────┬───┘               │                      │
             Yes │    │ No                │                      │
                 │    └──────▶ GPT-4o ────┘                      │
                 │                 │                              │
              ┌──▼─────────┐      │                              │
              │ 模板匹配     │      │                              │
              │ (正则+规则) │      │                              │
              └──┬─────────┘      │                              │
                 │                │                              │
                 ▼                ▼                              ▼
              ┌────────────────────────────────────────────────────┐
              │              结构化 JSON 结果                       │
              │  { supplier, invoice_no, date, items[], totals }  │
              └──────────────────────────┬─────────────────────────┘
                                         │
                                   ┌─────▼─────┐
                                   │ 智能匹配    │
                                   │ 已有产品库  │
                                   └─────┬─────┘
                                         │
                                   ┌─────▼─────┐
                                   │ 返回前端    │
                                   │ 用户校对    │
                                   └───────────┘
```

### 3.2 LLM 统一调用服务 (llm.service.ts)

#### 3.2.0 多提供商抽象层设计

所有 AI 提供商统一通过 `openai` npm 包调用，通过切换 `baseURL` 实现多提供商支持。

```typescript
import OpenAI from 'openai';

// AI 提供商配置接口
interface AiProviderConfig {
  id: number;
  name: string;           // "本地 GPT" / "千问" / "OpenAI"
  baseUrl: string;        // "http://127.0.0.1:8317" / "https://dashscope.aliyuncs.com/compatible-mode/v1"
  apiKey: string;         // "sk-xxxxx"
  model: string;          // "gpt-5.2" / "qwen-vl-max" / "gpt-4o"
  thinkingEffort?: string; // "xhigh" / "high" / "medium" / "low"
  supportsVision: boolean;
  purpose: 'ocr' | 'analysis' | 'chat' | 'all';
  isActive: boolean;
}

// 统一的 LLM 调用服务
class LlmService {
  // 根据用途获取对应的 AI 提供商配置
  async getProvider(purpose: string): Promise<AiProviderConfig> {
    // 从数据库读取已配置的提供商，按 purpose 筛选
    // purpose='all' 的提供商可用于任何用途
  }

  // 创建 OpenAI 客户端实例
  createClient(provider: AiProviderConfig): OpenAI {
    return new OpenAI({
      baseURL: provider.baseUrl,
      apiKey: provider.apiKey,
    });
  }

  // 文本完成调用（智能分析/对话/匹配）
  async chatCompletion(purpose: string, messages: any[], options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: any;
  }): Promise<string> {
    const provider = await this.getProvider(purpose);
    const client = this.createClient(provider);
    
    const requestBody: any = {
      model: provider.model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
    };
    
    // 支持 thinking effort 参数（部分模型如 o1/o3 系列）
    if (provider.thinkingEffort) {
      requestBody.thinking = { effort: provider.thinkingEffort };
    }
    
    if (options?.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }
    
    const response = await client.chat.completions.create(requestBody);
    return response.choices[0].message.content || '';
  }

  // 视觉识别调用（发票 OCR）
  async visionCompletion(imageBase64: string, prompt: string): Promise<string> {
    const provider = await this.getProvider('ocr');
    if (!provider.supportsVision) {
      throw new Error('当前 AI 提供商不支持图片识别');
    }
    const client = this.createClient(provider);
    
    const response = await client.chat.completions.create({
      model: provider.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
        ],
      }],
      max_tokens: 4096,
      temperature: 0.1,
    });
    return response.choices[0].message.content || '';
  }

  // 连通性测试
  async testConnection(provider: AiProviderConfig): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    try {
      const client = this.createClient(provider);
      await client.chat.completions.create({
        model: provider.model,
        messages: [{ role: 'user', content: '请回复 "ok"' }],
        max_tokens: 10,
      });
      return { success: true, message: '连接成功', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, message: err.message, latencyMs: Date.now() - start };
    }
  }
}
```

#### 3.2.1 PDF 文本提取策略

```typescript
// ocr.service.ts —— 调用 llm.service 而非直接调用 OpenAI
async function processPdf(filePath: string): Promise<InvoiceData> {
  const pdfData = await pdfParse(fileBuffer);
  
  if (pdfData.text.trim().length > 50) {
    // 文本型 PDF → 模板匹配
    return parseTextInvoice(pdfData.text);
  } else {
    // 扫描型 PDF → 转图片 → LLM Vision 识别
    const imageBuffer = await convertPdfToImage(filePath);
    const base64 = imageBuffer.toString('base64');
    const result = await llmService.visionCompletion(base64, INVOICE_OCR_PROMPT);
    return JSON.parse(result);
  }
}
```

#### 3.2.2 AI Vision 提示词设计

```
你是一个专业的发票数据提取助手。请分析这张发票图片，提取以下信息并以JSON格式返回：

{
  "supplier_name": "供应商名称",
  "supplier_code": "供应商编号（如有）",
  "invoice_number": "发票编号",
  "invoice_date": "YYYY-MM-DD格式日期",
  "customer_code": "客户编号（如有）",
  "items": [
    {
      "product_name_en": "英文名",
      "product_name_zh": "中文名",
      "quantity": 数量,
      "unit": "单位",
      "unit_price": 单价,
      "line_total": 行小计
    }
  ],
  "subtotal": 税前小计,
  "has_tax": true/false,
  "tax_amount": 税额,
  "grand_total": 含税总价
}

注意事项：
1. 产品名称可能是中英文混合，请分开提取
2. 数量和金额请转为数字类型
3. 如果某个字段无法识别，设为null
4. 日期统一转为YYYY-MM-DD格式
```

#### 3.2.3 供应商模板记忆机制

系统为每个供应商维护一个发票模板配置，包含：
- **文本提取规则**：正则表达式模式（供应商名位置、发票号格式等）
- **表格结构**：列顺序、列宽、数据区域位置
- **字段映射**：供应商特有的字段名到系统标准字段的映射

当同一供应商的发票识别成功并被用户确认后，系统自动更新模板，下次同供应商发票可直接用模板解析，无需调用 AI。

### 3.3 认证与权限设计

#### 3.3.1 JWT Token 流程

```
┌────────┐                          ┌────────┐
│ Client │                          │ Server │
└───┬────┘                          └───┬────┘
    │  POST /api/auth/login             │
    │  { username, password }           │
    │──────────────────────────────────▶│
    │                                   │ 验证密码 (bcrypt)
    │                                   │ 生成 JWT Token
    │  { token, user, expiresIn }       │
    │◀──────────────────────────────────│
    │                                   │
    │  GET /api/inventory               │
    │  Authorization: Bearer <token>    │
    │──────────────────────────────────▶│
    │                                   │ 验证 JWT
    │                                   │ 检查权限
    │  { data: [...] }                  │
    │◀──────────────────────────────────│
```

#### 3.3.2 Token 结构

```json
{
  "sub": "user_id",
  "username": "admin",
  "role": "admin",
  "iat": 1709568000,
  "exp": 1709654400
}
```

#### 3.3.3 权限中间件

```typescript
// 伪代码示意
function requireRole(...roles: string[]) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

// 使用示例
router.get('/analytics', requireRole('admin'), analyticsController.getDashboard);
router.post('/invoices/upload', requireRole('admin', 'staff'), invoiceController.upload);
```

### 3.4 文件上传处理

#### 3.4.1 上传限制
| 参数 | 值 |
|------|-----|
| 最大文件大小 | 20MB |
| 允许的文件类型 | .pdf, .jpg, .jpeg, .png, .xlsx, .xls |
| 单次最大上传数 | 10个文件 |
| 存储路径 | /uploads/invoices/YYYY/MM/ |
| 文件命名 | {timestamp}_{originalName} |

#### 3.4.2 图片预处理
- 自动旋转修正（基于 EXIF 信息）
- 大图压缩（宽度超过 2000px 时等比缩放）
- 格式统一转换为 JPEG（节省 AI API 的 Token 消耗）

### 3.5 数据分析引擎

#### 3.5.1 分析维度

| 分析模块 | 数据来源 | 计算方式 |
|----------|----------|----------|
| 采购趋势 | invoice_items + invoices | 按日/周/月聚合入库金额 |
| 畅销排名 | invoice_items | 按采购频次/数量 DESC 排序 |
| 滞销预警 | products + invoice_items | 最后采购日期 > N 天前 |
| 价格波动 | invoice_items | 同产品按时间排列价格变化 |
| 供应商占比 | invoices | 按供应商聚合采购金额 |
| 分类分析 | invoice_items + products | 按产品分类聚合 |
| 安全库存 | inventory + invoice_items | 平均日消耗 × 安全天数 |

#### 3.5.2 缓存策略
- 仪表盘数据缓存 5 分钟（避免频繁大查询）
- 分析报表按需生成，结果缓存 1 小时
- 入库/出库操作后自动清除相关缓存

---

## 4. 安全设计

### 4.1 传输安全
- 全站 HTTPS（利用 Namecheap 提供的免费 SSL 证书）
- API 响应不暴露服务器信息 (X-Powered-By: 禁用)

### 4.2 数据安全
- 密码使用 bcrypt 加密（salt rounds = 12）
- JWT Secret 通过环境变量配置，不入代码库
- AI 提供商 API Key 在数据库中 AES-256 加密存储，解密密钥通过环境变量配置
- 数据库连接使用参数化查询（Knex.js 自动防 SQL 注入）
- API Key 在前端显示时脱敏（仅显示前4位和后4位）

### 4.3 应用安全
- CORS 白名单配置
- API 限流：普通接口 100次/分钟，上传接口 20次/分钟
- 文件上传类型白名单校验（双重校验：后缀名 + MIME类型）
- XSS 防护：输入过滤 + 输出转义
- CSRF：JWT 方案天然防 CSRF

### 4.4 审计日志
记录以下关键操作：
- 用户登录/登出
- 发票上传与确认入库
- 库存手动调整
- 产品/供应商的增删改
- 系统设置变更
- 用户管理操作

---

## 5. 响应式设计方案

### 5.1 断点定义
| 断点 | 宽度 | 设备 | 布局 |
|------|------|------|------|
| xs | < 640px | 手机竖屏 | 单列，底部Tab导航 |
| sm | 640-767px | 手机横屏 | 单列，底部Tab导航 |
| md | 768-1023px | 平板竖屏 | 可折叠侧边栏 |
| lg | 1024-1279px | 平板横屏 | 固定侧边栏 |
| xl | ≥ 1280px | 桌面 | 固定侧边栏 + 宽内容区 |

### 5.2 移动端适配要点
- 手机端使用底部 Tab 导航（5个主要入口）
- 表格在移动端转为卡片式列表
- 文件上传支持相机调用（`accept="image/*;capture=camera"`）
- 触控友好：最小触摸目标 44×44px
- 下拉刷新支持

---

## 6. 错误处理策略

### 6.1 全局错误分类

| 错误码 | 类型 | 处理方式 |
|--------|------|----------|
| 400 | 请求参数错误 | 返回具体字段的验证错误信息 |
| 401 | 未认证 | 重定向到登录页 |
| 403 | 权限不足 | 显示权限不足提示 |
| 404 | 资源不存在 | 显示 404 页面 |
| 413 | 文件过大 | 提示文件大小限制 |
| 422 | 业务逻辑错误 | 显示具体业务错误信息 |
| 429 | 请求过于频繁 | 提示稍后重试 |
| 500 | 服务器内部错误 | 记录日志，显示通用错误提示 |

### 6.2 OCR 错误容错
- AI API 调用超时（30秒）→ 提示用户重试或手动录入
- AI API 返回格式异常 → 尝试二次解析，失败则提示手动录入
- PDF 解析失败 → 降级为 AI 图片识别
- 网络错误 → 自动重试1次，仍失败则提示离线

---

## 7. 性能优化策略

### 7.1 前端优化
- 路由级代码分割（React.lazy + Suspense）
- 图片懒加载
- API 请求去重和缓存（React Query / SWR）
- 虚拟列表（长列表场景）

### 7.2 后端优化
- 数据库查询索引优化
- 分页查询（默认 20 条/页）
- 响应数据压缩（gzip）
- AI 调用异步处理 + 轮询查结果
- 文件上传流式处理

### 7.3 Namecheap 共享主机优化
- Node.js 进程管理（PM2 或 Passenger）
- 静态资源 CDN 或服务端缓存
- 数据库连接池（最大 5 连接，共享主机限制）
- 避免内存密集型操作（大文件分块处理）
