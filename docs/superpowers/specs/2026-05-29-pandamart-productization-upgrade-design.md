# PandaMart PMS 产品化升级设计

> 日期：2026-05-29  
> 状态：已确认方向，待实施计划  
> 范围：质量基线、代码审查整改、功能对齐、UI/UX 升级、核心业务增强  
> 仓库策略：GitHub private repository；不创建 CI workflow；提交信息使用 `[skip ci]`

## 1. 背景与目标

PandaMart PMS 已具备完整业务雏形：认证、发票 OCR、库存、产品、供应商、分析、AI、通知、导出、审计、应付、销售、批次等模块均已实现。当前主要问题不是“从零补功能”，而是需要把现有系统从可运行状态提升到可维护、可扩展、可交付的产品化状态。

本次升级目标：

1. 建立稳定质量基线：格式、lint、build、单元测试、关键回归测试可持续通过。
2. 对齐 `docs/PRD.md` 与 `docs/api-design.md`：明确已实现、部分实现、待实现功能。
3. 修复代码审查发现的问题：重复错误处理、类型薄弱、大文件臃肿、页面状态复杂、体验不一致。
4. 提升核心业务闭环：批量发票、价格趋势、快速扫码入库/出库、采购订单。
5. 优化 UI/UX：桌面端信息层级、移动端核心操作、表格/表单/反馈体验。

## 2. 当前基线

已验证状态：

- `npm run build` 通过。
- `server` 单测通过。
- `client` 单测通过。
- `npm run lint` 当前失败：前端 1 个真实 error，后端主要为 warning。
- `npm run format:check` 当前失败：多个 `client/server/src` 文件格式不一致。
- GitHub private repo 已建立：`harveyxiacn/PandaMartPMS`。
- 未创建 `.github/` 或 GitHub Actions workflows。

已决定提交到仓库的资产：

- 前后端源代码、测试、迁移、种子数据。
- 文档、操作指南、设计文档、截图。
- 示例发票和测试样本。
- launcher/scripts。
- lockfile 与 `.env.example` 占位模板。

已决定忽略的资产：

- 实际 `.env` / `.env.*`。
- `node_modules/`。
- 构建产物 `client/dist/`、`server/dist/`、`server/public/`。
- 运行数据 `server/uploads/`、`server/logs/`。
- 本地自动化目录 `.claude/`、`.run-logs/`。
- 打包副本 `toPandaMart/`、`toPandaMart.zip`。

## 3. 设计原则

### 3.1 先基线，后扩展

所有功能升级都必须建立在可验证基线上。每个阶段结束至少满足：

- TypeScript build 通过。
- 前后端测试通过。
- lint 无 error。
- 新增关键功能有对应单元测试或集成回归。

后端现有 `any` warning 数量较多，不在第一阶段强制归零；优先让 warning 数量可控下降，并在核心数据路径上补类型。

### 3.2 小步重构，不重写系统

保留当前技术栈与主要模块边界：

- React 18 + Vite + TypeScript + TailwindCSS。
- Express + TypeScript + Knex + MariaDB。
- OpenAI-compatible AI provider 抽象。

重构采用“触达即改善”策略：优先拆解正在增强的页面/服务，避免无业务收益的大范围重写。

### 3.3 权限边界不可回退

继续保持当前 Staff/Admin 权限模型：

- Staff 可上传发票、处理待确认发票、查看库存、销售出库、查看批次等一线操作。
- Staff 在待处理发票校对流程内可看到当前发票金额字段。
- Staff 不可查看历史采购金额、历史进价、供应商累计金额、分析财务数据、导出数据、应付账款、系统设置、用户管理。
- Admin 保持完整管理权限。

新增功能必须显式标注权限行为。

### 3.4 UX 服务实际门店场景

核心使用环境包括桌面、平板、手机。优先优化：

- 到货：拍照/上传发票、校对、确认入库。
- 货架旁：查库存、扫码、快速入库/出库。
- 管理：看趋势、价格异常、补货建议、采购订单。

移动端不追求完整桌面表格复制，而是使用卡片、分步操作和大触控目标。

## 4. 阶段设计

### Phase 1：质量基线与审查整改

目标：把当前项目变成可持续修改的干净基线。

工作内容：

