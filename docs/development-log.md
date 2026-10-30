# PandaMart PMS 开发日志

## 2026-03-05

### 1. 后端集成测试能力完善

- 新增数据库真实链路 E2E 脚本：`server/src/scripts/e2e-db-test.ts`
- 新增脚本命令：`npm run test:e2e`
- 支持配置项：
  - `E2E_RUN_MIGRATIONS`
  - `E2E_RUN_SEEDS`
  - `E2E_WRITE_TEST`
  - `E2E_ADMIN_USERNAME`
  - `E2E_ADMIN_PASSWORD`
- 修复 `knex` 迁移与种子命令在 TypeScript 下无法加载问题，改为 `tsx` 调用 CLI：
  - `npm run migrate`
  - `npm run seed`
  - `npm run migrate:rollback`
- 修复测试进程无法退出问题：`ai-chat.service.ts` 的定时器增加 `unref()`

### 2. 前端项目实现（按文档落地）

- 新建完整前端目录：`client/`
- 技术栈落地：
  - React 18 + TypeScript + Vite
  - TailwindCSS
  - React Router
  - Axios
  - Zustand
  - Recharts
  - Lucide React
- 实现页面与模块：
  - 登录页
  - 仪表盘
  - 发票识别页（上传、校对、确认/驳回）
  - 发票列表与详情
  - 库存管理（调整、安全库存、日志）
  - 产品管理（CRUD、导入、导出、价格历史）
  - 供应商管理（CRUD、详情）
  - 数据分析页（趋势、分布、排行、价格波动、补货建议）
  - AI 助手页（聊天、洞察、订货建议）
  - 系统设置与 AI 提供商管理
  - 用户管理
  - 通知页
  - 盘点页（Stocktake）
  - 审计日志页（Admin）
  - 数据导出页（Admin）
- 实现布局与交互：
  - 桌面侧边栏 + 移动端底部导航
  - 顶栏用户信息、通知入口、退出登录
  - 统一 UI 基础组件（Button/Input/Select/Card/Badge/Modal/Table）
  - 路由级懒加载（按页面拆包）

### 3. 前端测试补齐

- 新增 Vitest 测试体系：
  - `client/vitest.config.ts`
  - `client/src/test/setup.ts`
- 新增单元测试：
  - `formatters.test.ts`
  - `classnames.test.ts`
  - `Button.test.tsx`
- 新增脚本：
  - `npm run test`
  - `npm run test:watch`

### 4. 文档更新

- `README.md`
  - 增加前端启动/构建说明
  - 增加前端测试命令说明
  - 增加后端 E2E 集成测试说明
- `docs/deployment.md`
  - 修正迁移命令为 `npm run migrate` / `npm run seed`
  - 增加 phpMyAdmin 导入后迁移一致性步骤
  - 增加上线后 `npm run test:e2e` 检查项

### 5. 测试记录

- 前端：
  - `cd client && npm run test` ✅ 通过
  - `cd client && npm run build` ✅ 通过
- 后端：
  - `cd server && npm run build` ✅ 通过
  - `cd server && npm run test:e2e`（含 `E2E_WRITE_TEST=true`）✅ 通过
- E2E 测试环境：
  - 本地 Docker MySQL 8.0 临时容器
  - 测试完成后容器已清理

### 6. 问题修复与联调（本轮）

- 修复侧边栏路由高亮冲突：
  - `发票识别(/invoices/scan)` 与 `发票列表(/invoices)` 不再同时高亮
  - 方案：`NavLink` 增加 `end` 精确匹配
  - 新增前端回归测试：`client/src/components/layout/__tests__/Sidebar.test.tsx`
- 完成品牌视觉统一：
  - 接入 Logo：`client/public/logo-300x292.png`
  - 侧边栏、顶栏、登录页统一使用熊猫超市 LOGO
  - 全局主题改为红白主色（Tailwind 主题色、背景渐变、卡片边框等）
- 修复发票上传识别 500：
  - 根因：默认 AI Provider `baseUrl` 未携带 `/v1`，请求落到 `/chat/completions` 返回 404
  - 方案：`llm.service.ts` 增加 Base URL 规范化（优先 OpenAI 兼容 `/v1`）与 404 回退策略
  - 结果：样例发票 `sampleinvoice/dry_goods_invoice.pdf` 上传识别成功，返回结构化明细
