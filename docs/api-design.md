# 熊猫超市智能库存管理系统 — API 接口设计文档

> 版本：v1.0  
> 日期：2026-03-04  
> 作者：Cascade AI  
> 状态：草稿

---

## 1. 概述

### 1.1 基本规范
- **Base URL**：`https://{domain}/api/v1`
- **协议**：HTTPS
- **数据格式**：JSON（Content-Type: application/json）
- **文件上传**：multipart/form-data
- **认证方式**：Bearer Token（JWT）
- **时间格式**：ISO 8601（`YYYY-MM-DDTHH:mm:ss.sssZ`）
- **分页参数**：`page`（页码，从1开始）、`pageSize`（每页条数，默认20，最大100）
- **排序参数**：`sortBy`（字段名）、`sortOrder`（asc/desc）

### 1.2 统一响应格式

**成功响应：**
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

**列表响应（带分页）：**
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 156,
      "totalPages": 8
    }
  }
}
```

**错误响应：**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败",
    "details": [
      { "field": "username", "message": "用户名不能为空" }
    ]
  }
}
```

### 1.3 错误码定义

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | VALIDATION_ERROR | 请求参数验证失败 |
| 400 | BAD_REQUEST | 请求格式错误 |
| 401 | UNAUTHORIZED | 未认证或 Token 过期 |
| 401 | INVALID_CREDENTIALS | 用户名或密码错误 |
| 401 | ACCOUNT_LOCKED | 账户已锁定 |
| 403 | FORBIDDEN | 权限不足 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突（如重复创建） |
| 413 | FILE_TOO_LARGE | 上传文件过大 |
| 415 | UNSUPPORTED_FILE_TYPE | 不支持的文件类型 |
| 422 | BUSINESS_ERROR | 业务逻辑错误 |
| 429 | RATE_LIMITED | 请求频率超限 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

### 1.4 认证说明

除了登录接口外，所有 API 请求必须携带 JWT Token：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

权限标记说明：
- 🔓 无需认证
- 👤 需要登录（所有角色）
- 🔒 仅管理员 (Admin)

补充规则：
- 当接口标记为 `👤` 时，服务端仍可根据角色返回不同的数据视图。
- 店员仅保留“待处理发票”的收货校对相关金额可见性；历史发票金额、产品价格历史、供应商累计采购金额等财务数据不对店员开放。

---

## 2. 认证模块 (Auth)

### 2.1 用户登录
🔓 `POST /api/v1/auth/login`

**请求体：**
```json
{
  "username": "admin",
  "password": "<configured-password>"
}
```

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400,
    "user": {
      "id": 1,
      "username": "admin",
      "displayName": "管理员",
      "role": "admin",
      "email": "admin@pandamart.com"
    }
  }
}
```

**错误响应 (401)：**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误"
  }
}
```

### 2.2 获取当前用户信息
👤 `GET /api/v1/auth/me`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "displayName": "管理员",
    "role": "admin",
    "email": "admin@pandamart.com",
    "lastLoginAt": "2026-03-04T10:30:00.000Z"
  }
}
```

### 2.3 修改密码
👤 `PUT /api/v1/auth/password`

**请求体：**
```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

### 2.4 登出
👤 `POST /api/v1/auth/logout`

> 服务端记录登出日志，客户端清除本地 Token。

---

## 3. 发票模块 (Invoices)

### 3.1 上传并识别发票
👤 `POST /api/v1/invoices/upload`

**请求类型：** multipart/form-data

