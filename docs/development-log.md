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