- 修复 `client/src/pages/InvoiceListPage.tsx` 正则 lint error。
- 运行 Prettier 统一 `client/server/src` 格式。
- 清理明显未使用 import、无效 eslint-disable、明显死代码。
- 记录并分类剩余 lint warning，不一次性压制。
- 增加或调整测试，保证格式化/小修后行为不变。
- 生成代码审查差距清单，按安全、权限、性能、类型、UX、测试分类。

验收：

- `npm run build` 通过。
- `npm run lint` 无 error。
- `npm run format:check` 通过。
- `cd client && npm run test` 通过。
- `cd server && npm run test` 通过。

### Phase 2：架构基线

目标：降低后续功能开发成本。

后端设计：

- 新增统一 `asyncHandler`，逐步替代 route 内重复 `try/catch`。
- 统一 route 错误返回路径，保留 `AppError` 与 `sendRouteError` 语义。
- 抽象常用 query 解析：pagination、sort 白名单、date range、numeric id。
- 核心 service/model 补类型，优先覆盖 Invoice、InvoiceItem、Product、Inventory、Supplier、Sales、Payables。
- 对 `ocr.service.ts` 进行功能拆分规划，不在单次提交里硬拆全部。

前端设计：

- 统一页面请求状态：loading、error、empty、retry。
- 保留现有 Toast/Confirm，但规范使用方式，替换散落的 `alert` 或内联错误。
- 建立可复用表格/移动卡片展示模式。
- 对 `InvoiceListPage.tsx`、`InvoiceScanPage.tsx` 做拆分准备。

验收：

- 新增通用工具具备单元测试。
- 至少一个后端 route 文件迁移到 `asyncHandler` 并验证行为不变。
- 至少一个前端列表页改用统一状态/空态模式。

### Phase 3：功能对齐与业务增强

目标：补齐 PRD 中最能提升门店效率的能力。

#### 3.1 批量发票上传与任务队列

业务价值：每周 30-100 张发票时，逐张上传效率低。

设计：

- 新增 `invoice_upload_tasks` 表。
- 支持一次上传多个文件。
- 每个文件生成一个 task，状态为 `queued`、`processing`、`done`、`failed`。
- 初版使用数据库状态 + 进程内串行 worker；保持 Namecheap/单实例部署友好。
- 前端显示批量上传进度、错误原因、生成的发票入口。

权限：

- Admin/Staff 可上传。
- Staff 只可继续处理自己权限范围内的待处理发票。

#### 3.2 价格趋势与异常点

业务价值：管理员需要长期价格趋势，而不只是最近两次比较。

设计：

- 扩展产品价格历史接口，支持 `months`、`supplierId`、`groupBy`。
- 产品页增加价格趋势入口。
- 分析页展示近期异常涨价产品。
- 使用 Recharts 折线图，异常点以不同颜色标注。

权限：

- Admin only。
- Staff 不可访问价格历史。

#### 3.3 条码/快速入库与快速出库

业务价值：货架旁和收货区需要更快操作。

设计：

- 产品增加/强化 `barcode` 查询路径。
- 新增移动优先的“快速操作”页面。
- 支持输入条码或摄像头扫码（可在实现阶段评估依赖，如 `html5-qrcode`）。
- 查到产品后可执行入库、出库、报损等简化流程。
- 操作必须写入 `inventory_logs` 与审计日志。

权限：

- Staff 可执行允许的快速出库/销售相关操作。
- 手动库存调整仍保持 Admin only，除非后续明确放权。

#### 3.4 采购订单草稿

业务价值：补货建议需要转化为可执行订单。

设计：

- 新增 `purchase_orders`、`purchase_order_items` 表。
- 从补货建议按供应商生成草稿。
- 状态：`draft`、`sent`、`received`、`cancelled`。
- 后续收货时可关联发票，形成建议 -> 订单 -> 发票 -> 入库闭环。

权限：

- Admin only。

### Phase 4：UI/UX 产品化

目标：让系统更适合日常使用，而不是只满足功能存在。

桌面端：

- 统一页面标题区：主标题、说明、关键操作、筛选入口。
- 统一表格操作：搜索、筛选、分页、空状态、错误重试。
- 分离高频操作与低频管理操作，减少页面按钮噪音。
- 仪表盘从“堆图表”调整为“今日事项 + 风险提醒 + 趋势摘要”。

移动端：