**参数：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | ✅ | 发票文件（PDF/JPG/PNG/XLSX） |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "invoiceId": 42,
    "ocrMethod": "ai_vision",
    "recognized": {
      "supplierName": "CBS",
      "supplierCode": null,
      "invoiceNumber": "INV759723",
      "invoiceDate": "2025-02-26",
      "customerCode": "S59959",
      "items": [
        {
          "productNameEn": "NAPA",
          "productNameZh": "绍菜",
          "quantity": 4.00,
          "unit": "Case",
          "unitPrice": 50.00,
          "lineTotal": 200.00,
          "matchedProduct": {
            "id": 15,
            "nameEn": "NAPA CABBAGE",
            "nameZh": "绍菜",
            "confidence": 0.92
          }
        },
        {
          "productNameEn": "SHANGHAI TIPS",
          "productNameZh": "上海苗",
          "quantity": 2.00,
          "unit": "Case",
          "unitPrice": 35.00,
          "lineTotal": 70.00,
          "matchedProduct": null
        }
      ],
      "subtotal": 1040.00,
      "hasTax": false,
      "taxAmount": null,
      "grandTotal": 1040.00
    },
    "filePath": "/uploads/invoices/2026/03/1709568000_vegis_invoice.pdf",
    "fileType": "pdf"
  }
}
```

### 3.2 确认发票入库
👤 `POST /api/v1/invoices/:id/confirm`

**请求体：**
```json
{
  "supplierId": 3,
  "invoiceNumber": "INV759723",
  "invoiceDate": "2025-02-26",
  "customerCode": "S59959",
  "items": [
    {
      "productId": 15,
      "productNameEn": "NAPA CABBAGE",
      "productNameZh": "绍菜",
      "quantity": 4.00,
      "unit": "Case",
      "unitPrice": 50.00,
      "lineTotal": 200.00,
      "isNewProduct": false
    },
    {
      "productId": null,
      "productNameEn": "SHANGHAI TIPS",
      "productNameZh": "上海苗",
      "quantity": 2.00,
      "unit": "Case",
      "unitPrice": 35.00,
      "lineTotal": 70.00,
      "isNewProduct": true,
      "categoryId": 1
    }
  ],
  "subtotal": 1040.00,
  "hasTax": false,
  "taxAmount": null,
  "grandTotal": 1040.00,
  "notes": ""
}
```

> 当 `isNewProduct` 为 true 时，系统自动创建新产品记录。
> 返回值中的 `priceAlerts` 仅管理员可见；店员在确认入库时仍可完成当前待处理发票的收货流程，但不会获得历史价格告警明细。

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "invoiceId": 42,
    "status": "confirmed",
    "newProductsCreated": 1,
    "inventoryUpdated": 2,
    "priceAlerts": [
      {
        "productId": 15,
        "productName": "NAPA CABBAGE 绍菜",
        "previousPrice": 45.00,
        "currentPrice": 50.00,
        "changePercent": 11.1
      }
    ]
  },
  "message": "发票已确认入库，2个产品库存已更新，1个新产品已创建"
}
```

### 3.3 驳回发票
👤 `POST /api/v1/invoices/:id/reject`

**请求体：**
```json
{
  "reason": "发票重复上传"
}
```

### 3.4 获取发票列表
👤 `GET /api/v1/invoices`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| status | string | 筛选状态：pending/confirmed/rejected |
| supplierId | number | 按供应商筛选 |
| dateFrom | string | 起始日期 (YYYY-MM-DD) |
| dateTo | string | 截止日期 (YYYY-MM-DD) |
| keyword | string | 搜索关键词（发票号） |
| sortBy | string | 排序字段 |
| sortOrder | string | 排序方向 |

> 角色边界：
> - 管理员可查看所有状态的发票记录。
> - 店员仅可查看 `pending` 状态的待处理发票；如显式请求其他状态，服务端返回 `403 FORBIDDEN`。

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 42,
        "supplierName": "CBS",
        "invoiceNumber": "INV759723",
        "invoiceDate": "2025-02-26",
        "grandTotal": 1040.00,
        "itemCount": 20,
        "status": "confirmed",
        "ocrMethod": "ai_vision",
        "uploadedBy": "staff1",
        "confirmedBy": "admin",
        "createdAt": "2026-03-04T10:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 156,
      "totalPages": 8
    }
  }
}
```

### 3.5 获取发票详情
👤 `GET /api/v1/invoices/:id`

> 角色边界：
> - 管理员可查看任意状态发票详情。
> - 店员仅可查看 `pending` 状态的待处理发票详情。

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "supplier": { "id": 3, "name": "CBS" },
    "invoiceNumber": "INV759723",
    "invoiceDate": "2025-02-26",
    "customerCode": "S59959",
    "items": [
      {
        "id": 101,
        "product": { "id": 15, "nameEn": "NAPA CABBAGE", "nameZh": "绍菜" },
        "rawNameEn": "NAPA",
        "rawNameZh": "绍菜",
        "quantity": 4.00,
        "unit": "Case",
        "unitPrice": 50.00,
        "lineTotal": 200.00
      }
    ],
    "subtotal": 1040.00,
    "hasTax": false,
    "taxAmount": null,
    "grandTotal": 1040.00,
    "filePath": "/uploads/invoices/2026/03/...",
    "fileType": "pdf",
    "ocrMethod": "ai_vision",
    "ocrRawResult": { ... },
    "status": "confirmed",
    "uploadedBy": { "id": 2, "displayName": "店员小王" },
    "confirmedBy": { "id": 1, "displayName": "管理员" },
    "confirmedAt": "2026-03-04T11:00:00.000Z",
    "notes": "",
    "createdAt": "2026-03-04T10:30:00.000Z"
  }
}
```

