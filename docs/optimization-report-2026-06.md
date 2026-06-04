# PandaMart PMS 优化评审报告（2026-06）

> 日期：2026-06-03
> 版本：v2.0
> 范围：全栈代码审计（安全 / 架构 / 性能 / 前端 / 测试 / PRD 对齐 / 数据模型 / 运维）
> 方法：8 路并行多智能体审计（327 次工具调用，全部结论附 `file:line` 证据）
> 目标：在不重写系统的前提下，把项目从"可运行"提升到"可维护、可信赖、可交付"的产品化状态

---

## 1. 概述

PandaMart PMS 已是一个**功能相当完整**的单店超市采购/库存管理系统：认证、发票 OCR（PDF 文本 / Vision / Excel）、产品、库存、销售、批次保质期、应付账款、分析、AI 对话（真 Function Calling）、AI 洞察、供应商、通知、导出、审计、AI 提供商管理均已端到端实现。

本次评审的结论与 2026-05 的判断一致：**当前主要矛盾不是"补功能"，而是质量基线、安全边界、并发正确性与运维可靠性的收敛**。同时存在 4 个 PRD/产品化设计已规划、但代码完全未落地的高价值功能（批量发票队列、价格趋势图、条码快速出入库、采购订单），以及 3 个"看似实现、实则死代码"的功能（供应商发票模板记忆、产品图片上传、条码查询）。

本报告给出：当前质量基线 → 73 项发现（按严重度×工时分级）→ PRD 功能对齐矩阵 → 分级优化路线图（含本期建议部署范围）。

---

## 2. 当前质量基线（main 分支，本地实测）

| 质量门 | 命令 | 结果 |
|---|---|---|
| 后端构建 | `server: tsc` | ✅ 通过 |
| 前端构建 | `client: tsc && vite build` | ✅ 通过（产物 index 270KB / analytics 347KB） |
| 后端单测 | `server: vitest run` | ✅ 14 通过 / 3 文件（crypto / validator / helpers，均纯工具） |
| 前端单测 | `client: vitest run` | ✅ 17 通过 / 10 文件（含权限/财务可见性边界） |
| 格式化 | `prettier --check` | ✅ 通过 |
| Lint（后端） | `eslint .` | ⚠️ 298 warning / **0 error**（绝大多数为 `any`） |
| Lint（前端） | `eslint .` | ❌ **1 error**（`InvoiceListPage.tsx:124` 无用转义 `\/`）+ 5 warning |

**结论**：构建/测试/格式基线绿；唯一硬错误是前端 1 处 lint error（本期必修）。测试覆盖**形式存在、实质薄弱**——所有触及金额与库存的服务层零自动化覆盖。

---

## 3. 关键发现总览（优先级矩阵）

73 项发现中 **18 项 high、约 30 项 medium、约 25 项 low**。下表为全部 **high** 级发现（建议 P0/P1 处理）：

