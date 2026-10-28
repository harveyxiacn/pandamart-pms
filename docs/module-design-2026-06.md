# PandaMart PMS 功能模块详细设计（2026-06）

> 日期：2026-06-03
> 配套文档：`docs/optimization-report-2026-06.md`（发现编号 SEC/ARC/PERF/FE/TEST/PRD/DATA/OPS 在本文引用）
> 原则：小步重构、不重写系统；权限边界不可回退；先基础设施后扩展
> 技术栈：React 18 + Vite + TS + Tailwind + Recharts + zustand；Express + TS + Knex + MariaDB；OpenAI 兼容 AI 抽象

---

## 1. 设计目标

1. 统一三处易错的横切关注点：**库存写入原语**、**错误处理契约**、**生产环境校验**。
2. 修复直接违反 PRD 财务隔离的两处泄露（SEC‑1 `/uploads`、SEC‑2 销售成本价）。
3. 补齐"看似实现实则死代码"的功能（产品图片、条码查询）。
4. 为产品化 Phase 3（价格趋势、批量发票、采购订单、条码快速操作）提供可落地的数据模型与 API 设计。
5. 所有金额/库存/权限改动配套单测。

---

## 2. 总体架构

### 2.1 分层与约定

```
client (React SPA, 同源 /api/v1)
  pages/        路由级页面（懒加载）
  components/   ui 原子组件 + layout
  api/          axios 封装（每域一文件）
  store/        zustand（authStore 唯一鉴权来源）
  hooks/        useAuth/usePermission/useDebounce

server (Express)
  routes/       仅做 参数解析 → 调 service → 统一返回；错误交给 asyncHandler
  services/     业务逻辑 + 事务；所有库存写经 adjustStockTx
  models/       Knex 数据访问（对象字面量）
  middleware/   auth/permission/validator/upload/rateLimit/errorHandler
  config/       env/database/cors/store
  database/     migrations(021+)/seeds
```

**约定（目标态）**：
- 路由不再写 `try/catch`；统一 `asyncHandler(fn)` → `next(err)` → 集中 `errorHandler`（ARC‑1/3）。
- 任何 `inventory`/`inventory_logs` 写入只允许经 `adjustStockTx`（ARC‑2/DATA‑2/3/8）。
- 金额一律 `DECIMAL(12,2)`，JS 侧 `Math.round(x*100)/100`；服务端校验 `Number.isFinite && >=0`（SEC‑6）。
- 新端点必须在权限矩阵（§8）登记 admin/staff 行为。

### 2.2 权限模型（不变）

`requireRole(...roles)` → `adminOnly` / `allRoles`。Staff 仅限一线操作；**绝不可见**历史进价、成本价、供应商累计额、分析财务、应付、导出、设置、用户管理。新端点默认 `adminOnly`，除非明确属于一线流程。

---

## 3. 统一基础设施设计（P0 核心）

### 3.1 库存写入原语统一（ARC‑2 / DATA‑2 / DATA‑3 / DATA‑8）

**现状**：四套写法并存——`adjustStockTx`（正确，带 `forUpdate`+`store_id`）、发票 `confirm`/`rollbackConfirm`（手写无锁无 store_id）、`InventoryModel.adjustQuantity/setQuantity`（无事务）。

**目标**：唯一入口 `adjustStockTx(trx, opts)`。

- `inventory.service.confirm` 的库存自增改为：
  ```ts
  await adjustStockTx(trx, { productId, storeId: DEFAULT_STORE_ID, delta: item.quantity,
    type: 'in', invoiceId: id, userId, unit: item.unit });
  ```
  随后单独 update `last_restock_date/quantity`（非库存数量字段，保留）。
- `rollbackConfirm` 改为 `delta: -qty, type: 'adjust', reason: 'rollback_confirm'`，经 `adjustStockTx`（自带 store_id + 行锁）。
- `inventoryService.adjust/stocktake` 包入 `db.transaction` 并改用 `adjustStockTx`；`InventoryModel.adjustQuantity/setQuantity` 标记弃用。
- **符号约定**统一为：`inventory_logs.quantity = 有符号增量(after-before)`。`adjustStockTx` 改存有符号 `delta`（当前存绝对值），消费侧 `analytics` 的 `ABS()` 仍兼容。新增迁移注释记录约定（数据无需回填，`quantity_before/after` 为权威）。
- `InventoryRow` 类型补 `store_id`（类型与 schema 对齐）。