- 发票、库存、销售、批次、快速操作使用卡片布局。
- 底部导航保留高频入口，Admin 才显示分析/设置。
- 表单按钮满足触控尺寸，危险操作加确认。

发票校对：

- 行级错误显示：缺产品、数量异常、金额不匹配、供应商未匹配。
- 总额差异提示：明细合计与发票总额不一致时阻止或警告确认。
- 原件对照入口更明显。

反馈体验：

- 所有成功/失败操作统一 Toast。
- 长耗时 OCR/AI 操作显示明确状态。
- 空状态提供下一步动作。

### Phase 5：测试与发布基线

目标：降低后续改动回归风险。

测试分层：

- 单元测试：工具函数、验证器、服务层核心计算。
- 集成测试：auth、invoice、inventory、payables、permissions。
- 前端测试：权限路由、关键页面 smoke、核心表单交互。
- E2E 脚本：保留现有数据库 E2E，并拆分可选回归开关。

发布策略：

- 不创建 CI workflow。
- 本地验证命令作为发布前检查清单。
- 所有推送 commit message 带 `[skip ci]`。
- 构建产物不进入 git，部署由本地/服务器构建脚本生成。

## 5. 主要代码改造边界

优先拆解或改造文件：

- `client/src/pages/InvoiceListPage.tsx`：拆出详情弹窗、编辑表单、列表筛选、供应商猜测逻辑。
- `client/src/pages/InvoiceScanPage.tsx`：拆出上传区、识别结果表、校验摘要、确认入库表单。
- `server/src/services/ocr.service.ts`：拆成 parser、normalizer、product matcher、prompt、主服务。
- `server/src/routes/*.routes.ts`：逐步接入 `asyncHandler` 和统一 query parser。
- `server/src/services/invoice.service.ts`：继续保留事务逻辑，补类型和测试。
- `server/src/services/analytics.service.ts`：按查询职责拆分，并为重查询添加测试或缓存策略。

暂不做：

- 不更换前端框架。
- 不迁移 ORM。
- 不引入复杂外部队列（初版使用数据库任务表 + 单实例 worker）。
- 不引入 GitHub Actions。
- 不在第一阶段强制消灭所有 `any` warning。

## 6. 风险与缓解

### 6.1 格式化导致大 diff

风险：一次 Prettier 会改动大量文件，影响后续 review。

缓解：Phase 1 单独提交格式化，提交信息明确为纯格式化，不混入业务逻辑。

### 6.2 队列在共享主机上的可靠性

风险：进程重启会中断处理。

缓解：任务状态持久化在数据库；启动时恢复 `queued` 和超时 `processing` 任务。

### 6.3 OCR/AI 调用时间长

风险：批量上传可能让请求超时或阻塞。

缓解：上传接口只创建任务并返回；worker 异步处理；前端轮询状态。

### 6.4 权限回归

风险：新增接口误暴露财务数据给 Staff。

缓解：所有新增接口设计阶段标注权限；实现阶段加入 Staff/Admin 对比测试。

### 6.5 UI 改版影响熟悉路径

风险：用户已熟悉现有布局，改动过大会降低效率。

缓解：保留主导航命名和核心路径；优化局部信息架构，不做品牌大换皮。

## 7. 成功标准

质量标准：

- build/test/format/lint 基线稳定。
- 新增功能至少覆盖关键 happy path 与权限边界测试。
- 核心服务代码不再继续膨胀成单文件大模块。

业务标准：

- 批量发票上传可以处理多文件并可恢复失败任务。
- 管理员能查看产品价格长期趋势和异常点。
- 门店一线人员能在移动端更快完成库存查询与快速操作。
- 补货建议可以转化为采购订单草稿。

UX 标准：

- 关键页面有清晰标题、说明、空态、错误态、加载态。
- 移动端核心流程不依赖横向表格。
- 长耗时任务有明确进度/状态反馈。

## 8. 实施顺序

1. Phase 1：质量基线。
2. Phase 2：架构基线。
3. Phase 3.1：批量发票上传队列。
4. Phase 3.2：价格趋势。
5. Phase 3.3：快速扫码/条码操作。
6. Phase 3.4：采购订单草稿。
7. Phase 4：UI/UX 深化。
8. Phase 5：测试与发布清单。

每个阶段完成后单独提交并推送，提交信息带 `[skip ci]`。