| 编号 | 维度 | 严重度 | 工时 | 标题 | 证据 |
|---|---|---|---|---|---|
| SEC‑1 | 安全 | High | S | `/uploads` 静态目录**无鉴权**暴露发票 PDF/图片（财务文档泄露） | `app.ts:52` |
| SEC‑2 | 安全 | High | S | 销售单 API 向 **Staff 泄露成本价** `cost_price` | `sales.service.ts:169`、`sales.routes.ts:40` |
| ARC‑1 | 架构 | High | M | 无 `asyncHandler`，83 处重复 `try/catch` 直接回传原始错误信息、绕过 DB‑down→503 | 17 个 route 文件 |
| ARC‑2 | 架构 | High | M | 发票入库/回滚绕过 `adjustStockTx`：手写读改写**无行锁、缺 `store_id`** | `invoice.service.ts:374-400,250-278` |
| PERF‑1 | 性能 | High | L | OCR/LLM **同步阻塞**上传请求（最长 180s 占连接） | `invoice.routes.ts:37`、`ocr.service.ts:145` |
| PERF‑2 | 性能 | High | M | XLSX 解析/导出**同步阻塞事件循环**（冻结全体请求） | `excel.service.ts:7`、`export.routes.ts:46+` |
| TEST‑1 | 测试 | High | S | **无任何 CI**：测试/lint/类型检查从不自动执行 | 无 `.github/` |
| TEST‑2 | 测试 | High | M | `adjustStockTx`（防超卖核心）**零测试** | `inventory.service.ts:31-88` |
| TEST‑3 | 测试 | High | M | 发票入库事务（金额+库存）**零测试**且绕过 `adjustStockTx` | `invoice.service.ts:313-467` |
| TEST‑4 | 测试 | High | M | 销售/报损/应付的金额逻辑**零测试** | `sales/batch/payables.service` |
| TEST‑5 | 测试 | High | M | 服务端**财务脱敏边界无单测**（仅靠需活库的可选脚本） | `product.routes.ts:16`、`e2e-db-test.ts` |
| PRD‑1 | 功能 | High | L | 产品化 Phase 3 **四项全未实现**（批量队列/趋势图/条码/采购订单） | 迁移止于 020 |
| DATA‑1 | 数据 | High | S | `invoice_number` **无唯一约束、无查重**：重复入库直接虚增库存与应付 | `005:7`、`invoice.service.ts:174,313` |
| DATA‑2 | 数据 | High | M | 多店改造**半成品**：核心写路径忽略 `store_id`，`InventoryRow` 类型缺字段 | `migration 016`、`invoice.service.ts` |
| OPS‑1 | 运维 | High | S | **无优雅停机**：部署/重启 SIGTERM 截断在途库存/金额写入 | `index.ts:44-56` |
| OPS‑2 | 运维 | High | M | 仓库内部署文档指向**错误平台**（Namecheap/Windows），真实 VPS 运行手册不在版本库 | `docs/deployment*.md` |
| OPS‑3 | 运维 | High | M | sharp/OCR **无并发与内存上限**，`MemoryMax=400M` 下有 OOM 风险 | `ocr.service.ts:116` |
| OPS‑4 | 运维 | High | M | fail2ban + Cloudflare 真实 IP 未在代码/配置处理（限流误伤、CDN 整段被封） | `app.ts:33`、`rateLimit.ts:16` |
| OPS‑5 | 运维 | High | S | **无错误监控/告警**，无 `uncaughtException`/`unhandledRejection` 守卫 | `index.ts`、`errorHandler.ts:66` |

> 完整的 medium/low 发现见第 5 节各维度表。

---

## 4. PRD 功能对齐矩阵

对照 `docs/PRD.md §2` 与 `docs/api-design.md` 逐项核验：

