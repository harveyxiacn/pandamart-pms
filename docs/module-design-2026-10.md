# PandaMart PMS 模块设计与优化（2026-10）

> 日期：2026-10-15
> 前序文档：`docs/module-design-2026-06.md`、`docs/optimization-report-2026-06.md`
> 本轮定位：**补齐两个"设计过但从未真正可用"的模块**（批次 FIFO、供应商模板/别名），并**修掉一批静默失效的真实缺陷**。
> 原则：不重写系统；所有库存/批次写入仍只经 `adjustStockTx`；金额与数量服务端校验；纯逻辑抽成纯函数以便单测。

---

## 0. 本轮背景与选题依据

2026-10 对前后端各做一次完整通读式审计，发现前几轮"已完成"的清单里有若干**看着实现、实则未接线**的模块，以及一类**静默失效**的前端缺陷。本轮按"影响面 × 修复确定性"排序，选取以下工作：

| 编号 | 问题 | 类别 | 严重度 |
|---|---|---|---|
| A-1 | `inventory_batches` 只被手动批次收货/报损读写；**销售不扣批次、发票确认不建批次** → 批次台账与库存长期漂移，临期预警失真 | 未完成模块 | 高 |
| A-2 | `supplier_templates` 整条链路是死代码：表 + model + `template.service` 无任何调用方，`incrementSuccess` 对永远为空的表做 UPDATE | 死代码/未完成模块 | 高 |
| A-3 | 服务端 `pageSize` 上限 100，前端多处请求 200/500/1000 且无分页 → **盘点只盘前 100 个商品、收银/批次选品只能选前 100 个商品**、发票列表只显示前 100 张 | 静默失效 | 高 |
| A-4 | 产品页"导出"用原生 `<a href>`（不带 Authorization 头）→ 点开是 401 JSON | 功能坏 | 中 |
| A-5 | Header 全局搜索框对店员可见，但后端 `/analytics/search` 为 adminOnly → 店员看到空下拉 | 权限/体验 | 中 |
| A-6 | Header 搜索结果跳 `/products?id=`、`/suppliers?id=`，但两页都不读 query → 深链是死的 | 半接线 | 中 |
| A-7 | 移动端"更多"菜单只覆盖 5 个路由，admin 有 7 个页面在移动端不可达 | 半接线 | 中 |
| A-8 | `/ai/reorder-advice?categoryId=` 恒空（`getReorderSuggestions` 从不返回 `categoryId`，`===` 比较恒 false） | 逻辑 bug | 中 |
| A-9 | 9 个路由文件用裸 `sendError(500, err.message)`：泄露原始错误、AppError 状态码被吞成 500、DB 故障不映射 503 | 健壮性/安全 | 中 |
| A-10 | 发票到期日按 `toISOString()` 计算 → 在 UTC+8 等时区**错位一天** | 逻辑 bug | 中 |
| A-11 | `getExpiringSummary` 无界返回；`recordPayment` 不校验关联发票归属 | 健壮性 | 低-中 |
| A-12 | e2e 脚本滞后于上一轮 token_version 改动（断言 403，实际 401 TOKEN_REVOKED） | 测试债 | 中 |

---

## 1. 模块一：销售 FIFO 批次扣减（A-1）

### 1.1 现状与目标

迁移 019 的注释即写明"销售按 FIFO 扣批次为后续增强项"。现状：

- `inventory.quantity` 是库存总量权威；`inventory_batches` 是保质期台账。
- 写入批次的只有 `batch.service.create`（+）与 `dispose`（−）；**销售/发票/作废都不碰批次**。
- 结果：批次剩余量合计 ≠ 库存总量，`/batches/expiring` 与仪表盘"临期批次"只反映手工录入的批次。

目标：让"批次合计 = 库存总量"成为可维护的不变量，并让临期预警反映真实在库。

### 1.2 算法：FIFO 分配（纯函数）

`server/src/services/batch-fifo.ts`

```
planFifoAllocation(batches, requested, today) -> { allocations: [{batchId, quantity}], unallocated }
```

选择顺序（升序 = 越靠前越先被消耗）：

1. **未过期优先于已过期**（过期批次仍可被消耗，但只在正常批次耗尽后 —— 既优先卖可售商品，又不人为制造台账漂移）；
2. 到期日升序，`null`（无到期日）排最后；
3. 收货日升序，`null` 排最后；
4. 批次 `id` 升序（稳定排序，保证可复现）。