### 3.6 下载发票原件
👤 `GET /api/v1/invoices/:id/file`

> 返回原始文件流（PDF/图片/Excel），用于前端对照查看。
> 店员仅可访问 `pending` 状态发票的原始文件；历史已确认/已驳回发票原件仅管理员可访问。

---

## 4. 产品模块 (Products)

### 4.1 获取产品列表
👤 `GET /api/v1/products`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| keyword | string | 搜索关键词（中英文名、SKU） |
| categoryId | number | 按分类筛选 |
| supplierId | number | 按供应商筛选 |
| isActive | boolean | 是否启用 |
| sortBy | string | 排序字段 |
| sortOrder | string | 排序方向 |

> 店员响应中不返回 `default_price` 等财务字段。

### 4.2 获取产品详情
👤 `GET /api/v1/products/:id`

> 店员响应中不返回 `default_price` 等财务字段。

### 4.3 创建产品
🔒 `POST /api/v1/products`

**请求体：**
```json
{
  "sku": "VEG-001",
  "barcode": "4901234567890",
  "nameEn": "NAPA CABBAGE",
  "nameZh": "绍菜",
  "categoryId": 1,
  "defaultSupplierId": 3,
  "defaultUnit": "Case",
  "defaultPrice": 50.00,
  "notes": "箱装"
}
```

### 4.4 更新产品
🔒 `PUT /api/v1/products/:id`

### 4.5 删除产品（软删除）
🔒 `DELETE /api/v1/products/:id`

### 4.6 批量导入产品
🔒 `POST /api/v1/products/import`

**请求类型：** multipart/form-data（Excel文件）

### 4.7 导出产品列表
🔒 `GET /api/v1/products/export`

> 返回 Excel 文件。

### 4.8 获取产品价格历史
🔒 `GET /api/v1/products/:id/price-history`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| dateFrom | string | 起始日期 |
| dateTo | string | 截止日期 |
| limit | number | 最多返回条数（默认50） |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-02-26",
      "unitPrice": 50.00,
      "quantity": 4,
      "supplierName": "CBS",
      "invoiceNumber": "INV759723"
    },
    {
      "date": "2025-02-19",
      "unitPrice": 45.00,
      "quantity": 3,
      "supplierName": "CBS",
      "invoiceNumber": "INV758901"
    }
  ]
}
```

---

## 5. 库存模块 (Inventory)

### 5.1 获取库存列表
👤 `GET /api/v1/inventory`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| keyword | string | 搜索产品名称 |
| categoryId | number | 按分类筛选 |
| alertOnly | boolean | 仅显示低库存预警 |
| sortBy | string | 排序字段（quantity/lastRestockDate） |
| sortOrder | string | 排序方向 |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "product": {
          "id": 15,
          "nameEn": "NAPA CABBAGE",
          "nameZh": "绍菜",
          "sku": "VEG-001",
          "category": "蔬菜"
        },
        "quantity": 3.00,
        "unit": "Case",
        "safeStock": 5.00,
        "isLowStock": true,
        "lastRestockDate": "2025-02-26",
        "lastRestockQuantity": 4.00
      }
    ],
    "pagination": { ... },
    "summary": {
      "totalProducts": 250,
      "lowStockCount": 12,
      "outOfStockCount": 3
    }
  }
}
```

### 5.2 手动调整库存
🔒 `POST /api/v1/inventory/:productId/adjust`

**请求体：**
```json
{
  "type": "adjust",
  "quantity": -2,
  "reason": "产品过期报损"
}
```

> type 可选值：`adjust`（调整）、`out`（出库）、`stocktake`（盘点）