| 功能 | 状态 | 证据 / 缺口 |
|---|---|---|
| 发票 OCR（文本PDF/扫描PDF Vision/图片/Excel） | ✅ 已实现 | `ocr.service.ts:159-253` |
| 发票字段抽取（供应商/编号/明细/总额/税） | ✅ 已实现 | `ocr.service.ts:273-323` |
| **供应商发票模板记忆** | ❌ **死代码** | `template.service.ts` 从未被调用；`supplier_templates`(009) 表空置 |
| 产品名智能匹配 | ✅ 已实现 | `ocr.service.ts:704-777` |
| 入库历史价对比（涨价高亮） | ✅ 已实现 | `invoice.service.ts:324-493`（admin 可见，staff 置空） |
| **产品图片上传** | ❌ **未接线** | `uploadProduct` multer 已配但无路由；前端无上传 UI |
| 多级分类 | ✅ 已实现 | `category.routes.ts:14-32` |
| **条码（存储+扫码查询）** | ⚠️ 部分 | 列存在但无 `findByBarcode`、无路由、无表单字段 |
| 手动入/出/调整 | ✅ 已实现 | `inventory.routes.ts:30-49`（admin） |
| 盘点 | ✅ 已实现 | `inventory.routes.ts:88-102` |
| 低库存预警（站内+邮件） | ✅ 已实现 | `analytics.service.ts:35-80`、`notification.service.ts:82` |
| 仪表盘 | ✅ 已实现 | `analytics.service.ts:6-100` |
| 畅销/滞销排名 | ✅ 已实现 | `analytics.service.ts:143-231` |
| **价格趋势追踪 & 涨价告警** | ⚠️ 部分 | `getPriceChanges` 仅比**最近两次**；价格历史是表格非折线图 |
| **供应商价格对比** | ❌ 缺失 | 无任何端点/服务/UI |
| 补货建议（统计+预算） | ✅ 已实现 | `analytics.service.ts:349-413` |
| AI 对话（Function Calling） | ✅ 已实现 | `ai-chat.service.ts:31-202`（8 工具，≤5 轮） |
| AI 洞察/异常检测 | ✅ 已实现 | `ai-insight.service.ts:6-144` |
| AI 补货建议（LLM 增强） | ✅ 已实现 | `ai-insight.service.ts:146-206` |
| **供应商评分** | ❌ 缺失 | PRD 标注"（后期）"，已知未来项 |
| 登录锁定（5 次/15 分钟） | ✅ 已实现 | `auth.service.ts:10-72` |
| 邮件通知 | ✅ 已实现 | `notification.service.ts`（受设置+SMTP 控制） |
| **数据备份/导出** | ⚠️ 部分 | full-backup **漏掉** sales/batches/payables/audit 等表，发票截断 1000 行 |
| 审计日志 | ✅ 已实现 | `AuditLogModel` 跨服务调用 |
| 系统设置 | ⚠️ 部分 | 数值/开关项已实现；"发票模板管理"无 UI/后端 |
| AI 提供商管理 | ✅ 已实现 | `ai-provider.routes.ts:69-248` |

**统计**：已实现 18 / 部分 5 / 缺失 4（其中供应商评分为 PRD 明确"后期"）。

---

## 5. 分维度详述

### 5.1 安全（总体稳健，2 项 high 直接违反 PRD 财务隔离）

整体良好：JWT 每请求复核 `is_active`、bcrypt cost 12、登录锁定到位、所有 `raw/havingRaw/whereRaw` 均参数化绑定（无注入）、排序字段白名单、AES‑256‑GCM 正确、`.env*` 已忽略。主要风险：

| 编号 | 严重度 | 工时 | 问题 | 建议 |
|---|---|---|---|---|
| SEC‑1 | High | S | `/uploads` 静态挂载无鉴权，任何人可猜测式下载发票（含单价/总额）。已存在带鉴权与防穿越的 `GET /invoices/:id/file`，静态挂载属冗余暴露 | 移除公开静态挂载，文件一律走鉴权路由；文件名改 UUID |
| SEC‑2 | High | S | `salesService.getById` 返回 `costPrice`，`POST/GET /sales` 仅 `authenticate`，Staff 可从自己下单的响应里读到成本价 | 按 viewerRole 对 staff 剥离 `costPrice` |
| SEC‑3 | Med | M | helmet `contentSecurityPolicy:false`，无 XSS 纵深防御 | 配置带 hash/nonce 的 CSP（先 report-only） |
| SEC‑4 | Med | S | `JWT_SECRET` 无强度校验（仅非空），模板占位仅 11 字符 | 仿 `AI_ENCRYPTION_KEY` 强制 ≥32 位，启动即失败 |
| SEC‑5 | Med | M | 无状态 JWT：登出/改密**不失效**旧 token（最长 24h） | 增 `token_version`/`password_changed_at` 并在鉴权处校验 |
| SEC‑6 | Low | S | 销售 `unitPrice` 无数值校验（NaN→污染总额） | 服务端 `Number.isFinite && >=0` 守卫 |
| SEC‑7 | Low | M | 上传仅校验扩展名/MIME 且接受 `octet-stream`，无魔数 | 去除 octet-stream 或加 magic-byte 校验 |
| SEC‑8 | Low | S | AI provider 删除/设默认、自助改密**无审计** | 补 `AuditLogModel.create` |

### 5.2 后端架构与代码质量

结构清晰（routes→services→对象字面量 model），主要为一致性债：