不变量：`Σ allocations.quantity + unallocated === min(requested, 可用总量)`。库存总量仍以 `inventory.quantity` 为准，**批次不足以覆盖时不报错**，余量计入 `unallocated` 并记 warn 日志，不阻塞销售。

日期一律走 `toDateKey()`（本地日历日），规避 `toISOString()` 的 UTC 位移（见 A-10）。

### 1.3 数据模型

迁移 **023**：

- `sales_item_batches(id, sales_item_id → sales_items CASCADE, batch_id → inventory_batches SET NULL, quantity, created_at)`：记录每条销售明细消耗了哪些批次、各多少。作废销售单时据此**精确回补到原批次**（而非盲目加回某个批次）；批次行被清理时 `SET NULL` 保留扣减历史。
- `inventory_batches(product_id, store_id, status, expiry_date)` 复合索引 `idx_batches_fifo`：支撑 FIFO 选取按「同商品同门店 + active + 到期日升序」加锁读。

### 1.4 接线

| 位置 | 行为 |
|---|---|
| `sales.service.create` | 插入 `sales_items` 拿到 `salesItemId` → `adjustStockTx` 扣库存 → `deductBatchesFifo` 按 FIFO 扣批次并写 `sales_item_batches`（无批次商品为空操作，行为不变） |
| `sales.service.void` | 每条明细 `adjustStockTx` 回补库存后，`restoreBatchesForSalesItem` 把该明细消耗的批次量加回原批次；`depleted → active`，`disposed` 保持原状（物理已报废） |
| `invoice.service.confirm` | 库存自增后，对**生鲜商品（`is_perishable`）**调 `receiveInvoiceBatchTx` 按「发票日 + `shelf_life_days`」自动建批（`invoice_id` 溯源）。非生鲜不建批（无需保质期跟踪） |
| `invoice.service.rollbackConfirm` | `removeInvoiceBatchesTx` 删除该发票自动建立的批次，避免回滚后台账残留 |
| `batch.service.create` | 补齐此前从未写入的 `invoice_id` 溯源字段 |

> 设计取舍：只对 `is_perishable` 商品自动建批。理由是批次表的语义是"保质期台账"，给所有非生鲜商品建空批次只会污染 UI 与数据；非生鲜库存以 `inventory.quantity` 为准，本就不需要 FIFO。

### 1.5 测试

- 单测（`batch-fifo.test.ts`，13 例）：`toDateKey` 归一化、FIFO 排序、过期后置、跨批次部分分配、余量守恒、零/负数量、空批次、稳定排序。
- 端到端（`e2e-db-test.ts` 新增 `runBatchFifoFlow`，`E2E_BATCH_FIFO_TEST=true`）：真实 MySQL 上验证
  发票确认自动建批（数量/到期日）→ 手工批次先到期 → 销售 8 件先扣空早到期批次（`depleted`）再扣自动批次 → **每步断言「批次合计 = 库存总量」** → 作废精确回补 → 回滚清理自动批次。

---

## 2. 模块二：供应商商品别名学习（A-2，替代死掉的 supplier_templates）

### 2.1 问题

OCR 把发票行与系统商品关联只做**模糊名称匹配**（`ocr.service.findBestMatch`，编辑距离式的包含匹配），对新供应商/新写法命中率低；而人在"发票确认"环节手动修正商品归属后，**这份知识被直接丢弃**，下一张同一供应商的发票仍需重新猜。

原 `supplier_templates` 设计的是"正则模板"，但代码自身注释即承认只能抽头部信息、明细仍需 LLM —— 即模板解决不了问题；且它从未被接线。

### 2.2 方案：把人工确认当作标注，学习别名映射

**数据模型**（迁移 024）`supplier_product_aliases`：

```
id, supplier_id → suppliers CASCADE,
alias_type ENUM('barcode','code','name'), alias_key VARCHAR(160),
product_id → products CASCADE, hits INT, created_at, updated_at
UNIQUE(supplier_id, alias_type, alias_key)
```

同表迁移中 **删除 `supplier_templates`**（该表从未被任何流程写入，属可证明的空表）。

**键归一化**（纯函数 `normalizeAliasKey`）：

- `barcode`：仅保留数字，长度须 8–16（8 位以下视为误抓）；
- `code`：去空白、大写，长度 ≥ 3；
- `name`：去除所有非字母数字（保留中日韩），小写，长度 ≥ 2（中文名常为 2 字，如「绍菜」）。