- 修复系统设置中 API Key / AI 配置易失败问题：
  - 前端设置页增强错误提示（所有保存/测试/设默认/删除操作增加 `try/catch` 和提示）
  - `thinkingEffort` 改为下拉选项（`xhigh/high/medium/low`），避免枚举值输入错误
  - `maxTokens` 明确为“上下文长度（max tokens）”，默认改为 `32768`（gpt-5.2 + xhigh）
  - 后端 `ai-provider` 路由增加参数校验与 BAD_REQUEST 返回（避免非法参数导致 500）
- 上传兼容性增强：
  - 允许 `application/octet-stream`（在扩展名合法时）通过发票文件上传过滤器

### 7. 全量测试与对接验证（本轮）

- 前端：
  - `cd client && npm run test` ✅ 通过（4 个测试文件，7 个用例）
  - `cd client && npm run build` ✅ 通过
- 后端：
  - `cd server && npm run build` ✅ 通过
  - `cd server && npm run test:e2e`（`E2E_RUN_MIGRATIONS=true E2E_RUN_SEEDS=true E2E_WRITE_TEST=true`）✅ 通过
- 联调冒烟（真实数据库 + 运行中前后端）：
  - 认证：`/auth/login`、`/auth/me` ✅
  - 核心查询：`/categories`、`/suppliers`、`/products`、`/inventory`、`/analytics/dashboard` ✅
  - 设置与 AI Provider：`/settings` 读写、`/ai-providers` 读写、连通测试 ✅
  - 发票链路：`/invoices/upload`（PDF）→ `/invoices/:id` → `/invoices/:id/confirm` ✅
  - AI 功能：`/ai/chat`、`/ai/insights` ✅

### 8. 发票识别字段增强与对照统计（本轮新增）

- 后端 OCR 能力增强：
  - 识别并返回供应商地址与联系方式
  - 识别并返回产品 `Code`、`Number/Barcode`、`UN`、`Tax(E/H)`
  - 识别并返回 `Sales Total`、`Tax Total`、`Total`
  - 新增 PDF 文本规则回填（在 LLM 结果缺失时，从文本二次提取并补齐）
  - Tax 规则：`E=无税`、`H=有税`
- 数据库存储增强：
  - 新增迁移 `014_add_ocr_fields_to_invoice_items.ts`
  - `invoice_items` 新增字段：
    - `raw_product_code`
    - `raw_product_number`
    - `raw_un`
    - `raw_tax_code`
- 前端页面增强：
  - 发票识别页增加字段展示：供应商地址、联系方式、Code、Number、UN、Tax
  - 发票详情页增加对照模块：
    - `Sales Total / Tax Total / Total` 统计值与 OCR 值对照
    - 一致性标识（`一致/不一致`）
  - 发票详情页增加商品统计：
    - 商品总数量
    - 商品种类数
- 验证结果：
  - 样例发票 `sampleinvoice/dry_goods_invoice.pdf` 上传识别成功
  - 示例识别结果：
    - 供应商地址：`375 Edward Ave, Richmond Hill, ON L4C 5E5`
    - 联系方式：`FAX: (905) 780-6616`
    - 首行商品：`Code=YEAAQ10`、`Number=6917790973060`、`UN=EA`、`Tax=E`
    - 合计：`Sales=2207.00`、`Tax=40.30`、`Total=2247.30`

### 9. 发票管理功能与交互优化（本轮新增）

- 新增发票管理 API：
  - `PUT /api/v1/invoices/:id`：修改待处理发票（头信息 + 明细）
  - `DELETE /api/v1/invoices/:id`：删除待处理/已驳回发票（管理员）
  - 保留并接入 `POST /api/v1/invoices/:id/confirm`：确认入库
- 新增后端业务规则：
  - 仅 `pending` 状态允许修改
  - `confirmed` 状态禁止删除
  - 删除时同步清理发票文件（若存在）
  - 写入审计日志：`update_invoice` / `delete_invoice`
- 发票列表页 UI/UX 优化：
  - Modal 全面重构：支持 ESC 关闭、点击遮罩关闭、禁止背景滚动、内容区域独立滚动
  - 详情中明确展示中英文品名（`中文名` + `English Name`）
  - 供应商显示优化：若未匹配供应商表，列表回退展示 OCR 供应商名
  - 待处理发票支持一站式操作：`修改`、`保存修改`、`确认入库`、`删除发票`
  - 详情表格可直接编辑：名称、Code、Number、UN、Tax、数量、单位、单价
- 联调验证（API 实测）：
  - 发票列表供应商回退显示正常
  - `PUT /invoices/:id` 修改成功
  - `POST /invoices/:id/confirm` 确认成功
  - `DELETE /invoices/:id` 删除成功

### 10. 已确认回滚未确认（管理员）