| 编号 | 严重度 | 工时 | 问题 |
|---|---|---|---|
| ARC‑1 | High | M | 无 `asyncHandler`，83 处 `catch(err:any)` 回传原始 `err.message`（泄露 SQL/驱动文本），且绕过 `sendRouteError` 的 DB‑down→503 |
| ARC‑2 | High | M | `adjustStockTx`（带 `forUpdate` 行锁、store 范围）已被 sales/batch 正确复用，但**发票 confirm/rollback 各自手写无锁读改写、缺 `store_id`**；`InventoryModel.adjustQuantity/setQuantity` 更是无事务——四套库存写法 |
| ARC‑3 | Med | S | `sendRouteError` 仅 2/17 路由采用，两套错误约定并存（同一 DB 故障在 /auth 返 503、在 /invoices 返 500+原文） |
| ARC‑4 | Med | L | knex 行类型泛型零使用→约 233 处 `:any`；已有 `UserRow/InvoiceRow…` 却未用于查询边界 |
| ARC‑5 | Med | L | `ocr.service.ts` 778 行 god-file，混杂分发/持久化/图像/正则解析/产品匹配五职责 |
| ARC‑6 | Low | S | 死代码：`template.service.ts`(118 行) 被 import 从不调用；`helpers.ts` 4 个未用函数 |
| ARC‑7 | Low | S | 多处冗余 `as any` 掩盖了本就正确的 model 类型 |
| ARC‑8 | Low | S | env 校验缺口：DB 凭据/SMTP 不校验（DB 密码默认空、用户默认 root） |
| ARC‑9 | Low | S | ai-chat 内存会话按**创建时间**而非最后活跃淘汰，活跃会话 30 分钟被丢 |

### 5.3 性能与数据库

数据量小（单店~10 用户），瓶颈不在查询量而在**请求路径阻塞**与小连接池（max=5）：

| 编号 | 严重度 | 工时 | 问题 |
|---|---|---|---|
| PERF‑1 | High | L | OCR/LLM 同步内联在上传请求中，单次最长占用连接 180s，几次并发即拖垮全站 |
| PERF‑2 | High | M | XLSX 读/写同步，CPU-bound 阻塞单一事件循环，冻结所有并发请求；invoices/inventory 导出无行数上限 |
| PERF‑3 | Med | S | 无 HTTP 响应压缩（gzip 可压缩 JSON 5-10×） |
| PERF‑4 | Med | M | 重分析端点每次重算无缓存；AI 工具循环（≤5 轮）可反复触发同类聚合 |
| PERF‑5 | Med | M | `getPriceChanges` 两次全表扫 `invoice_items`，`dateFrom/To` 入参从不应用，ABS 谓词不可走索引 |
| PERF‑6 | Med | S | `products.barcode` 无索引（条码查询将全表扫描） |
| PERF‑7 | Low | S | `sales_orders` 缺 `(status,created_at)` 复合索引 |
| PERF‑8 | Low | S | payables 缺 `invoices(supplier_id,status)` 复合索引 |
| PERF‑9 | Low | M | 发票 confirm 事务跨多次串行往返持锁；循环内逐项查价格历史 |
| PERF‑10 | Low | M | OCR 产品匹配每行一次 `LIKE '%kw%'`（N+1，不可走索引/全文索引被绕过） |
| PERF‑11 | Low | S | 连接池 max=5，长事务/导出可能耗尽，30s acquire 超时表现为"偶发慢" |
| PERF‑12 | Low | S | full-backup 载入数千行并 `JSON.stringify(...,null,2)` 同步美化输出 |

### 5.4 前端与 UI/UX

UI 组件库扎实（Toast/Confirm/Modal/Skeleton/EmptyState/Pagination）、路由懒加载、同源生产配置正确：