### 5.3 设置安全库存
🔒 `PUT /api/v1/inventory/:productId/safe-stock`

**请求体：**
```json
{
  "safeStock": 10
}
```

### 5.4 获取库存变动日志
👤 `GET /api/v1/inventory/:productId/logs`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| type | string | 筛选类型：in/out/adjust/stocktake |
| dateFrom | string | 起始日期 |
| dateTo | string | 截止日期 |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 501,
        "type": "in",
        "quantity": 4.00,
        "quantityBefore": 1.00,
        "quantityAfter": 5.00,
        "invoiceNumber": "INV759723",
        "reason": null,
        "operatedBy": "admin",
        "createdAt": "2026-03-04T10:30:00.000Z"
      }
    ],
    "pagination": { ... }
  }
}
```

### 5.5 提交盘点
🔒 `POST /api/v1/inventory/stocktake`

**请求体：**
```json
{
  "items": [
    {
      "productId": 15,
      "actualQuantity": 8,
      "systemQuantity": 10,
      "notes": "少2箱"
    },
    {
      "productId": 22,
      "actualQuantity": 5,
      "systemQuantity": 5,
      "notes": ""
    }
  ],
  "notes": "2026年3月盘点"
}
```

---

## 6. 供应商模块 (Suppliers)

### 6.1 获取供应商列表
👤 `GET /api/v1/suppliers`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| keyword | string | 搜索供应商名称 |
| isActive | boolean | 是否启用 |

### 6.2 获取供应商详情
👤 `GET /api/v1/suppliers/:id`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "name": "CBS",
    "code": "CBS-001",
    "contactName": "张经理",
    "phone": "212-555-0123",
    "email": "order@cbs.com",
    "address": "123 Main St, Flushing, NY",
    "notes": "蔬菜供应商，周二周五送货",
    "isActive": true,
    "stats": {
      "totalInvoices": 52,
      "totalAmount": 58420.00,
      "productCount": 35,
      "lastInvoiceDate": "2025-02-26"
    },
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

> 店员响应中 `stats` 不返回 `totalAmount` 字段。

### 6.3 创建供应商
🔒 `POST /api/v1/suppliers`

### 6.4 更新供应商
🔒 `PUT /api/v1/suppliers/:id`

### 6.5 删除供应商（软删除）
🔒 `DELETE /api/v1/suppliers/:id`

### 6.6 获取供应商的产品列表
👤 `GET /api/v1/suppliers/:id/products`

### 6.7 获取供应商的发票历史
🔒 `GET /api/v1/suppliers/:id/invoices`

---

## 7. 分类模块 (Categories)

### 7.1 获取分类树
👤 `GET /api/v1/categories`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "蔬菜",
      "nameEn": "Vegetables",
      "sortOrder": 1,
      "productCount": 45,
      "children": [
        { "id": 11, "name": "叶菜类", "nameEn": "Leafy", "sortOrder": 1, "productCount": 20, "children": [] },
        { "id": 12, "name": "根茎类", "nameEn": "Root", "sortOrder": 2, "productCount": 10, "children": [] }
      ]
    }
  ]
}
```

### 7.2 创建分类
🔒 `POST /api/v1/categories`

### 7.3 更新分类
🔒 `PUT /api/v1/categories/:id`

### 7.4 删除分类
🔒 `DELETE /api/v1/categories/:id`

> 如果分类下有产品，返回 409 冲突错误。

---

## 8. 数据分析模块 (Analytics)

### 8.1 获取仪表盘概览
🔒 `GET /api/v1/analytics/dashboard`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "today": {
      "invoiceCount": 5,
      "totalAmount": 3250.00,
      "pendingInvoices": 2,
      "lowStockAlerts": 8
    },
    "thisWeek": {
      "invoiceCount": 28,
      "totalAmount": 18500.00
    },
    "thisMonth": {
      "invoiceCount": 95,
      "totalAmount": 62000.00
    },
    "recentInvoices": [
      {
        "id": 42,
        "supplierName": "CBS",
        "invoiceNumber": "INV759723",
        "grandTotal": 1040.00,
        "status": "confirmed",
        "createdAt": "2026-03-04T10:30:00.000Z"
      }
    ],
    "lowStockProducts": [
      {
        "productId": 15,
        "nameEn": "NAPA CABBAGE",
        "nameZh": "绍菜",
        "quantity": 2,
        "safeStock": 5,
        "unit": "Case"
      }
    ]
  }
}
```

### 8.2 采购趋势分析
🔒 `GET /api/v1/analytics/purchase-trend`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| period | string | day/week/month（默认 week） |
| dateFrom | string | 起始日期 |
| dateTo | string | 截止日期 |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    { "date": "2026-02-24", "amount": 12500.00, "invoiceCount": 15 },
    { "date": "2026-03-03", "amount": 18500.00, "invoiceCount": 28 }
  ]
}
```