**风险控制**：该改动触及核心入库路径，必须配 §9 的 `adjustStockTx` 三分支 + 发票 confirm 集成测试，部署前本地实测一遍真实入库/回滚/销售/作废。

### 3.2 错误处理契约统一（ARC‑1 / ARC‑3）— 列为 P2

引入 `asyncHandler`，逐个 route 文件迁移；`errorHandler` 扩展为统一处理 `AppError`、Multer、DB‑down→503、`ER_DUP_ENTRY`→409、未知→500（**永不回传原始 `err.message`**）。本期先做 **`ER_DUP_ENTRY`→409 映射**（DATA‑4，S 工时，低风险），全量 `asyncHandler` 迁移放 P2 单独 PR 以控制 diff。

### 3.3 生产环境校验与生命周期（OPS‑1 / OPS‑5 / OPS‑6 / SEC‑4）

- `config/env.ts`：
  - `JWT_SECRET` 强制 ≥32 位（仿 `AI_ENCRYPTION_KEY`，启动即失败）。
  - `production` 下 `requireEnv('DB_PASSWORD')` 与真实 `DB_NAME`；`DB_USER==='root'` 或 `CORS_ORIGIN` 指向 localhost 时告警。
  - `parseInt` 加 `Number.isFinite` 兜底。
- `index.ts`：
  - `SIGTERM/SIGINT` → `server.close()` → 等待在途（~12s 超时）→ `db.destroy()` → `exit(0)`。
  - `uncaughtException`/`unhandledRejection` → 结构化日志 + 退出（交 systemd 重启）。
- systemd `TimeoutStopSec` 略大于优雅停机超时（运维侧，文档化）。

### 3.4 OCR/图像内存与并发（OPS‑3 / PERF‑1）

- 启动时 `sharp.concurrency(1)` + `sharp.cache({ memory: 64 })`。
- OCR 处理加进程内信号量（并发上限 1–2），超出排队；降低 `RATE_LIMIT_OCR_MAX`。
- **完整异步队列**（创建 `processing` 发票即返回 + 前端轮询）属 Phase 3.1，本期先做并发上限的"软保护"。

### 3.5 安全基线（SEC‑1 / SEC‑2 / SEC‑8）

- 移除 `app.use('/uploads', express.static(...))`；所有发票文件经现有鉴权路由 `GET /invoices/:id/file`（已含防穿越）。产品图片新增鉴权读取路由（§5.1）。
- 销售 service 增 `viewerRole`，staff 响应剥离 `costPrice`（§4.5）。
- 补审计：AI provider 删除/设默认、自助改密。

---

## 4. 现有业务模块设计

> 每模块：职责 / 数据 / 关键 API / 权限 / 本期改动。未列"本期改动"者保持现状。

### 4.1 认证与用户（auth / user）
- 职责：登录（JWT 24h、bcrypt cost12、登录锁定 5/15min）、改密、用户 CRUD。
- 本期改动：`JWT_SECRET` 强度校验（SEC‑4）；自助改密补审计（SEC‑8）。Token 失效机制（`token_version`，SEC‑5）列 P2。

### 4.2 发票 OCR 与入库（invoice / ocr）
- 职责：上传 → OCR（PDF文本/Vision/Excel）→ 校对 → 确认入库（建产品、扣价、写库存、价格告警）。
- 权限：Staff 可上传 + 处理待确认发票；确认后不可访问（`getById` 对 staff 非 pending 抛 403）；价格告警对 staff 置空。
- 本期改动：
  - **入库/回滚统一走 `adjustStockTx`**（§3.1）。
  - **发票查重（DATA‑1）**：`confirm` 前若存在同 `supplier_id + invoice_number` 的 `confirmed` 发票（排除自身）→ 抛 `DUPLICATE_INVOICE`（422，前端确认页明显提示）。
  - OCR 并发上限（§3.4）。