| 编号 | 严重度 | 工时 | 问题 |
|---|---|---|---|
| FE‑1 | High | S | authStore 与 axios client **双份 token 存储**，401 硬跳转只清 `pm_token` 不清 zustand persist，导致登出后仍"看似已登录"、刷新闪烁/重定向循环 |
| FE‑2 | Med | M | `InvoiceListPage` 防抖形同虚设：`load()` 读原始 `keyword` 而非 `debouncedKeyword`；且 `pageSize:100` 无分页静默截断 |
| FE‑3 | Med | L | `InvoiceListPage.tsx` 885 行 god-component，15 个 useState + 5 个 mutation + OCR 解析/供应商模糊匹配混在一处 |
| FE‑4 | Med | M | Modal 无焦点陷阱/焦点恢复/初始聚焦（数据录入密集，键盘/读屏体验差） |
| FE‑5 | Low | M | 错误/成功反馈不一致：Analytics/Dashboard/InvoiceScan 用临时 Card，InvoiceList 同事件既弹 Toast 又显内联横幅 |
| FE‑6 | Low | S | 图标按钮（如 Header 通知铃）缺 `aria-label` |
| FE‑7 | Low | M | 多处 `pageSize:200-1000` 全量拉取喂下拉框（销售选品 1000 option，无 typeahead） |
| FE‑8 | Low | S | 发票状态徽章映射在 3+ 处重复手写，`STATUS_LABELS` 被绕过 |
| FE‑9 | Low | M | 表单校验全靠 toast 无内联字段错误；数值输入 `Number()||0` 静默归零 |
| FE‑10 | Low | S | 顶层单一 Suspense 切换页面会闪整屏 fallback；无全局 ErrorBoundary |

### 5.5 测试与质量门（最大短板：金额/库存零覆盖 + 无 CI）

详见第 3 节 TEST‑1..5（均 high）。补充：

- TEST‑6（Med）：`e2e-db-test.ts`（1067 行、含 staff 财务边界）未接入 `vitest run`，需活库+手动 env，实际几乎从不运行；无 supertest 在制 HTTP 测试。
- TEST‑7（Low）：无覆盖率阈值；lint `--max-warnings=99999` 实质不阻断；`tsc` 与 test 分离。

### 5.6 数据模型与完整性

schema 总体良好（金额一致 DECIMAL(12,2)、FK 级联合理、索引较全）。关键缺口见 DATA‑1/2（high），及：

| 编号 | 严重度 | 工时 | 问题 |
|---|---|---|---|
| DATA‑3 | Med | M | `inventory_logs.quantity` 符号约定**不一致且无文档**：`adjustStockTx` 存绝对值、seed/rollback 存负值，仅靠消费方 `ABS()` 幸存 |
| DATA‑4 | Med | S | 软删除 vs DB 唯一约束冲突：`products.sku`/`suppliers.code` 复用时服务检查放行但 INSERT 触发 `ER_DUP_ENTRY` → 未处理 500 |
| DATA‑5 | Med | L | `inventory_batches` 数量与 `inventory.quantity` **漂移**：销售不扣批次，临期/报损面板基于虚高批量 |
| DATA‑6 | Low | S | 无 `grand_total = subtotal + tax` 一致性校验（结构脆弱，非活动 bug） |
| DATA‑7 | Low | S | `audit_logs`/`notifications` 缺 `store_id`（多店未来项） |
| DATA‑8 | Low | M | 遗留非事务库存写法与行锁 `adjustStockTx` 并存，存在丢更新风险（与 ARC‑2 同源） |

### 5.7 运维 / 部署 / 可观测性

关键项见第 3 节 OPS‑1..5（均 high）。补充：

| 编号 | 严重度 | 工时 | 问题 |
|---|---|---|---|
| OPS‑6 | Med | S | 生产 DB 密码静默可选（默认空+root），弱 env 校验 |
| OPS‑7 | Med | M | 文档引用的 DB 备份/日志清理/库存告警 cron 脚本**根本不存在**；无任何已验证备份 |
| OPS‑8 | Med | M | 迁移依赖 `tsx`(devDep) 与 TS 源；一旦 `npm ci --omit=dev` 迁移静默失效 |
| OPS‑9 | Low | S | winston 仅按大小轮转，无按时间轮转/压缩 |
| OPS‑10 | Low | S | 无 CI（已是 2026-05 明确取舍），建议至少加本地预部署校验脚本 |

---

## 6. 优化路线图

