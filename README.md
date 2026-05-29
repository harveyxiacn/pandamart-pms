# PandaMart PMS — 熊猫超市智能库存管理系统

> 基于 AI 的超市库存管理系统，支持发票 OCR 识别、智能库存管理、数据分析和 AI 对话。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + Recharts
- **后端**: Node.js + Express.js + TypeScript
- **数据库**: MariaDB 10.x (Knex.js)
- **AI**: OpenAI 兼容接口（支持多提供商）

## 项目结构

```
PandaMartPMS/
├── docs/                   # 项目文档
├── sampleinvoice/          # 样本发票（测试用）
├── client/                 # 前端项目 (React)
├── server/                 # 后端项目 (Express)
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── middleware/     # 中间件
│   │   ├── models/         # 数据模型
│   │   ├── routes/         # 路由
│   │   ├── services/       # 业务逻辑
│   │   ├── database/       # 迁移和种子
│   │   ├── types/          # 类型定义
│   │   └── utils/          # 工具函数
│   └── uploads/            # 上传文件
└── .gitignore
```

## 快速开始

### 前端

```bash
cd client
cp .env.example .env          # 配置 VITE_API_BASE_URL
npm install
npm run dev                   # 默认 http://localhost:5173
```

前端构建：

```bash
cd client
npm run build
```

前端单元测试：

```bash
cd client
npm run test
```

### 后端

```bash
cd server
cp .env.example .env          # 复制并修改环境变量
npm install                    # 安装依赖
npm run migrate                # 运行数据库迁移
npm run seed                   # 插入种子数据
npm run dev                    # 启动开发服务器
```

### 后端集成测试（E2E + MySQL）

```bash
cd server
npm run build
npm run test:e2e
```

开启写链路验证（供应商 create/list/delete）：

```bash
# Linux / macOS
E2E_WRITE_TEST=true npm run test:e2e

# PowerShell
$env:E2E_WRITE_TEST='true'; npm run test:e2e
```

如果要直连 Namecheap MySQL（不走本地数据库），执行前覆盖数据库环境变量：

```bash
# PowerShell 示例
$env:DB_HOST='localhost'
$env:DB_PORT='3306'
$env:DB_NAME='{cpanel_user}_pandapms'
$env:DB_USER='{cpanel_user}_pmsuser'
$env:DB_PASSWORD='your_db_password'
npm run test:e2e
```

### 管理员初始化

- 默认管理员用户名仍为 `admin`
- 管理员密码不再写死在仓库中，需通过 `server/.env` 中的 `SEED_ADMIN_PASSWORD` 提供
- 完成 `npm run seed` 前，请先配置 `JWT_SECRET`、`AI_ENCRYPTION_KEY` 和 `SEED_ADMIN_PASSWORD`

## 代码质量工具

项目已接入 ESLint（client/server 各自 flat config）与 Prettier（根配置，client 覆盖为双引号风格）。

```bash
# 在根目录
npm run lint           # 依次 lint server 和 client
npm run format         # Prettier 格式化 client/server 的 src
npm run format:check   # 仅检查格式，不修改

# 或单独在 client / server 目录
npm run lint
npm run lint:fix
```

> 现有代码中的 `any` 等暂以 warning 形式提示，不阻塞构建，可逐步收敛。

## 核心功能

1. **智能发票 OCR** — PDF 文本提取 / AI Vision 识别 / Excel 直接解析
2. **库存管理** — 入库/出库/盘点/预警
3. **数据分析** — 仪表盘/采购趋势/畅销滞销/价格波动
4. **AI 智能对话** — 自然语言问答库存和采购问题
5. **AI 经营洞察** — 异常检测/周期报告/智能订货建议
6. **供应商管理** — CRUD + 发票模板记忆
7. **用户权限** — Admin/Staff 两级权限

## API 文档

详见 `docs/api-design.md`，API 基础路径: `/api/v1`

## 许可证

Private — All Rights Reserved