- 列 P2/P3：异步队列（PERF‑1）、`ocr.service` 拆分（ARC‑5）、`InvoiceListPage` 拆分（FE‑3）。

### 4.3 产品（product）
- 职责：CRUD、Excel 导入、价格历史、`default_price`（成本，仅 admin）/`selling_price`（售价，staff 可见）。
- 本期改动：
  - **图片上传接线**（§5.1，PRD 缺口）。
  - **条码字段 + 查询**（§5.2 基础，PRD 缺口）。
  - `products.barcode` 加索引（PERF‑6）。
- 列 P2：价格历史加 `months/supplierId/groupBy` + 折线图（§5.3）。

### 4.4 库存（inventory）
- 职责：列表、手动 adjust/out/stocktake（admin）、安全库存、日志、低库存预警。
- 本期改动：`adjust/stocktake` 改用 `adjustStockTx`（§3.1）。

### 4.5 销售出库（sales）
- 职责：收银下单（事务内行锁扣减，防超卖）、列表、详情、作废回补。
- 权限：create/list/get 全角色（Staff 收银）；void 仅 admin。
- 本期改动（SEC‑2）：`getById(id, viewerRole)` / `list(filters, viewerRole)` 增参；`viewerRole==='staff'` 时响应 `items[].costPrice` 置 `undefined`/剔除；`create` 传入调用者角色。`sales.routes` 从 `req.user.role` 传参。
- 本期改动（SEC‑6）：每行 `Number.isFinite(unitPrice) && unitPrice>=0 && quantity>0` 服务端校验。

### 4.6 批次保质期（batch）
- 职责：收货入批次、报损 dispose、临期/过期汇总。
- 现状已知缺口：销售不扣批次→批量与 `inventory.quantity` 漂移（DATA‑5）。
- 本期：仅文档标注"批次为顾问性"；**FIFO 扣减列 P3**（需在 sales 事务内按 FIFO 扣最旧未过期批次）。

### 4.7 应付账款（payables）
- 职责：应付=已确认发票 grand_total − 已付；供应商汇总/明细/记录付款（admin）。
- 本期：受益于 DATA‑1（查重）避免重复发票虚增应付；可选补 `invoices(supplier_id,status)` 索引（PERF‑8，低优先）。

### 4.8 供应商 / 分类（supplier / category）
- 职责：CRUD（软删除）、模板成功计数、多级分类树。
- 本期改动：`ER_DUP_ENTRY`→409（DATA‑4）覆盖 `suppliers.code`/`products.sku` 软删后复用。
- 列 P3：供应商价格对比、评分（PRD 缺失/后期）。

### 4.9 分析（analytics）
- 职责：仪表盘、采购趋势、畅销/滞销、价格变化、供应商/分类分布、补货建议、毛利、滞销。
- 本期改动：补 `sales_orders(status,created_at)` 索引（PERF‑7）。
- 列 P2：TTL 缓存（PERF‑4）；`getPriceChanges` 应用日期边界（PERF‑5）；价格趋势时间序列（§5.3）。

### 4.10 AI 对话 / 洞察（ai-chat / ai-insight / llm）
- 职责：8 工具 Function Calling（≤5 轮）、洞察/异常、LLM 抽象（退避重试、vision 不重试）。
- 本期改动：会话淘汰改 `lastAccessedAt` + Map 容量上限（ARC‑9，低优先，可纳入本期）。

### 4.11 通知 / 设置 / AI 提供商 / 导出 / 审计
- 通知：站内 + 邮件（受设置+SMTP 控制）。
- 设置：数值/开关项已实现；"发票模板管理" UI 列 P3（与模板记忆接线一并）。
- AI 提供商：多提供商 CRUD/测试/设默认；本期补删除&设默认审计（SEC‑8）。
- 导出：本期可选去掉 full-backup 的 `null,2` 美化（PERF‑12）；**补全表/改名**列 P2（PRD 数据备份缺口）。
- 审计：保持；新写操作均需登记。

---

## 5. 新增模块详细设计

### 5.1 产品图片上传（P1，PRD §2.2.1）