- 新增能力：
  - `POST /api/v1/invoices/:id/rollback-confirm`（管理员）
  - 仅 `confirmed` 发票可回滚
- 回滚行为：
  - 发票状态：`confirmed -> pending`
  - 清空确认人和确认时间
  - 按发票明细逐条反向冲减库存（写入 `inventory_logs`，类型 `adjust`，原因 `rollback_confirm`）
  - 写入审计日志 `rollback_confirm_invoice`
- 前端接入：
  - 发票详情页（管理员 + 已确认状态）显示“回滚未确认”按钮
- 联调验证：
  - 确认后库存由 `40 -> 60`
  - 回滚后库存恢复 `60 -> 40`
  - 发票状态为 `pending` ✅

### 11. 发票详情弹窗可编辑与重算优化（本轮新增）

- 修复“供应商下拉不可选”：
  - 待处理发票状态下，供应商下拉不再依赖“编辑模式”，可直接选择并用于确认入库
  - OCR 供应商名新增自动建议匹配（规范化比对中英文与符号）
- 重构弹窗草稿状态：
  - 打开详情时即初始化 `draft`，后续确认/保存均使用同一份草稿状态
  - 修复“提示先选供应商后无法继续操作”的卡住问题（不会丢失草稿）
- 管理员核对可编辑范围扩展：
  - 头信息可编辑：发票号、日期、客户编码、供应商、是否应税、Sales/Tax/Total、备注
  - 明细可编辑：中文名、英文名、Code、Number、UN、Tax、数量、单位、单价、小计
- 新增“重新计算”按钮：
  - 按当前明细重算 `Sales Total / Tax Total / Total`
  - 税码规则保持 `E=无税`、`H=应税`，默认按当前税额推断税率，无法推断时回退 `13%`
  - 商品总数量、商品种类数实时联动展示
- 回归验证：
  - `cd client && npm run test` ✅
  - `cd client && npm run build` ✅
  - `cd server && npm run build` ✅
  - `cd server && DB_PASSWORD=rootpwd npm run test:e2e` ✅
  - 发票链路冒烟（真实运行中服务）：`upload -> get detail -> update -> confirm -> rollback-confirm -> delete` ✅

### 12. 发票上传页 UI/UX 与 PNG 超时修复（本轮新增）

- 上传页 UI/UX 优化（`client/src/pages/InvoiceScanPage.tsx`）：
  - 新增“上传进度条 + 动画 + 阶段描述（上传/识别/整理）”
  - 新增“变动信息”时间线（最近 6 条状态日志）
  - 上传区域改为自适应卡片，移动端与桌面端都可读
  - “上传并分析”按钮支持自适应尺寸（移动端全宽、桌面端固定宽）
- 前端超时修复（`client/src/api/invoices.ts`）：
  - `uploadInvoice` 改为可配置超时和上传进度回调
  - 上传默认超时由全局 30 秒提升为该接口单独 300 秒（避免 OCR 长耗时被前端提前中断）
- 后端 OCR 性能与稳定性优化：
  - `server/src/services/ocr.service.ts`
    - 图片识别前新增预处理：大图自动压缩/缩放（`sharp`）
    - 根据真实文件类型传递 MIME（PNG/JPG）
  - `server/src/services/llm.service.ts`
    - Vision 请求 `max_tokens` 限制为 `<=4096`，避免 OCR 请求过慢
    - Vision 请求新增 180 秒超时保护并返回可读错误
- PNG 实测验证：
  - `sampleinvoice/vegis_invoice.png` 上传识别成功 ✅
  - 用时约 `45.9s`，返回 `ai_vision`，识别 `18` 条明细
  - 识别后发票已通过 API 删除清理 ✅

### 13. 安全加固与性能优化（2026-03-05 下午）

#### 安全加固

- **生产环境密钥强制校验**（`server/src/config/env.ts`）
  - 生产环境下若 `JWT_SECRET` 或 `AI_ENCRYPTION_KEY` 未设置，启动时直接抛出异常
  - 防止使用硬编码默认密钥上线
- **sortBy SQL 注入防护**（`server/src/models/Invoice.ts`）
  - 新增 `ALLOWED_SORT_FIELDS` 白名单
  - 前端传入的 `sortBy` 参数不在白名单内时回退到 `created_at`
- **文件下载路径遍历防护**（`server/src/routes/invoice.routes.ts`）
  - 下载发票文件前，校验解析后的绝对路径必须在 `uploads/` 目录内
  - 阻止 `../../etc/passwd` 类路径遍历攻击