### 8.3 畅销/滞销产品排名
🔒 `GET /api/v1/analytics/product-ranking`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | top_selling / slow_moving |
| limit | number | 返回条数（默认20） |
| dateFrom | string | 统计起始日期 |
| dateTo | string | 统计截止日期 |
| categoryId | number | 按分类筛选 |

**成功响应 (200) — 畅销：**
```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "productId": 15,
      "nameEn": "NAPA CABBAGE",
      "nameZh": "绍菜",
      "category": "蔬菜",
      "totalQuantity": 120,
      "totalAmount": 5400.00,
      "purchaseCount": 25,
      "avgPrice": 45.00
    }
  ]
}
```

**成功响应 (200) — 滞销：**
```json
{
  "success": true,
  "data": [
    {
      "productId": 88,
      "nameEn": "DRIED LILY BULB",
      "nameZh": "百合干",
      "category": "干货",
      "lastPurchaseDate": "2025-12-15",
      "daysSinceLastPurchase": 79,
      "currentStock": 3
    }
  ]
}
```

### 8.4 价格波动分析
🔒 `GET /api/v1/analytics/price-changes`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| threshold | number | 波动阈值百分比（默认10） |
| dateFrom | string | 起始日期 |
| dateTo | string | 截止日期 |
| limit | number | 返回条数 |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    {
      "productId": 15,
      "nameEn": "NAPA CABBAGE",
      "nameZh": "绍菜",
      "previousPrice": 45.00,
      "currentPrice": 50.00,
      "changePercent": 11.1,
      "changeDate": "2025-02-26",
      "supplierName": "CBS"
    }
  ]
}
```

### 8.5 供应商采购占比
🔒 `GET /api/v1/analytics/supplier-distribution`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| dateFrom | string | 起始日期 |
| dateTo | string | 截止日期 |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    { "supplierId": 3, "supplierName": "CBS", "totalAmount": 15200.00, "percentage": 24.5, "invoiceCount": 12 },
    { "supplierId": 5, "supplierName": "东方食品", "totalAmount": 12800.00, "percentage": 20.6, "invoiceCount": 8 }
  ]
}
```

### 8.6 分类采购分析
🔒 `GET /api/v1/analytics/category-distribution`

### 8.7 智能订货建议
🔒 `GET /api/v1/analytics/reorder-suggestions`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    {
      "productId": 15,
      "nameEn": "NAPA CABBAGE",
      "nameZh": "绍菜",
      "currentStock": 2,
      "safeStock": 5,
      "avgWeeklyUsage": 8.5,
      "suggestedQuantity": 12,
      "suggestedSupplier": { "id": 3, "name": "CBS" },
      "estimatedCost": 600.00,
      "lastPrice": 50.00,
      "urgency": "high"
    }
  ]
}
```

---

## 9. 通知模块 (Notifications)

### 9.1 获取通知列表
👤 `GET /api/v1/notifications`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| isRead | boolean | 筛选已读/未读 |

### 9.2 获取未读通知数量
👤 `GET /api/v1/notifications/unread-count`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": { "count": 5 }
}
```

### 9.3 标记通知为已读
👤 `PUT /api/v1/notifications/:id/read`

### 9.4 标记全部已读
👤 `PUT /api/v1/notifications/read-all`

---

## 10. 用户管理模块 (Users)

### 10.1 获取用户列表
🔒 `GET /api/v1/users`

### 10.2 创建用户
🔒 `POST /api/v1/users`

**请求体：**
```json
{
  "username": "staff1",
  "password": "<strong-password>",
  "displayName": "店员小王",
  "email": "staff1@pandamart.com",
  "role": "staff"
}
```