**候选派生**（纯函数 `deriveAliasCandidates`）：从一条明细派生 `barcode(product_number)`、`code(product_code)`、`name(product_name_en)`、`name(product_name_zh)`，按类型去重。

**学习**（`aliasService.learnFromConfirm`）：发票确认时，把每条明细最终归属的 `productId` 与其原始字段写为映射；重复命中走 `ON DUPLICATE KEY UPDATE` 累加 `hits` 并覆盖 `product_id`（人工修正可覆盖旧映射）。学习在事务外执行且失败不影响确认结果。

**应用**（`ocr.service.matchProducts(items, supplierId)`，三级瀑布）：

1. **已学习别名**（`barcode > code > name`，同类型取 `hits` 高者）→ `confidence 0.99`；
2. **条码精确命中** `ProductModel.findByBarcode` → `confidence 0.95`（覆盖首次出现、尚未学习的条码）；
3. **名称模糊匹配**兜底（原逻辑）。

为此把 `processFile` 中"解析供应商"提前到"匹配商品"之前 —— 这是别名匹配能用上 `supplierId` 的前提。

**API**：`GET /api/v1/product-aliases?supplierId=`、`DELETE /api/v1/product-aliases/:id`（均 adminOnly，删除写审计）。
**UI**：设置页新增「OCR 商品匹配学习」卡片，展示 供应商 / 字段类型 / 原始值 / 匹配商品 / 命中次数，支持删除误学习项。

### 2.3 测试

- 单测（`alias.service.test.ts`，9 例）：三类键归一化边界、候选派生去重、空值处理。
- 端到端：`runBatchFifoFlow` 内顺带验证 —— 确认发票后 `GET /product-aliases` 出现该商品的 `code`/`name` 映射；`aliasService.lookup` 用**完全不同的名称**但相同货号回查，仍命中（证明货号优先级生效）。

---

## 3. 前端静默截断修复（A-3）

### 3.1 根因

服务端 `parsePagination` 把 `pageSize` 钳到 ≤ 100。前端多处 `getProducts({ pageSize: 1000 })` 之类请求 + 无分页 UI → 静默只拿到前 100 条。盘点页 `pageSize: 500` 意味着**超过 100 个商品时盘点会漏盘**。

### 3.2 方案

1. 新增 `client/src/api/pagination.ts` 的 `fetchAllPages(fetchPage, {pageSize, maxPages})`：逐页拉取直至最后一页/不足一页/达 `maxPages` 上限（防服务端分页异常死循环）。
2. 提供 `getAllProducts / getAllSuppliers / getAllInventory` 便捷封装。
3. **选择器/盘点**（需要完整集合）改用跨页拉全：SalesPage、BatchesPage、StocktakePage、ExportPage、InvoiceScanPage、ProductsPage 供应商下拉、InvoiceListPage 供应商下拉。
4. **列表页**接入真实分页（`<Pagination>`）：Products、Inventory、Suppliers、InvoiceList、Batches、Notifications（关键词/筛选变化回到第 1 页）。

---

## 4. 其余修复（A-4 ~ A-12）

| 项 | 修复 |
|---|---|
| A-4 | 产品导出改走 `exportProducts()`（axios + blob + Authorization），替换原生 `<a href>` |
| A-5 | Header 搜索框按 `isAdmin` 渲染；店员不显示（与后端 adminOnly 一致） |
| A-6 | ProductsPage/SuppliersPage 读取 `?id=` 深链并打开对应编辑/详情（`getProductById`/`getSupplierById`），打开后清 URL 参数 |
| A-7 | MobileNav「更多」补齐 批次/盘点/应付/AI/导出/审计/用户 7 个入口，并修正产品/供应商图标重复 |
| A-8 | `getReorderSuggestions` 返回 `categoryId`；`getReorderAdvice` 改为数值比较（兼容字符串入参） |
| A-9 | 9 个路由文件的裸 `sendError(500, err.message)` 统一为 `sendRouteError`（AppError 状态码透传 + DB→503 + 未知错误落日志） |
| A-10 | 批次到期日/收货日/临期汇总统一用本地日历日 `toDateKey()` |
| A-11 | `getExpiringSummary` 加 `LIMIT`（默认 200，上限 500）；`recordPayment` 校验关联发票存在且归属该供应商 |
| A-12 | e2e 的降权 token 断言放宽为「401 TOKEN_REVOKED 或 403 且 success=false」 |