- **发票确认事务化**（`server/src/services/invoice.service.ts`）
  - `confirm` 方法全部数据库操作包裹在 `db.transaction()` 中
  - 任何一步失败（产品创建、库存调整、发票明细写入等）全部回滚
  - 通知发送移到事务外（非关键操作，失败不影响主流程）

#### 性能优化

- **N+1 查询消除**（`server/src/services/invoice.service.ts`）
  - `getAll` 方法原先逐条查询每张发票的 item count
  - 改为一次 `GROUP BY` 批量查询，减少数据库往返
- **大字段排除**（`server/src/models/Invoice.ts`）
  - `findAll` 查询不再返回 `ocr_raw_result`（可达数十 KB）
  - 仅在 `findById` 单条查询时返回完整数据

### 14. 模拟演示数据（2026-03-05 下午）

- 新增种子文件：`server/src/database/seeds/05_demo_data.ts`
- 数据概况：
  | 数据类型 | 数量 | 说明 |
  |---------|------|------|
  | 供应商 | 8 个 | CBS/Eastern/Pacific/Golden Dragon/Sun Valley/Asia Bev/Great Wall/Fresh Meat |
  | 产品 | 42 个 | 覆盖 9 个分类（蔬菜/水果/肉类/冷冻/干货/饮料/零食/豆腐/日用品） |
  | 库存记录 | 42 条 | 15% 缺货 + 20% 低库存 + 65% 正常 |
  | 已确认发票 | 60 张 | 覆盖过去 90 天，金额波动 ±15% |
  | 待处理发票 | 5 张 | 最近 3 天 |
  | 已驳回发票 | 3 张 | 带驳回原因 |
  | 库存日志 | 1,386 条 | 入库/出库（日常销售）/盘点（月度） |
  | 审计日志 | 50+ 条 | 登录/发票确认 |
  | 通知 | 14 条 | 库存预警/价格波动/系统通知/新发票待审核 |
- 运行方式：`cd server && npm run seed`
- 防重复机制：若 `products` 表已有数据则自动跳过

### 15. 全系统功能验证（2026-03-05 下午）

#### 后端 API 验证（全部通过）

- `/analytics/dashboard` — 今日/本周/本月统计、低库存预警 14 个产品
- `/analytics/purchase-trend` — 13 周采购趋势数据（$3,616 ~ $18,293）
- `/analytics/product-ranking` — 42 个产品排名（大白菜第一，$5,094）
- `/analytics/supplier-distribution` — 8 供应商占比（Asia Bev 19%，Fresh Meat 18.5%）
- `/analytics/category-distribution` — 9 分类占比（肉类 41.5%，蔬菜 17.8%）
- `/analytics/reorder-suggestions` — 14 条智能补货建议（含紧急程度/预估成本/建议供应商）
- `/analytics/price-changes` — 价格波动检测（豆芽 +28.2%，荔枝 +22.6%）

#### 前端 Playwright 自动化测试（8 页面全部通过）

- 登录页 ✅ — 默认凭据自动填充，点击登录跳转仪表盘
- 仪表盘 ✅ — 统计卡片（5 待处理、14 低库存）、金额趋势柱状图、低库存饼图
- 数据分析 ✅ — 采购趋势面积图、供应商饼图、畅销 Top10、价格波动、分类分布、订货建议
- 产品管理 ✅ — 42 产品表格、CRUD、价格历史
- 库存管理 ✅ — 库存总览、低库存标记、调整/盘点
- 供应商管理 ✅ — 8 供应商 CRUD
- 发票列表 ✅ — 68 张发票、状态筛选
- 通知中心 ✅ — 14 条通知、已读/未读标记
- **零控制台错误**

## 2026-06-08

### 1. 项目审计与现有优化核验

- 复核当前未提交改动，确认已覆盖多项 2026-06 优化报告中的高优先级风险：
  - `/uploads` 不再公开静态挂载，发票/产品文件改走鉴权路由。
  - 销售单成本价 `costPrice` 已按 `admin/staff` 角色脱敏。
  - 发票确认与回滚已复用 `adjustStockTx`，库存写入具备行锁与 `store_id`。
  - 服务启动已限制 `sharp` 并发/缓存，并补充 SIGTERM/SIGINT 优雅停机与进程级异常守卫。

### 2. 分析接口缓存加固

- `server/src/utils/cache.ts`
  - 进程内 TTL 缓存新增同 key 在途 Promise 合并，避免仪表盘/分析页并发请求同时穿透到底层聚合查询。
  - `invalidateCache(prefix)` 同时清理在途请求标记，防止写操作失效缓存后，旧查询完成又回填过期数据。
  - 新增 `invalidateAnalyticsCache()` 统一封装分析缓存失效前缀。