### 10.3 更新用户
🔒 `PUT /api/v1/users/:id`

### 10.4 启用/禁用用户
🔒 `PUT /api/v1/users/:id/status`

**请求体：**
```json
{
  "isActive": false
}
```

### 10.5 重置用户密码
🔒 `PUT /api/v1/users/:id/reset-password`

**请求体：**
```json
{
  "newPassword": "<strong-password>"
}
```

---

## 11. 系统设置模块 (Settings)

### 11.1 获取所有设置
🔒 `GET /api/v1/settings`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "defaultSafeStock": 5,
    "stockAlertEnabled": true,
    "emailNotificationEnabled": false,
    "notificationEmail": "",
    "invoiceRequireApproval": false,
    "slowMovingDays": 30,
    "priceAlertThreshold": 0.1
  }
}
```

> 注意：AI 提供商配置已移至独立的 AI Providers 模块管理，不在 settings 中。

### 11.2 更新设置
🔒 `PUT /api/v1/settings`

**请求体：**
```json
{
  "defaultSafeStock": 8,
  "stockAlertEnabled": true,
  "emailNotificationEnabled": true,
  "notificationEmail": "owner@pandamart.com",
  "slowMovingDays": 45,
  "priceAlertThreshold": 0.15
}
```

---

## 12. AI 提供商管理模块 (AI Providers)

### 12.1 获取所有 AI 提供商
🔒 `GET /api/v1/ai-providers`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "本地 GPT",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKeyMasked": "sk-3I...bK3",
      "model": "gpt-5.2",
      "thinkingEffort": "xhigh",
      "supportsVision": true,
      "purpose": "all",
      "isActive": true,
      "isDefault": true,
      "maxTokens": 4096,
      "temperature": 0.3,
      "lastTestAt": "2026-03-04T15:00:00.000Z",
      "lastTestSuccess": true,
      "lastTestLatencyMs": 320,
      "notes": "开发环境默认"
    }
  ]
}
```

> 注意：API Key 返回脱敏版本 `apiKeyMasked`（前4后3位），不返回原文。

### 12.2 创建 AI 提供商
🔒 `POST /api/v1/ai-providers`

**请求体：**
```json
{
  "name": "千问 VL",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "apiKey": "<api-key>",
  "model": "qwen-vl-max",
  "thinkingEffort": null,
  "supportsVision": true,
  "purpose": "ocr",
  "isActive": true,
  "isDefault": false,
  "maxTokens": 4096,
  "temperature": 0.1,
  "notes": "千问视觉模型，用于发票OCR"
}
```

### 12.3 更新 AI 提供商
🔒 `PUT /api/v1/ai-providers/:id`

**请求体：**
```json
{
  "name": "千问 VL",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "apiKey": "sk-new-key",
  "model": "qwen-vl-max-latest",
  "thinkingEffort": null,
  "supportsVision": true,
  "purpose": "ocr",
  "isActive": true,
  "maxTokens": 4096,
  "temperature": 0.1
}
```

> 如果 `apiKey` 字段为空或不传，则保持原有 API Key 不变。

### 12.4 删除 AI 提供商
🔒 `DELETE /api/v1/ai-providers/:id`

### 12.5 测试 AI 提供商连接
🔒 `POST /api/v1/ai-providers/:id/test`

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "message": "连接成功",
    "latencyMs": 320,
    "modelResponse": "ok"
  }
}
```

**失败响应 (200)：**
```json
{
  "success": true,
  "data": {
    "connected": false,
    "message": "Connection refused: http://127.0.0.1:8317",
    "latencyMs": 5012,
    "modelResponse": null
  }
}
```

### 12.6 设置默认提供商
🔒 `PUT /api/v1/ai-providers/:id/set-default`

> 将指定提供商设为默认，同时取消其他提供商的默认标记。

---

## 13. AI 智能对话模块 (AI Chat)

### 13.1 发送智能对话
🔒 `POST /api/v1/ai/chat`

**请求体：**
```json
{
  "message": "最近一个月哪些蔬菜涨价最多？",
  "conversationId": null
}
```

> `conversationId` 可选，传入则继续上次对话上下文。

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_abc123",
    "reply": "根据最近一个月的采购数据分析，涨价幅度最大的蔬菜如下：\n\n1. **蓒芯 (蓒芯)** — 从 $80/箱 涨到 $95/箱，涨幅 18.8%\n2. **绍菜 (NAPA)** — 从 $45/箱 涨到 $50/箱，涨幅 11.1%\n3. **莲藕 (LOTUS ROOT)** — 从 $35/箱 涨到 $39/箱，涨幅 11.4%\n\n建议关注蓒芯的价格走势，可考虑寻找替代供应商。",
    "dataUsed": {
      "tables": ["invoice_items", "products", "invoices"],
      "dateRange": "2026-02-04 ~ 2026-03-04",
      "recordCount": 342
    }
  }
}
```