前端同时补齐：UsersPage / AiAssistantPage / NotificationsPage / InventoryPage(日志) 的错误捕获与提示；Dashboard / Analytics / Stocktake / Users / AuditLogs / Notifications 的失败重试。

---

## 5. 数据模型变更汇总

| 迁移 | 内容 |
|---|---|
| 023 | 新建 `sales_item_batches`；`inventory_batches` 加 `idx_batches_fifo` |
| 024 | 新建 `supplier_product_aliases`；**删除死表 `supplier_templates`**（down 忠实还原） |

迁移基线：**024**（batch 9）。生产原为 batch 7 / 022。

---

## 6. 测试与验证

| 层面 | 内容 |
|---|---|
| 后端单测 | 63 通过（新增 `batch-fifo.test.ts` 13、`alias.service.test.ts` 9） |
| 前端单测 | 23 通过（新增 `api/__tests__/pagination.test.ts` 5；修正 InvoiceList/Products 既有测试以适配分页与 Router） |
| 类型检查 | server/client `tsc --noEmit` 均 0 错 |
| Lint | 两侧 0 error（保留既有 `any` warning） |
| 构建 | 两侧 `npm run build` 均通过 |
| 端到端 | 本地真实 MySQL（migration 024）跑通：只读链路 / 财务可见性边界 / 安全加固回归 / 批次 FIFO / 别名学习，全绿 |

---

## 7. 部署

沿用既有流程（见 `docs/deployment.md` 与 [[deployment-vps]]）：本地 `npm run build`（client 输出到 `server/public`）→ 打包 `server/`（排除 node_modules/dist/uploads/.env）→ scp → `npm ci && npm run build && npm run migrate`（**会执行 023/024**）→ `chown www-data` → `systemctl restart pandamart`。
注意 fail2ban：放慢连接节奏；确认 devDeps 在位（迁移依赖 tsx）。

---

## 8. 遗留 backlog（本轮未做）

- 采购订单（PO）预订单工作流（`module-design-2026-06` §5.5）
- 批量发票上传异步队列（§5.4）
- 扫码快速出入库移动页（§5.2 的 P3 部分）
- 供应商价格对比 / 供应商评分（§5.6）
- CSP 启用（当前 `contentSecurityPolicy: false`，需按 SPA 实际资源定制 directives）
- `asyncHandler` 全量迁移 + 集中 errorHandler（当前仍是各路由 try/catch + `sendRouteError`）
- 分类管理 UI（后端 CRUD 已就绪，前端仍无页面）
- 前后端既有 `any` 类型债收敛、`npm run format:check` 全仓格式化
- `docs/api-design.md` 仍停留在 016 之前，未覆盖销售(017)/批次(019)/应付(020)/条码(021)/别名(024) 等新端点，需一轮补齐

---

## 9. 2026-10-30 增补：本地智能助手（迁移 025）

### 9.1 设计约束

- **默认零外部依赖**：新安装、离线 VPS、未配置 API Key 时，助手必须可用且不产生费用。
- **答案必须可核对**：本地模式只从数据库聚合，不做生成式推断；每个回答带 `intent / sources / windowDays / snapshotAt`。
- **LLM 可选但不降级安全**：LLM 失败自动回退本地，响应注明 `fallback.reason`；LLM 密钥仍只在服务端解密，状态接口只暴露提供商名称与模型。
- **写后即读**：发票确认、销售出库、库存调整、批次操作都调用 `invalidateAnalyticsCache()`，该函数现在同时清 `assistant:` 快照，避免"答的是 60 秒前的库存"。

### 9.2 数据流

```
MySQL ──(并行聚合, 60s TTL)──> knowledge.snapshot
                                   ├─> assistant-engine.parseIntent + composeAnswer ──> /ai/chat (local)
                                   ├─> deriveAlerts ─────────────────────────────────> /ai/alerts
                                   ├─> buildReport ─────────────────────────────────> /ai/report
                                   └─> compactContext ──────────────────────────────> LLM system prompt
```

- 快照包含 1/7/30/90 天四个窗口，问题里的"最近 N 天"就近取窗口并在回答中明确标注实际窗口。
- 商品索引最多 3000 条（含 SKU/条码），用于实体识别；单品详情直接复用索引字段，不再查库。
- 每段聚合独立 `safe()` 回退：批次表/应付表异常只影响对应卡片，不影响问答主体。

### 9.3 引擎能力与边界

