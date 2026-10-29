# 熊猫超市智能库存管理系统 — 数据库设计文档

> 版本：v1.0  
> 日期：2026-03-04  
> 作者：Cascade AI  
> 状态：草稿

---

## 1. 概述

### 1.1 数据库选型
- **数据库引擎**：MariaDB 10.x（Namecheap 共享主机原生支持）
- **字符集**：utf8mb4（支持中文及emoji）
- **排序规则**：utf8mb4_unicode_ci
- **ORM/查询构建器**：Knex.js（支持迁移和种子数据）

### 1.2 设计原则
- 所有表使用自增整数主键 `id`
- 所有表包含 `created_at` 和 `updated_at` 时间戳
- 外键命名规则：`{关联表名单数}_id`
- 索引命名规则：`idx_{表名}_{字段名}`
- 软删除使用 `deleted_at` 字段（仅关键业务表）
- 金额字段使用 `DECIMAL(12,2)` 类型
- 布尔字段使用 `TINYINT(1)`

---

## 2. ER 关系图

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐
│  users   │     │   suppliers   │     │  categories  │
│──────────│     │───────────────│     │──────────────│
│ id       │     │ id            │     │ id           │
│ username │     │ name          │     │ name         │
│ password │     │ contact_name  │     │ parent_id    │◀─┐
│ role     │     │ phone         │     │ sort_order   │  │
│ ...      │     │ email         │     └──────┬───────┘  │
└────┬─────┘     │ ...           │            │ (自引用)   │
     │           └──────┬────────┘            └───────────┘
     │                  │
     │                  │ 1:N
     │           ┌──────▼────────┐        ┌──────────────┐
     │           │   invoices    │        │   products   │
     │ 1:N       │───────────────│        │──────────────│
     │           │ id            │        │ id           │
     └──────────▶│ uploaded_by   │        │ name_en      │
                 │ supplier_id   │───┐    │ name_zh      │
                 │ invoice_number│   │    │ sku          │
                 │ invoice_date  │   │    │ category_id  │
                 │ grand_total   │   │    │ supplier_id  │
                 │ status        │   │    │ ...          │
                 │ ...           │   │    └──────┬───────┘
                 └──────┬────────┘   │           │
                        │            │           │
                        │ 1:N        │           │
                 ┌──────▼────────┐   │    ┌──────▼───────┐
                 │ invoice_items │   │    │  inventory   │
                 │───────────────│   │    │──────────────│
                 │ id            │   │    │ id           │
                 │ invoice_id    │   │    │ product_id   │
                 │ product_id    │───┼───▶│ quantity     │
                 │ quantity      │   │    │ unit         │
                 │ unit          │   │    │ safe_stock   │
                 │ unit_price    │   │    │ ...          │
                 │ line_total    │   │    └──────────────┘
                 │ ...           │   │
                 └───────────────┘   │    ┌──────────────────┐
                                     │    │ inventory_logs   │
                                     │    │──────────────────│
                                     │    │ id               │
                                     │    │ product_id       │
                                     │    │ type (in/out/adj)│
                                     │    │ quantity         │
                                     │    │ invoice_id       │
                                     │    │ reason           │
                                     │    │ operated_by      │
                                     │    │ ...              │
                                     │    └──────────────────┘
                                     │
                                     │    ┌──────────────────┐
                                     │    │ supplier_templates│
                                     └───▶│──────────────────│
                                          │ id               │
                                          │ supplier_id      │
                                          │ template_config  │
                                          │ ...              │
                                          └──────────────────┘