### 13.2 获取 AI 订货建议（LLM 增强版）
🔒 `POST /api/v1/ai/reorder-advice`

**请求体：**
```json
{
  "categoryId": 1,
  "context": "下周是春节"
}
```

> 与 `analytics/reorder-suggestions`（统计计算版）不同，这个接口会调用 LLM 生成带推理分析的自然语言建议。

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "advice": "✅ **本周蔬菜类订货建议**（考虑春节因素）\n\n春节前一周通常需求量会增加 30-50%，建议提前备货：\n\n**需要加量的产品：**\n- 绍菜 (NAPA): 建议订 8 箱（平时 4 箱），春节汤料需求大\n- 韭菜 (CHIVE): 建议订 4 箱（平时 2 箱），包饺子需求\n- 莲藕 (LOTUS ROOT): 建议订 3 箱（平时 1 箱）\n\n**可适当减少的产品：**\n- 生菜类可保持正常量\n\n**预估采购总额：** ~$1,850",
    "suggestedItems": [
      { "productId": 15, "nameZh": "绍菜", "suggestedQty": 8, "normalQty": 4, "reason": "春节汤料需求" }
    ]
  }
}
```

### 13.3 AI 经营洞察报告
🔒 `GET /api/v1/ai/insights`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| period | string | week / month（默认 week） |

**成功响应 (200)：**
```json
{
  "success": true,
  "data": {
    "period": "2026-02-24 ~ 2026-03-04",
    "summary": "本周采购总额 $18,500，较上周增长 12%。CBS 供应商的蔬菜普遍涨价 5-10%，建议关注。蓒芯持续涨价已达 3 周，可考虑联系备用供应商。",
    "alerts": [
      { "type": "price_spike", "message": "蓒芯连续 3 周涨价，累计涨幅 18.8%" },
      { "type": "stockout_risk", "message": "油菜苗库存仅剩 1 箱，下次送货日为周二" }
    ],
    "generatedAt": "2026-03-04T15:30:00.000Z"
  }
}
```

---

## 14. 审计日志模块 (Audit Logs)

### 12.1 获取审计日志
🔒 `GET /api/v1/audit-logs`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| pageSize | number | 每页条数 |
| userId | number | 按用户筛选 |
| action | string | 按操作类型筛选 |
| entityType | string | 按实体类型筛选 |
| dateFrom | string | 起始日期 |
| dateTo | string | 截止日期 |

---

## 15. 数据导出模块 (Export)

### 13.1 导出库存数据
🔒 `GET /api/v1/export/inventory`

> 返回 Excel 文件，包含所有产品的当前库存信息。

### 13.2 导出采购记录
🔒 `GET /api/v1/export/purchases`

**查询参数：**
| 参数 | 类型 | 说明 |
|------|------|------|
| dateFrom | string | 起始日期（必填） |
| dateTo | string | 截止日期（必填） |
| supplierId | number | 按供应商筛选 |
| format | string | xlsx（默认）|

### 13.3 导出全量数据备份
🔒 `GET /api/v1/export/full-backup`

> 返回 JSON 文件，包含所有业务数据。

---

## 16. API 限流规则

| 接口类型 | 限流规则 |
|----------|----------|
| 登录接口 | 5次/分钟/IP |
| 文件上传 | 20次/分钟/用户 |
| AI OCR 识别 | 10次/分钟/用户 |
| AI 对话 / 分析 | 20次/分钟/用户 |
| 普通查询接口 | 100次/分钟/用户 |
| 导出接口 | 5次/分钟/用户 |
| AI 提供商测试 | 5次/分钟/用户 |