- 支持：补货、低库存、临期/过期、销售、毛利、采购、价格波动、供应商、应付、滞销、待确认发票、预警、单品查询、周报/月报。
- 中英文关键词 + n-gram 模糊商品名（中文无需分词依赖）。
- 不承诺：开放式推理、跨表因果分析、未来需求预测。这些仍由 LLM 模式承担；本地模式会明确给出可核对的数字与下一步操作。

### 9.4 前端信息架构

- 主对话区 + 右侧资料库/预警双卡片；底部"经营简报 + 补货清单"。
- 模式切换持久化在 `localStorage`，服务端默认值来自 `assistant_mode`；未配置 LLM 时 LLM 选项禁用。
- 资料库面板展示快照时间、六项关键指标、销售/采购窗口、补货 TOP 3；刷新按钮传 `refresh=1`。

### 9.5 公开演示

`client/src/demo/assistant.ts` 在浏览器内用同一套意图与答案结构复刻本地助手，读取 `localStorage` 演示数据集。GitHub Pages 上 `/ai/knowledge`、`/ai/alerts`、`/ai/report`、`/ai/chat` 均由该模块响应；`mode=llm` 返回明确的降级提示，避免演示环境伪装成有 LLM。

---

## 10. 2026-10-30 增补：本地发票 OCR 插件（迁移 026）

### 10.1 目标与非目标

- **目标**：未配置任何 AI API 时，PDF/图片发票仍能识别出供应商、单号、日期、明细和金额，并写入 `invoices / invoice_items`。
- **非目标**：不训练自有 OCR 模型，不做版式生成式理解；复杂手写发票仍建议人工核对或使用 LLM。
- **约束**：生产 VPS 961MB 内存，不能把 OCR 运行时塞进 Node 进程；部署必须可回滚、可缺省。

### 10.2 分层

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 引擎层 | `ocr/tesseract.provider.ts` | 调用 Tesseract / pdftoppm，输出 `OcrDocument`（文字+坐标+置信度） |
| 解析层 | `ocr/invoice-parser.ts` | 纯函数：表头/明细/金额/供应商/日期，输出 `OcrRecognizedResult` + 置信度 + warnings |
| 编排层 | `services/ocr.service.ts` | 模式选择、LLM 兜底、供应商与商品匹配、落库 |
| 展示层 | 上传页 / 设置页 / `GET /invoices/ocr/status` | 模式配置、引擎状态、置信度与警告 |

引擎可替换：解析层只依赖 `OcrDocument`，接 PaddleOCR/RapidOCR 时只需新增一个 provider。

### 10.3 解析策略

1. **不信任表头坐标**：优先用「商品名 + 行尾数字」解析每行；坐标列解析作为交叉校验，仅在列解析得到更多明细时采用。
2. **两行式布局**：名称行先缓存（`pendingDescription`），下一行只有数字时合并。
3. **金额勾稽**：`Σ lineTotal` 与 `Subtotal/Sales Total` 或 `Total - Tax` 比较，容差 max($1, 1%)；不一致写 warning，不阻断入库。
4. **供应商校准**：先用数据库 `suppliers.name` 做规范化包含匹配；匹配成功直接返回库中名称，后续 `SupplierModel.findByName` 与别名学习不受 OCR 错字影响。
5. **置信度**：字段完整度 0.35 + 供应商 0.15 + 单号 0.10 + 日期 0.05 + 总额 0.10 + 勾稽 0.15 + OCR 0.10；低于 0.72（文本）/0.62（OCR）时才考虑 LLM。

### 10.4 模式与降级

- `auto`：本地优先，低置信度且存在 `purpose=ocr` 提供商时调用 LLM；LLM 异常回退本地结果。
- `local`：即使 LLM 已配置也不调用；本地无明细时返回 422 并说明原因。
- `llm`：AI 优先；AI 失败后尝试本地 OCR / 文本解析，避免整单失败。
- 本地引擎不可用且无 LLM：返回 503 `OCR_UNAVAILABLE`，附安装命令，不创建空发票。

### 10.5 安全与运维

- `execFile` 传参、无 shell；临时目录 `mkdtemp` 且 finally 清理；单页 120s 超时、TSV 32MB 上限、扫描 PDF 最多 3 页。
- 语言包缺失自动退回 `eng`；`TESSERACT_BIN/PDFTOPPM_BIN/TESSERACT_LANG/TESSERACT_PSM` 可覆盖。
- 迁移 026 只扩展枚举与 settings，可回滚；回滚时 `local_ocr` 历史行改写为 `text_extract`。