- 数据：复用 `products.image_url`（004 已有）。
- 后端：
  - 路由 `POST /api/v1/products/:id/image`（adminOnly，`uploadProduct.single('file')`，已配 JPG/PNG/5MB/`products/yyyy/mm`）。
  - service：写 `image_url=相对路径`，审计 `update_product_image`。
  - 读取：`GET /api/v1/products/:id/image` 鉴权返回文件（或复用受控静态）。
- 前端：ProductsPage 编辑弹窗加选图 + 预览（替换/清除）。
- 权限：上传 admin；查看全角色。

### 5.2 条码与移动端快速出入库（P1 基础 + P3 页面，PRD §2.2.1/§4.5）

- 本期（P1，基础）：
  - `products.barcode` 加（唯一）索引（迁移 021）。
  - `ProductModel.findByBarcode(barcode)`；路由 `GET /api/v1/products/by-barcode/:code`（allRoles，返回 staff 脱敏后的产品）。
  - ProductsPage 表单加 `barcode` 字段。
- 后续（P3，移动页）：移动优先"快速操作"页，扫码（评估 `html5-qrcode`）→ 查产品 → 快速入库/出库/报损（写 `inventory_logs`+审计，经 `adjustStockTx`）。Staff 限快速出库/销售；手动调整仍 admin。

### 5.3 价格趋势与异常（P2，PRD §2.3.3）

- 后端：`GET /products/:id/price-history` 扩展 `months`/`supplierId`/`groupBy=invoice|month`；返回时间序列点 `{date, unitPrice, supplierName}`。`analytics` 增"近期异常涨价"面板数据（保留 `getPriceChanges` 作简单告警）。
- 前端：产品页价格历史改 Recharts 折线图，异常点（超阈值）变色标注；分析页加异常涨价列表。
- 权限：admin only（Staff 不可见进价历史）。

### 5.4 批量发票上传队列（P3，产品化 Phase 3.1）

- 数据（迁移）：`invoice_upload_tasks(id, batch_id, file_path, file_name, status[queued|processing|done|failed], invoice_id, error, store_id, created_by, created_at, updated_at)`。
- 后端：`POST /invoices/upload-batch`（多文件，仅建 task 即返回）；进程内串行 worker 逐个跑 OCR→建发票→更新 task；启动时恢复 `queued`/超时 `processing`。`GET /invoices/upload-tasks?batchId=` 轮询。
- 前端：InvoiceScanPage 支持多文件 + 批量进度/错误/生成发票入口。
- 权限：Admin/Staff 可上传；Staff 仅继续处理其权限内的待处理发票。

### 5.5 采购订单草稿（P3，产品化 Phase 3.4）

- 数据（迁移）：`purchase_orders(id, po_no, supplier_id, status[draft|sent|received|cancelled], total_est, note, store_id, created_by, ...)`、`purchase_order_items(id, po_id, product_id, quantity, unit, est_price, ...)`。
- 后端：从补货建议按供应商生成草稿；状态机；收货时可关联发票，形成 建议→订单→发票→入库 闭环。
- 前端：PurchaseOrdersPage（草稿列表/详情/状态流转）。
- 权限：Admin only。

### 5.6 供应商价格对比 / 评分（P3，PRD §2.3.3/§2.5 后期）

- 价格对比：`GET /analytics/price-compare?productId=` 同产品跨供应商最近价。
- 评分：由现有数据派生（供货周期稳定性、相对品类均价竞争力），无需新采集。

---

## 6. 数据模型变更汇总

| 迁移 | 内容 | 关联 |
|---|---|---|
| 021 | `products.barcode` 唯一索引；`sales_orders(status,created_at)` 复合索引；（注释固化 `inventory_logs.quantity` 符号约定） | PERF‑6/7, DATA‑3, §5.2 |
| 022（P3） | `invoice_upload_tasks` 表 | §5.4 |
| 023（P3） | `purchase_orders` / `purchase_order_items` 表 | §5.5 |
| 类型 | `InventoryRow` 补 `store_id` | DATA‑2 |