- 写链路接入缓存失效：
  - 发票确认/回滚：`server/src/services/invoice.service.ts`
  - 销售创建/作废：`server/src/services/sales.service.ts`
  - 批次入库/报损：`server/src/services/batch.service.ts`
  - 库存调整/安全库存/盘点：`server/src/services/inventory.service.ts`
  - 应付款记录：`server/src/services/payables.service.ts`

### 3. 参数边界与价格趋势稳定性

- 新增 `parseBoundedInt` 工具函数，统一处理 query 数字参数：
  - 非法值回退默认值。
  - 负数/超大值按上下限钳制。
- 接入范围：
  - `server/src/routes/product.routes.ts`：价格历史 `limit/months/supplierId`
  - `server/src/routes/analytics.routes.ts`：分析接口 `limit/days/categoryId`
  - `server/src/models/InvoiceItem.ts`：模型层再次钳制价格历史查询限制
  - `server/src/services/analytics.service.ts`：分析服务层对默认值与边界做防御
- 前端产品价格历史从表格升级为价格趋势图后，补充测试确认：
  - staff 不显示进价与价格趋势入口。
  - admin 点击价格趋势时默认请求近 6 个月、按发票粒度。

### 4. 回归测试与验证记录

- 后端 targeted：
  - `cd server && npm run test -- src/utils/cache.test.ts src/utils/helpers.test.ts src/services/sales.service.test.ts src/services/inventory.service.test.ts` ✅
  - `cd server && npm run build` ✅
- 前端 targeted：
  - `cd client && npm run test -- src/__tests__/Products.financialVisibility.test.tsx` ✅
  - `cd client && npm run build` ✅
- 说明：
  - `npm run lint` 当前为 0 error，但仍有大量既有 warning（主要为 `any` 与少量未用变量），本轮未做全仓类型债重构。
  - `npm run format:check` 仍因历史 97 个文件格式状态失败；未执行全仓格式化，避免产生大规模无关 diff。

## 2026-10-15

### 0. 本轮目标与选题

对前后端各做一次完整通读式审计，优先处理"设计过但从未真正可用"的模块与一类**静默失效**缺陷（用户看不到报错、功能却已不完整）。完整设计见 `docs/module-design-2026-10.md`。**迁移基线由 022 推进到 024**。

### 1. 销售 FIFO 批次扣减（迁移 023，模块缺口，此前 migration 019 注释即标注为待办）

- 新增纯函数模块 `server/src/services/batch-fifo.ts`：`planFifoAllocation(batches, requested, today)` 按「未过期优先 → 到期日升序(null 最后) → 收货日升序 → id 升序」分配，返回 `{allocations, unallocated}`；不变量 `Σ allocations + unallocated === min(需求, 可用)`。`toDateKey()` 统一本地日历日。
- 迁移 023：新建 `sales_item_batches`（记录每条销售明细消耗的批次，供作废精确回补；`batch_id` 置空保留历史）；`inventory_batches` 加 `idx_batches_fifo` 复合索引。
- 接线：
  - `sales.service.create` 插入明细后调 `deductBatchesFifo`（批次行 `forUpdate`，无批次商品空操作）。批次不足不报错，记 `unallocated` 并 warn，不阻塞销售。
  - `sales.service.void` 调 `restoreBatchesForSalesItem` 把消耗量加回原批次（`depleted → active`，`disposed` 保持）。
  - `invoice.service.confirm` 对 `is_perishable` 商品调 `receiveInvoiceBatchTx`（发票日 + `shelf_life_days`）自动建批，补齐 `invoice_id` 溯源；`rollbackConfirm` 调 `removeInvoiceBatchesTx` 清理。
  - `batch.service.create` 补写此前从未落库的 `invoice_id`。
- 顺带修正：批次到期日/收货日/临期汇总此前用 `toISOString()` 计算，在 UTC+8 下**错位一天**，统一改本地日历日。

### 2. 供应商商品别名学习（迁移 024，替代死代码 supplier_templates）