按"先安全/正确，后体验/扩展"分级。**P0+P1 构成本期建议部署范围**（低风险、高价值、可充分测试）。

### P0 — 安全与正确性硬修复（本期，必做）
- SEC‑1 移除/收口 `/uploads` 公开挂载，文件走鉴权路由
- SEC‑2 销售 API 对 staff 剥离 `costPrice`
- SEC‑4 `JWT_SECRET` 强度校验；OPS‑6 生产强制 DB 密码
- DATA‑1 发票 `invoice_number` 服务级查重（同供应商+号已确认则拦截/告警）
- DATA‑4 `ER_DUP_ENTRY`→409 统一映射
- ARC‑2 / DATA‑2 / DATA‑8 库存写路径统一走 `adjustStockTx`（行锁 + `store_id` + 一致符号）
- OPS‑1 优雅停机；OPS‑5 `uncaughtException`/`unhandledRejection` 守卫
- OPS‑3 `sharp.concurrency(1)`+cache 上限 + OCR 串行信号量
- 前端 lint error 修复（`InvoiceListPage.tsx:124`）、FE‑1 token 单一来源、FE‑2 防抖修复

### P1 — 高 ROI 功能补全 + 性能快赢（本期，建议）
- 产品图片上传（接线已有 multer + 前端选图）
- 条码：`findByBarcode` + 索引 + 产品表单字段（为 Phase 3.3 铺路）
- PERF‑3 `compression` 中间件；PERF‑6/7 补索引
- SEC‑6 销售数值校验；SEC‑8 补审计；ARC‑6 清死代码
- 新增金额/库存/权限边界单测（TEST‑2..5 的核心用例）

### P2 — 体验与可观测（近期，单独迭代）
- ARC‑1/ARC‑3 引入 `asyncHandler` + 集中 errorHandler（统一错误契约、止泄露）
- PERF‑4 分析端点 TTL 缓存；PERF‑5 价格查询加窗口边界
- FE‑3 拆 `InvoiceListPage`；FE‑4 Modal 焦点陷阱；FE‑5/10 反馈一致化 + ErrorBoundary
- SEC‑3 CSP（report-only 起步）；SEC‑5 token 失效机制
- OPS‑2/7/8 提交真实 VPS 运行手册 + 备份脚本 + 迁移走编译产物
- 价格趋势图（Phase 3.2）：price-history 加 `months/supplierId/groupBy` + Recharts 折线 + 异常点

### P3 — 大功能与远期（按产品决策排期）
- 批量发票上传队列（Phase 3.1，`invoice_upload_tasks` + 进程内串行 worker）
- 采购订单草稿（Phase 3.4，建议→订单→发票→入库闭环）
- 条码移动端快速出入库页（Phase 3.3）
- FIFO 批次扣减（DATA‑5）；OCR god-file 拆分（ARC‑5）；knex 行类型收敛（ARC‑4）
- 供应商价格对比、供应商评分、模板记忆接线、full-backup 补全
- CI 工作流（如取舍改变）

---

## 7. 回归防护

- 每阶段验收：`tsc` 构建 + `eslint`（前端 0 error）+ `prettier --check` + 前后端 `vitest run` 全绿。
- 新增金额/库存/权限改动**必须**配单测：`adjustStockTx` 三分支、发票查重、销售成本脱敏、`redactProductPrice`。
- 生产部署遵循 [[deployment-vps]]：放慢连接节奏避免 fail2ban；迁移前确认 devDeps 在位。
- 部署后健康校验：`/api/v1/health` + `/api/v1/ready` + 关键页面 smoke。

---

## 8. 附录：评审方法

8 路并行子智能体，每路负责一个维度（安全 / 后端架构 / 性能与DB / 前端UX / 测试 / PRD差距 / 数据模型 / 运维），强制结构化输出并要求每条结论附 `file:line` 证据，禁止臆造。本报告对其结论做去重、分级与交叉印证（其中 `/uploads` 暴露、`adjustStockTx` 绕过、销售 `cost_price` 泄露、发票查重缺失等已由人工复核源码确认）。

> 模块级详细设计见 `docs/module-design-2026-06.md`。