┌──────────────┐     ┌──────────────┐
│  audit_logs  │     │   settings   │
│──────────────│     │──────────────│
│ id           │     │ id           │
│ user_id      │     │ key          │
│ action       │     │ value        │
│ entity_type  │     │ ...          │
│ entity_id    │     └──────────────┘
│ details      │
│ ip_address   │
│ ...          │
└──────────────┘
```

---

## 3. 详细表结构

### 3.1 users — 用户表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt 加密密码 |
| display_name | VARCHAR(100) | NOT NULL | 显示名称 |
| email | VARCHAR(255) | NULLABLE | 邮箱（用于通知） |
| role | ENUM('admin','staff') | NOT NULL, DEFAULT 'staff' | 角色 |
| is_active | TINYINT(1) | NOT NULL, DEFAULT 1 | 是否启用 |
| last_login_at | DATETIME | NULLABLE | 最后登录时间 |
| login_attempts | INT | NOT NULL, DEFAULT 0 | 连续登录失败次数 |
| locked_until | DATETIME | NULLABLE | 锁定截止时间 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | DATETIME | NOT NULL, ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

**索引：**
- `idx_users_username` UNIQUE (username)
- `idx_users_role` (role)

---

### 3.2 suppliers — 供应商表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| name | VARCHAR(200) | NOT NULL | 供应商名称 |
| code | VARCHAR(50) | NULLABLE, UNIQUE | 供应商编号 |
| contact_name | VARCHAR(100) | NULLABLE | 联系人姓名 |
| phone | VARCHAR(50) | NULLABLE | 电话 |
| email | VARCHAR(255) | NULLABLE | 邮箱 |
| address | TEXT | NULLABLE | 地址 |
| notes | TEXT | NULLABLE | 备注 |
| is_active | TINYINT(1) | NOT NULL, DEFAULT 1 | 是否启用 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| deleted_at | DATETIME | NULLABLE | 软删除时间 |

**索引：**
- `idx_suppliers_name` (name)
- `idx_suppliers_code` UNIQUE (code) WHERE code IS NOT NULL
- `idx_suppliers_deleted_at` (deleted_at)

---

### 3.3 categories — 产品分类表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | NOT NULL | 分类名称 |
| name_en | VARCHAR(100) | NULLABLE | 英文名称 |
| parent_id | INT UNSIGNED | NULLABLE, FK → categories.id | 父分类ID |
| sort_order | INT | NOT NULL, DEFAULT 0 | 排序顺序 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**索引：**
- `idx_categories_parent_id` (parent_id)

**预设分类数据：**
```
├── 蔬菜 (Vegetables)
│   ├── 叶菜类
│   ├── 根茎类
│   ├── 瓜果类
│   └── 豆类
├── 水果 (Fruits)
├── 肉类 (Meat)
│   ├── 猪肉
│   ├── 牛肉
│   ├── 鸡鸭
│   └── 海鲜
├── 冷冻食品 (Frozen)
├── 干货 (Dry Goods)
│   ├── 米面
│   ├── 调味料
│   ├── 罐头
│   └── 干货杂粮
├── 饮料 (Beverages)
├── 零食 (Snacks)
├── 日用品 (Household)
├── 豆腐制品 (Tofu Products)
└── 其他 (Others)
```

---

### 3.4 products — 产品表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| sku | VARCHAR(50) | NULLABLE, UNIQUE | SKU 编码 |
| barcode | VARCHAR(50) | NULLABLE | 条形码 |
| name_en | VARCHAR(300) | NOT NULL | 英文名称 |
| name_zh | VARCHAR(300) | NULLABLE | 中文名称 |
| category_id | INT UNSIGNED | NULLABLE, FK → categories.id | 分类 |
| default_supplier_id | INT UNSIGNED | NULLABLE, FK → suppliers.id | 默认供应商 |
| default_unit | VARCHAR(20) | NOT NULL, DEFAULT 'Case' | 默认计量单位 |
| default_price | DECIMAL(12,2) | NULLABLE | 默认进价 |
| image_url | VARCHAR(500) | NULLABLE | 产品图片路径 |
| notes | TEXT | NULLABLE | 备注 |
| is_active | TINYINT(1) | NOT NULL, DEFAULT 1 | 是否启用 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |
| deleted_at | DATETIME | NULLABLE | 软删除时间 |

**索引：**
- `idx_products_sku` UNIQUE (sku) WHERE sku IS NOT NULL
- `idx_products_name_en` (name_en)
- `idx_products_name_zh` (name_zh)
- `idx_products_category_id` (category_id)
- `idx_products_default_supplier_id` (default_supplier_id)
- `idx_products_deleted_at` (deleted_at)
- `FULLTEXT idx_products_search` (name_en, name_zh) — 全文搜索

---

### 3.5 invoices — 发票表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| supplier_id | INT UNSIGNED | NULLABLE, FK → suppliers.id | 供应商 |
| invoice_number | VARCHAR(100) | NOT NULL | 发票编号 |
| invoice_date | DATE | NOT NULL | 发票日期 |
| customer_code | VARCHAR(50) | NULLABLE | 客户编号（超市在供应商处的编号） |
| subtotal | DECIMAL(12,2) | NULLABLE | 税前小计 |
| has_tax | TINYINT(1) | NOT NULL, DEFAULT 0 | 是否含税 |
| tax_amount | DECIMAL(12,2) | NULLABLE | 税额 |
| grand_total | DECIMAL(12,2) | NOT NULL | 含税总价 |
| file_path | VARCHAR(500) | NOT NULL | 原件文件路径 |
| file_type | ENUM('pdf','image','excel') | NOT NULL | 文件类型 |
| ocr_method | ENUM('text_extract','ai_vision','excel_parse','manual') | NOT NULL | OCR方式 |
| ocr_raw_result | JSON | NULLABLE | OCR 原始识别结果 |
| status | ENUM('pending','confirmed','rejected') | NOT NULL, DEFAULT 'pending' | 状态 |
| uploaded_by | INT UNSIGNED | NOT NULL, FK → users.id | 上传用户 |
| confirmed_by | INT UNSIGNED | NULLABLE, FK → users.id | 确认用户 |
| confirmed_at | DATETIME | NULLABLE | 确认时间 |
| notes | TEXT | NULLABLE | 备注 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**索引：**
- `idx_invoices_supplier_id` (supplier_id)
- `idx_invoices_invoice_number` (invoice_number)
- `idx_invoices_invoice_date` (invoice_date)
- `idx_invoices_status` (status)
- `idx_invoices_uploaded_by` (uploaded_by)
- `idx_invoices_supplier_date` (supplier_id, invoice_date)

---

### 3.6 invoice_items — 发票明细表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| invoice_id | INT UNSIGNED | NOT NULL, FK → invoices.id | 所属发票 |
| product_id | INT UNSIGNED | NULLABLE, FK → products.id | 关联产品（匹配后） |
| raw_name_en | VARCHAR(300) | NULLABLE | 原始英文名（OCR识别原文） |
| raw_name_zh | VARCHAR(300) | NULLABLE | 原始中文名（OCR识别原文） |
| quantity | DECIMAL(10,2) | NOT NULL | 数量 |
| unit | VARCHAR(20) | NOT NULL | 单位 |
| unit_price | DECIMAL(12,2) | NOT NULL | 单价 |
| line_total | DECIMAL(12,2) | NOT NULL | 行小计 |
| matched_confidence | DECIMAL(3,2) | NULLABLE | 产品匹配置信度 (0-1) |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**索引：**
- `idx_invoice_items_invoice_id` (invoice_id)
- `idx_invoice_items_product_id` (product_id)

---

### 3.7 inventory — 库存表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| product_id | INT UNSIGNED | UNIQUE, NOT NULL, FK → products.id | 产品（一对一） |
| quantity | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | 当前库存量 |
| unit | VARCHAR(20) | NOT NULL, DEFAULT 'Case' | 库存单位 |
| safe_stock | DECIMAL(10,2) | NULLABLE | 安全库存量 |
| last_restock_date | DATE | NULLABLE | 最后入库日期 |
| last_restock_quantity | DECIMAL(10,2) | NULLABLE | 最后入库数量 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**索引：**
- `idx_inventory_product_id` UNIQUE (product_id)
- `idx_inventory_quantity_safe` (quantity, safe_stock) — 用于库存预警查询

---

### 3.8 inventory_logs — 库存变动日志表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| product_id | INT UNSIGNED | NOT NULL, FK → products.id | 产品 |
| type | ENUM('in','out','adjust','stocktake') | NOT NULL | 变动类型 |
| quantity | DECIMAL(10,2) | NOT NULL | 变动数量（正为入，负为出） |
| quantity_before | DECIMAL(10,2) | NOT NULL | 变动前库存 |
| quantity_after | DECIMAL(10,2) | NOT NULL | 变动后库存 |
| invoice_id | INT UNSIGNED | NULLABLE, FK → invoices.id | 关联发票（入库时） |
| reason | VARCHAR(500) | NULLABLE | 变动原因 |
| operated_by | INT UNSIGNED | NOT NULL, FK → users.id | 操作人 |
| created_at | DATETIME | NOT NULL | 创建时间 |

**索引：**
- `idx_inventory_logs_product_id` (product_id)
- `idx_inventory_logs_type` (type)
- `idx_inventory_logs_invoice_id` (invoice_id)
- `idx_inventory_logs_created_at` (created_at)
- `idx_inventory_logs_product_date` (product_id, created_at)

---

### 3.9 supplier_templates — 供应商发票模板表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| supplier_id | INT UNSIGNED | UNIQUE, NOT NULL, FK → suppliers.id | 供应商 |
| template_type | ENUM('regex','positional','ai_prompt') | NOT NULL | 模板类型 |
| template_config | JSON | NOT NULL | 模板配置（正则规则、列位置等） |
| sample_file_path | VARCHAR(500) | NULLABLE | 样本文件路径 |
| success_count | INT | NOT NULL, DEFAULT 0 | 成功匹配次数 |
| last_used_at | DATETIME | NULLABLE | 最后使用时间 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**template_config JSON 结构示例：**
```json
{
  "supplier_name_pattern": "CBS|C\\.B\\.S\\.",
  "invoice_number_pattern": "INV\\d{6}",
  "date_pattern": "\\d{2}/\\d{2}/\\d{4}",
  "date_format": "MM/DD/YYYY",
  "columns": {
    "quantity": { "index": 0, "label": "Quantity" },
    "unit": { "index": 1, "label": "Unit" },
    "description": { "index": 2, "label": "Description" },
    "unit_price": { "index": 3, "label": "Unit Price" },
    "taxes": { "index": 4, "label": "Taxes" },
    "amount": { "index": 5, "label": "Amount" }
  },
  "total_pattern": "Total\\s+\\$\\s*([\\d,]+\\.\\d{2})"
}
```

---

### 3.10 audit_logs — 审计日志表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| user_id | INT UNSIGNED | NULLABLE, FK → users.id | 操作用户 |
| action | VARCHAR(50) | NOT NULL | 操作动作 |
| entity_type | VARCHAR(50) | NOT NULL | 实体类型 |
| entity_id | INT UNSIGNED | NULLABLE | 实体ID |
| details | JSON | NULLABLE | 操作详情（变更前后对比） |
| ip_address | VARCHAR(45) | NULLABLE | IP地址 |
| user_agent | VARCHAR(500) | NULLABLE | 浏览器标识 |
| created_at | DATETIME | NOT NULL | 操作时间 |

**action 枚举值：**
- `login`, `logout`, `login_failed`
- `create`, `update`, `delete`
- `upload_invoice`, `confirm_invoice`, `reject_invoice`
- `adjust_inventory`, `stocktake`
- `change_setting`

**索引：**
- `idx_audit_logs_user_id` (user_id)
- `idx_audit_logs_action` (action)
- `idx_audit_logs_entity` (entity_type, entity_id)
- `idx_audit_logs_created_at` (created_at)

---

### 3.11 ai_providers — AI 提供商配置表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| name | VARCHAR(100) | NOT NULL | 提供商显示名称（如"本地 GPT"、"千问"、"OpenAI"） |
| base_url | VARCHAR(500) | NOT NULL | API 服务地址（如 http://127.0.0.1:8317） |
| api_key_encrypted | TEXT | NOT NULL | AES-256 加密存储的 API Key |
| model | VARCHAR(100) | NOT NULL | 模型名称（如 gpt-5.2 / qwen-vl-max） |
| thinking_effort | ENUM('xhigh','high','medium','low') | NULLABLE | 思考深度参数（部分模型支持） |
| supports_vision | TINYINT(1) | NOT NULL, DEFAULT 1 | 是否支持图片输入（Vision） |
| purpose | ENUM('ocr','analysis','chat','all') | NOT NULL, DEFAULT 'all' | 用途：ocr识别/分析/对话/全部 |
| is_active | TINYINT(1) | NOT NULL, DEFAULT 1 | 是否启用 |
| is_default | TINYINT(1) | NOT NULL, DEFAULT 0 | 是否为默认提供商 |
| max_tokens | INT | NOT NULL, DEFAULT 4096 | 最大输出 Token 数 |
| temperature | DECIMAL(3,2) | NOT NULL, DEFAULT 0.30 | 默认温度参数 |
| last_test_at | DATETIME | NULLABLE | 最后连通测试时间 |
| last_test_success | TINYINT(1) | NULLABLE | 最后测试是否成功 |
| last_test_latency_ms | INT | NULLABLE | 最后测试延迟(ms) |
| notes | TEXT | NULLABLE | 备注 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**索引：**
- `idx_ai_providers_purpose` (purpose, is_active)
- `idx_ai_providers_is_default` (is_default)

**预设提供商数据（开发环境）：**
| name | base_url | model | thinking_effort | purpose |
|------|----------|-------|-----------------|---------|
| 本地 GPT | http://127.0.0.1:8317 | gpt-5.2 | xhigh | all |

**千问 Qwen 配置示例：**
| name | base_url | model | purpose |
|------|----------|-------|---------|
| 千问 VL | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-vl-max | ocr |
| 千问 Plus | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus | analysis |

---

### 3.12 settings — 系统设置表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| key | VARCHAR(100) | UNIQUE, NOT NULL | 设置键名 |
| value | TEXT | NOT NULL | 设置值（JSON字符串） |
| description | VARCHAR(500) | NULLABLE | 设置说明 |
| updated_by | INT UNSIGNED | NULLABLE, FK → users.id | 最后修改人 |
| created_at | DATETIME | NOT NULL | 创建时间 |
| updated_at | DATETIME | NOT NULL | 更新时间 |

**预设设置项：**
| key | 默认value | 说明 |
|-----|-----------|------|
| `default_safe_stock` | `5` | 默认安全库存量 |
| `stock_alert_enabled` | `true` | 是否启用库存预警 |
| `email_notification_enabled` | `false` | 是否启用邮件通知 |
| `notification_email` | `""` | 通知接收邮箱 |
| `invoice_require_approval` | `false` | 入库是否需要审批 |
| `slow_moving_days` | `30` | 滞销产品判定天数 |
| `price_alert_threshold` | `0.1` | 价格异常波动告警阈值(10%) |
| `assistant_mode` | `local` | 智能助手默认模式：local / llm / auto（迁移 025） |
| `assistant_snapshot_ttl_seconds` | `60` | 本地资料库快照缓存秒数；写操作会立即失效缓存 |
| `ai_encryption_key` | 环境变量 | AI API Key 的 AES-256 加密密钥（从环境变量加载，不存库） |

> 注意：AI 提供商配置（Base URL / API Key / 模型等）已移至独立的 `ai_providers` 表管理，不再使用 settings 表存储。

---

### 3.13 notifications — 通知表

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| user_id | INT UNSIGNED | NOT NULL, FK → users.id | 目标用户 |
| type | ENUM('stock_alert','price_alert','system','invoice') | NOT NULL | 通知类型 |
| title | VARCHAR(200) | NOT NULL | 通知标题 |
| message | TEXT | NOT NULL | 通知内容 |
| is_read | TINYINT(1) | NOT NULL, DEFAULT 0 | 是否已读 |
| link | VARCHAR(500) | NULLABLE | 关联链接 |
| created_at | DATETIME | NOT NULL | 创建时间 |

**索引：**
- `idx_notifications_user_id` (user_id)
- `idx_notifications_is_read` (user_id, is_read)
- `idx_notifications_created_at` (created_at)

---

## 4. 数据库迁移计划

使用 Knex.js 迁移系统，按以下顺序创建迁移文件：

```
migrations/
├── 001_create_users_table.ts
├── 002_create_suppliers_table.ts
├── 003_create_categories_table.ts
├── 004_create_products_table.ts
├── 005_create_invoices_table.ts
├── 006_create_invoice_items_table.ts
├── 007_create_inventory_table.ts
├── 008_create_inventory_logs_table.ts
├── 009_create_supplier_templates_table.ts
├── 010_create_audit_logs_table.ts
├── 011_create_ai_providers_table.ts
├── 012_create_settings_table.ts
├── 013_create_notifications_table.ts
├── 014_add_ocr_fields_to_invoice_items.ts
├── 015_add_analytics_composite_indexes.ts
├── 016_create_stores_and_store_id.ts
├── 017_create_sales_tables.ts
├── 018_add_selling_price_to_products.ts
├── 019_create_inventory_batches.ts
├── 020_create_supplier_payments.ts
├── 021_add_barcode_and_sales_indexes.ts
├── 022_add_token_version_to_users.ts
├── 023_create_sales_item_batches.ts
├── 024_create_supplier_product_aliases.ts
├── 025_add_assistant_settings.ts   # assistant_mode / 快照 TTL（默认 local）
```

---

## 5. 种子数据

```
seeds/
├── 01_admin_user.ts            # 默认管理员账号（用户名 admin，密码由 SEED_ADMIN_PASSWORD 提供）
├── 02_categories.ts            # 预设产品分类
├── 03_default_ai_providers.ts   # 默认 AI 提供商配置（仅在提供 SEED_DEFAULT_AI_PROVIDER_API_KEY 时创建）
├── 04_default_settings.ts      # 默认系统设置（逐 key 补齐，不覆盖已改值）
```

---

## 6. 查询优化建议

### 6.1 高频查询场景与索引覆盖

| 查询场景 | 涉及表 | 使用索引 |
|----------|--------|----------|
| 当前库存列表（含预警） | inventory + products | idx_inventory_quantity_safe |
| 某供应商的发票历史 | invoices | idx_invoices_supplier_date |
| 产品搜索（中英文） | products | FULLTEXT idx_products_search |
| 某产品的价格历史 | invoice_items | idx_invoice_items_product_id |
| 未读通知数量 | notifications | idx_notifications_is_read |
| 审计日志查询 | audit_logs | idx_audit_logs_entity |

### 6.2 数据归档策略
- **审计日志**：保留 12 个月，超期数据可导出后清理
- **通知**：已读通知保留 3 个月
- **发票原件**：保留 2 年
- **库存变动日志**：保留 12 个月

### 6.3 连接池配置（共享主机）
```typescript
{
  pool: {
    min: 1,
    max: 5,           // 共享主机连接数限制
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 60000
  }
}
```