- 审计确认 `supplier_templates` 整条链路（表 + model + `template.service`）**无任何调用方**，`incrementSuccess` 对该永远为空的表做 UPDATE —— 是纯死代码。迁移 024 **删除该表**（down 忠实还原），改为 `supplier_product_aliases`。
- 新增 `server/src/services/alias.service.ts`：纯函数 `normalizeAliasKey`（barcode 8–16 位数字 / code 去空白大写≥3 / name 去符号小写≥2，兼容中文 2 字名）与 `deriveAliasCandidates`；`learnFromConfirm`（确认发票即学习，`ON DUPLICATE KEY UPDATE` 累加 hits 并可被人工修正覆盖）、`lookup`（barcode > code > name，同类型取 hits 高者）、`list`、`remove`。
- 接线：`ocr.service.processFile` 把"解析供应商"提到"匹配商品"之前；`matchProducts(items, supplierId)` 改为三级瀑布 —— ①已学习别名(0.99) → ②条码精确命中(0.95) → ③名称模糊匹配兜底。`invoice.service.confirm` 事务外学习人工确认结果（失败不影响确认）。
- 新增 `GET/DELETE /api/v1/product-aliases`（adminOnly，删除写审计）；设置页新增「OCR 商品匹配学习」卡片（列表 + 删除误学习项）。

### 3. 前端静默截断（高影响）

- 根因：服务端 `parsePagination` 把 `pageSize` 钳到 ≤100，前端多处请求 200/500/1000 且无分页 → **盘点漏盘、收银/批次选品只能选前 100 个商品、发票列表只显示前 100 张**。
- 新增 `client/src/api/pagination.ts` 的 `fetchAllPages`（逐页拉取，`maxPages` 兜底防死循环）+ `getAllProducts/getAllSuppliers/getAllInventory`。
- 选择器/盘点改用跨页拉全：SalesPage、BatchesPage、StocktakePage、ExportPage、InvoiceScanPage、ProductsPage/InvoiceListPage 的供应商下拉。
- 列表页接入真实分页 `<Pagination>`：Products、Inventory、Suppliers、InvoiceList、Batches、Notifications（筛选变化回第 1 页）。

### 4. 其余修复

- 产品页导出从原生 `<a href>`（不带 Authorization，点了是 401 JSON）改为 axios + blob 的 `exportProducts()`。
- Header 全局搜索框按 `isAdmin` 渲染（后端 `/analytics/search` 为 adminOnly，店员此前看到空下拉）。
- ProductsPage / SuppliersPage 接上 `?id=` 深链（此前 Header 搜索结果跳过去是死的）。
- MobileNav「更多」补齐 批次/盘点/应付/AI/导出/审计/用户 入口。
- `/ai/reorder-advice?categoryId=` 恒空：`getReorderSuggestions` 补返回 `categoryId`，过滤改数值比较。
- 9 个路由文件的裸 `sendError(500, err.message)` 统一为 `sendRouteError`（AppError 状态码透传 + DB→503 + 未知错误落日志）。
- `getExpiringSummary` 加 LIMIT；`recordPayment` 校验关联发票存在且归属该供应商。
- 前端补错误捕获/重试：Users / AiAssistant / Notifications / Inventory(日志) / Dashboard / Analytics / Stocktake / AuditLogs。
- e2e 滞后断言修复：降权 token 现返回 401 TOKEN_REVOKED（token_version 生效），断言改为「401/403 且 success=false」。

### 5. CI

- 新增 `.github/workflows/ci.yml`：push/PR 到 main 时并行跑 server、client 的 `npm ci` → `tsc --noEmit` → `npm test` → `npm run build` → `npm run lint`。

### 6. 测试与验证记录

- 后端单测：`cd server && npm run test` → **63 通过**（新增 `batch-fifo.test.ts` 13、`alias.service.test.ts` 9）。
- 前端单测：`cd client && npm run test` → **23 通过**（新增 `api/__tests__/pagination.test.ts` 5；同步更新 InvoiceList/Products 既有测试以适配分页参数、Router 与新增 API mock）。
- 类型检查：`server`/`client` 的 `tsc --noEmit` 均 0 错。
- Lint：两侧 0 error（保留既有 `any` warning）。
- 构建：两侧 `npm run build` 通过。
- 端到端（本地真实 MySQL，migration 024）：`E2E_BATCH_FIFO_TEST=true npm run test:e2e` → 只读链路 / 财务可见性边界 / 安全加固回归 / **批次 FIFO（发票建批→FIFO 扣减→作废回补→回滚清批，全程断言批次合计=库存）** / **别名学习（确认即学习 + 货号回查命中）** 全部通过。
- 说明：`npm run format:check` 仍因历史文件格式状态失败，本轮未做全仓格式化以避免大规模无关 diff。

## 2026-10-30 — 本地智能助手（无需 LLM）+ 可选 LLM 模式

### 0. 本轮目标

新增一个**不依赖 LLM 的智能助手**：把最新仓库数据整理成资料库，直接回答库存/销售/采购/保质期/应付问题并生成库存预警；同时完整保留原有 LLM function-calling 能力，管理员可随时切换，LLM 失败自动降级到本地。迁移基线由 024 推进到 **025**。