> 本期（P0+P1）仅落地迁移 021；022/023 随 Phase 3 排期。

---

## 7. API 变更汇总（本期）

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| — | 移除 `/uploads` 公开静态 | — | SEC‑1，改走鉴权路由 |
| POST | `/products/:id/image` | admin | 上传产品图片 |
| GET | `/products/:id/image` | all | 读取产品图片（鉴权） |
| GET | `/products/by-barcode/:code` | all | 条码查产品（staff 脱敏） |
| GET/POST | `/sales*` | all（含 viewerRole 脱敏） | 响应对 staff 剔除 costPrice |
| POST | `/invoices/:id/confirm` | all | 增发票查重拦截 |

---

## 8. 权限矩阵（含新端点）

| 能力 | Admin | Staff |
|---|:-:|:-:|
| 上传/处理待确认发票 | ✅ | ✅ |
| 确认入库 | ✅ | ✅ |
| 发票成本/价格告警 | ✅ | ❌（置空） |
| 销售下单/查看 | ✅ | ✅（无 costPrice） |
| 销售作废 | ✅ | ❌ |
| 条码查产品 | ✅ | ✅（脱敏） |
| 产品图片上传 | ✅ | ❌ |
| 手动库存调整/盘点 | ✅ | ❌ |
| 价格趋势/分析/应付/导出/设置/用户 | ✅ | ❌ |

---

## 9. 测试设计

| 用例 | 类型 | 覆盖发现 |
|---|---|---|
| `adjustStockTx`：preventNegative 抛 INSUFFICIENT_STOCK 并回滚 | 单元/集成 | TEST‑2 |
| `adjustStockTx`：clampToZero 扣到 0 且 loggedQty=before | 单元/集成 | TEST‑2 |
| `adjustStockTx`：正常增减 quantity_before/after 正确 | 单元/集成 | TEST‑2 |
| 发票 confirm：库存按数量自增、写日志、更新 default_price | 集成 | TEST‑3 |
| 发票查重：同供应商+号已确认时拦截 | 集成 | DATA‑1 |
| 销售：line/total 取整（如 3×3.335）；staff 响应无 costPrice | 单元 | TEST‑4, SEC‑2 |
| 应付：billed/paid/outstanding 取整、超付为负 | 单元 | TEST‑4 |
| `redactProductPrice`：移除两种键、不误删其他 | 单元 | TEST‑5 |
| env 校验：弱 JWT_SECRET / 缺 DB_PASSWORD 启动失败 | 单元 | SEC‑4, OPS‑6 |

> 纯函数优先抽出可测；DB 相关用一次性事务回滚或 CI MariaDB（CI 列 P2）。

---

## 10. 实施与部署计划

**本期（P0 + 安全 P1，建议部署）**：
1. 前端 lint error 修复 + token 单一来源（FE‑1）+ 防抖（FE‑2）。
2. 安全：移除 `/uploads` 公开挂载；销售 costPrice 脱敏；JWT/DB env 校验；补审计。
3. 正确性：库存写统一 `adjustStockTx`（confirm/rollback/adjust/stocktake）；发票查重；`ER_DUP_ENTRY`→409。
4. 运维：优雅停机 + 进程异常守卫；sharp 并发/缓存上限。
5. 性能：`compression` 中间件；迁移 021 索引。
6. 功能：产品图片上传；条码字段 + 查询。
7. 测试：§9 核心用例；`tsc`+`eslint`(前端0err)+`prettier`+前后端 `vitest` 全绿。

**后续迭代（P2/P3）**：asyncHandler 全量迁移、CSP、token 失效、分析缓存、价格趋势图、批量发票队列、采购订单、FIFO 批次、OCR/页面拆分、CI、备份脚本与真实运维手册入库。

**部署**：构建 → 打包 server/（排除 node_modules/dist/uploads/.env）→ scp 到目标主机 → `npm ci && npm run build && npm run migrate` → `systemctl restart pandamart`。注意 fail2ban：放慢连接节奏；确认 devDeps 在位（迁移依赖 tsx）。部署前与用户确认；部署后 `/health`+`/ready`+关键页面 smoke。详见 [[deployment-vps]]。