### 1. 服务端：资料库 + 规则引擎

- 新增 `server/src/services/knowledge.service.ts`
  - 并行聚合库存总览、商品索引（含模糊匹配所需的名称/SKU/条码）、近 1/7/30/90 天销售与采购、畅销/滞销、采购量与供应商集中度、价格波动、临期批次、补货建议、应付账款、待确认发票。
  - 快照缓存 60 秒（可由 `assistant_snapshot_ttl_seconds` 调整）；`invalidateAnalyticsCache()` 现在同时清 `assistant:` 前缀，发票确认/销售/库存调整后立即刷新。
  - 每段查询独立 `catch` 回退，单表缺失不会让整个助手不可用。
- 新增 `server/src/services/assistant-engine.ts`（纯函数，无数据库依赖）
  - 中英文意图识别：补货、低库存、临期、销售、毛利、采购、价格、供应商、应付、滞销、待确认发票、预警、单品查询、问候/帮助/概览。
  - 时间窗口解析（今天/本周/本月/近 N 天/last N days）并映射到预计算的 1/7/30/90 天窗口。
  - 单品实体识别：精确名称/SKU/条码 + 中文 2–6 字 n-gram 模糊匹配（「苹果」可命中「红富士苹果」）。
  - 确定性答案编排：补货量/成本、批次倒计时、毛利拆解、供应商欠款、单品库存与价格变化。
  - 预警规则：库存不足、过期/临期、待确认发票、采购涨价、应付未结、滞销。
  - 本地周报/月报 + 给 LLM 的紧凑快照上下文。
- 新增 `server/src/services/assistant.service.ts`
  - 统一模式选择 `local | llm | auto`（缺省读 `assistant_mode`，默认 local）。
  - LLM 未配置/超时/限流/异常时自动回退本地，响应带 `fallback` 原因。
- `ai-chat.service.ts`：每轮把最新资料库快照注入 system prompt，工具调用仍保留用于追问细节；返回值补充 `knowledgeInjected`。

### 2. 路由与设置

- `POST /api/v1/ai/chat` 新增可选 `mode`，返回 `engine / intent / confidence / windowDays / suggestions / sources / snapshotAt`。
- 新增 `GET /api/v1/ai/status`、`GET /api/v1/ai/knowledge?refresh=1`、`GET /api/v1/ai/alerts`、`GET /api/v1/ai/report?period=week|month`。
- 迁移 025 补齐 `assistant_mode`、`assistant_snapshot_ttl_seconds`；`04_default_settings.ts` 改为逐 key 补齐，避免迁移先插入新 key 后 seed 整体跳过默认值。
- 系统设置页新增「智能助手模式」「资料库缓存（秒）」。

### 3. 前端

- 重构「智能助手」页（原 AI 助手）：
  - 顶部「本地智能 / LLM 增强」切换；未配置 LLM 时禁用并给出配置提示。
  - 对话区展示引擎徽章、识别意图、追问建议；LLM 失败时展示降级原因。
  - 右侧「资料库」面板：商品/低库存/缺货/临期/待确认发票/应付未结，近 7/30 天销售、近 30 天采购、补货 TOP 3，支持手动刷新。
  - 「库存预警」面板：按紧急程度排序并链接到对应模块。
  - 「经营简报」按模式走本地 `/ai/report` 或 LLM `/ai/insights`；「补货清单」本地模式直接展示资料库计算结果，LLM 模式可额外生成解读。
- `SegmentedControl` 支持 `disabled` 选项（带 title 提示），用于未配置 LLM 的模式切换。
- 导航「AI 助手」统一改名为「智能助手」。

### 4. 公开演示（E:\Project\pandamart-pms）

- 新增 `client/src/demo/assistant.ts`：在浏览器内基于演示数据集复刻资料库快照、意图识别、答案编排、预警与周报，GitHub Pages 无需后端即可演示本地助手。
- mock 后端新增 `/ai/status`、`/ai/knowledge`、`/ai/alerts`、`/ai/report`，并替换原固定话术 `/ai/chat`；`mode=llm` 时返回降级提示。
- 新增演示助手单测（4 条），`npm run build:demo` 通过。

### 5. 验证

- 后端：`tsc --noEmit` 0 错；`vitest` **81 通过**（新增 `assistant-engine.test.ts` 18 条）。
- 前端：`tsc --noEmit` 0 错；`vitest` 23 通过。
- 真实 MySQL（migration 025）冒烟：资料库生成 42 商品 / 16 低库存 / 3 过期批次 / 18 临期 / 5 待确认发票 / 应付 $38,702.21；补货、预警、临期、销售、应付回答均返回真实数字。
- 公开演示：demo 构建成功，本地助手单测 4 条通过。

---

## 2026-10-30 — 无需 AI API 的本地发票 OCR（迁移 026）

### 0. 本轮目标

把发票识别从「必须配置 AI 提供商」改成**本地优先**：文本 PDF 走规则解析，图片/扫描件走本机 Tesseract OCR，结果由确定性解析器整理后写入 `invoices / invoice_items`。原 LLM/Vision 能力保留为可选增强，AI 失败自动回退本地。

### 1. 背景与选型

- Tesseract 是 Apache-2.0 开源项目（源码与训练数据公开），不需要逆向分析；直接调用系统 CLI 即可。
- 选择 CLI 而非 tesseract.js/ONNX：进程隔离、内存可控（生产 VPS 仅 961MB）、不增加 Node 原生依赖。
- 轻量部署：`tesseract-ocr` + `eng` + `chi_sim` + `poppler-utils` 合计约十余 MB；不装语言包时自动退回 `eng`。

### 2. 插件结构（`server/src/ocr/`）

- `types.ts`：`OcrDocument / OcrPage / OcrLine / OcrWord`，统一「文字 + 坐标」模型。
- `document.ts`：Tesseract TSV 解析、文本型 PDF 的伪坐标文档、视觉行合并、中文词拼接。
- `tesseract.provider.ts`：二进制检测（60s 缓存）、Sharp 灰度/归一化/锐化预处理、`pdftoppm` 渲染扫描 PDF、超时与临时目录清理。
- `invoice-parser.ts`：纯函数解析器（无 DB / 无二进制依赖）：
  - 行尾三个数字反推数量/单价/金额，兼容两行式发票与列漂移；
  - 中英文名称拆分、条码、货号、单位、E/H 税码；
  - 供应商名称用数据库已有名称校准；
  - `Subtotal/HST/Total`、`小计/税额/总计` 识别并做明细勾稽；
  - 输出置信度与 warnings（低置信度不静默）。
- `index.ts`：插件门面 `localInvoiceOcr.recognizeInvoice / parseText / getStatus`。

### 3. 识别流程与模式

`ocr.service.processFile` 按 `invoice_ocr_mode` 选择：

| 模式 | 行为 |
| --- | --- |
| `auto`（默认） | 本地解析优先；置信度低于阈值且配置了 AI 才调用 LLM；LLM 失败回退本地 |
| `local` | 只用文本解析 + Tesseract，绝不调用 AI |
| `llm` | 保持原 AI 优先；本地作为兜底 |

- 文本 PDF：`pdf-parse` → 规则解析；低置信度才走 LLM。
- 图片：Tesseract → TSV → 规则解析。
- 扫描 PDF：`pdftoppm`（300dpi，最多 3 页）→ Tesseract；原先把 PDF 字节当 JPEG 发给 Vision 的问题一并修正为「渲染第一页再发」。
- 落库仍走统一链路：供应商匹配 → 别名学习 → 商品匹配 → `InvoiceModel.create` → `InvoiceItemModel.createMany`。

### 4. API / 设置 / 前端

- `invoices.ocr_method` 增加 `local_ocr`；迁移 026；默认 `invoice_ocr_mode=auto`。
- 新增 `GET /api/v1/invoices/ocr/status`（管理员）：返回模式、LLM 是否配置、Tesseract 版本/语言、poppler 是否可用、安装提示。
- 上传响应新增 `ocrEngine / ocrConfidence / ocrWarnings`；`ocr_raw_result` 增加 `_ocr` 元数据。
- 系统设置新增「发票识别模式」，并展示本机 OCR 检测结果。
- 发票上传页显示「本地 OCR（无需 AI）」「PDF 文本解析」「AI 视觉识别」等中文标签与置信度，warnings 写入上传日志。

### 5. 部署

- `scripts/install-ocr-deps.sh`：Ubuntu/Debian 安装 tesseract、eng/chi_sim、poppler-utils。
- `scripts/deploy.sh` 部署时检测并打印 Tesseract / poppler 状态；缺失只告警不中断。
- 详细说明见 `docs/local-ocr.md`。

### 6. 测试

- 新增 `server/src/ocr/invoice-parser.test.ts` 6 条：单行英文发票、两行式发票、中文发票、无表头兜底、文本文档、TSV 重建。
- `ocr.service.test.ts` 增加本地文本入口用例；后端共 **88 条测试通过**，`tsc --noEmit` 0 错。
- 前端 `tsc --noEmit` 0 错。
