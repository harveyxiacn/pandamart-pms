# PandaMart PMS 部署交付指南

> 本文档面向负责部署的技术人员，说明如何在一台新服务器（或电脑）上部署和运行 PandaMart PMS 系统。

---

## 目录

1. [系统要求](#1-系统要求)
2. [环境准备](#2-环境准备)
3. [部署步骤](#3-部署步骤)
4. [配置说明](#4-配置说明)
5. [数据库初始化](#5-数据库初始化)
6. [构建与启动](#6-构建与启动)
7. [验证系统](#7-验证系统)
8. [日常维护](#8-日常维护)
9. [故障排查](#9-故障排查)

---

## 1. 系统要求

| 项目 | 最低要求 | 推荐 |
|------|---------|------|
| **操作系统** | Windows 10 / Windows Server 2019 | Windows 11 / Windows Server 2022 |
| **Node.js** | 18.x | 20.x 或更高 |
| **数据库** | MariaDB 10.x / MySQL 8 兼容环境 | MariaDB 11.x |
| **内存** | 2 GB | 4 GB |
| **磁盘** | 5 GB（含数据库） | 20 GB |
| **浏览器** | Chrome / Edge（最新版） | Chrome |

---

## 2. 环境准备

### 2.1 安装 Node.js

1. 访问 https://nodejs.org/zh-cn
2. 下载 **LTS（长期维护版）** 安装包
3. 双击安装，全部选默认选项
4. 安装完成后，打开「命令提示符」或「PowerShell」，输入以下命令确认安装成功：

```
node --version
npm --version
```

应看到类似 `v20.x.x` 和 `10.x.x` 的版本号。

### 2.2 安装数据库（MariaDB / MySQL 兼容）

**方式一：直接安装 MariaDB（推荐）**

1. 访问 https://mariadb.org/download/
2. 下载 MariaDB for Windows
3. 安装时选择服务器组件即可
4. 设置 root 密码（请记住！）
5. 勾选作为 Windows Service 运行，确保开机自动启动

**方式二：使用 Docker（适合测试）**

```bash
docker run -d --name pandamart-db -p 3306:3306 -e MARIADB_ROOT_PASSWORD=你的密码 mariadb:11
```

### 2.3 创建数据库

安装完成后，用以下命令创建数据库（可通过 MySQL 命令行、HeidiSQL、phpMyAdmin 或 MySQL Workbench 等工具）：

```sql
CREATE DATABASE pandamart_pms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

如果想创建专用数据库用户（推荐生产环境）：

```sql
CREATE USER 'pandamart'@'localhost' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON pandamart_pms.* TO 'pandamart'@'localhost';
FLUSH PRIVILEGES;
```

---

## 3. 部署步骤

### 3.1 获取项目文件

将整个项目文件夹复制到目标电脑的合适位置，例如：

```
C:\PandaMartPMS\
```

### 3.2 使用 GUI 管理器（推荐）

项目自带可视化管理器，**双击 `PandaMart管理器.bat`** 即可在浏览器中打开控制面板，按步骤引导完成全部配置和启动：

1. **配置数据库** — 填写 MySQL 连接信息，点击「保存配置」
2. **安装依赖** — 点击「开始安装」，等待自动完成
3. **测试连接** — 验证数据库连接是否正确
4. **初始化数据库** — 创建表结构和导入初始数据
5. **构建系统** — 编译前端和后端代码
6. **启动系统** — 一键启动，页面会显示访问链接

> 💡 推荐使用管理器，无需任何命令行操作。以下手动步骤仅供参考。

### 3.3 手动安装依赖（可选）

如果不使用管理器，可以手动操作：

```bash
cd C:\PandaMartPMS

# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ..\client
npm install
```

> 💡 首次安装依赖可能需要 3-5 分钟，请耐心等待。

---

## 4. 配置说明

### 4.1 创建配置文件

```bash
cd C:\PandaMartPMS\server
copy .env.production .env
```

然后用记事本打开 `server\.env`，修改以下配置：

### 4.2 必须修改的配置

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `DB_PASSWORD` | 数据库密码 | 自行生成，勿照抄 |
| `JWT_SECRET` | 登录加密密钥（随机字符串，至少 32 位） | 见 4.4 生成命令 |
| `AI_ENCRYPTION_KEY` | AI 密钥加密用（恰好 32 字符） | 见 4.4 生成命令 |
| `SEED_ADMIN_PASSWORD` | 初始化管理员密码（至少 8 位，含字母和数字） | 自行设置，勿照抄 |
| `SEED_STAFF_PASSWORD` | 演示员工账号密码（至少 8 位，含字母和数字） | 自行设置，勿照抄 |

如果使用了自定义数据库用户名，也需要修改 `DB_USER`。

### 4.3 可选修改

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务器端口 | `3000` |
| `DB_HOST` | 数据库地址 | `127.0.0.1` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_NAME` | 数据库名 | `pandamart_pms` |

### 4.4 生成随机密钥

如果不知道如何生成随机字符串，可以在 PowerShell 中运行：

```powershell
# 生成 JWT_SECRET（48 字符随机字符串）
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"

# 生成 AI_ENCRYPTION_KEY（恰好 32 字符）
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

将输出的字符串填入 `.env` 文件对应位置。

同时请手动设置一个强密码形式的 `SEED_ADMIN_PASSWORD`，用于首次执行 `seed` 时创建管理员账号。

---

## 5. 数据库初始化

### 方式一：使用脚本（推荐）

双击运行 `scripts\setup-db.bat`，脚本会自动：
1. 创建所有数据表
2. 导入初始数据（管理员账号、产品分类、演示数据）

### 方式二：手动命令

```bash
cd C:\PandaMartPMS\server

# 运行数据库迁移（创建表结构）
npx tsx ./node_modules/knex/bin/cli.js migrate:latest --knexfile src/config/knexfile.ts

# 导入初始数据
npx tsx ./node_modules/knex/bin/cli.js seed:run --knexfile src/config/knexfile.ts
```

### 初始化完成后

系统会创建管理员账号：

| 项目 | 值 |
|------|------|
| 用户名 | `admin` |
| 密码 | `SEED_ADMIN_PASSWORD` 的值 |

> ⚠️ 请在执行 `seed` 之前先配置 `SEED_ADMIN_PASSWORD`，并在首次登录后立即修改密码。

---

## 6. 构建与启动

### 方式一：使用脚本（推荐）

**首次部署或代码更新后：**

1. 双击 `scripts\build.bat` — 自动构建前端和后端
2. 双击 `scripts\start.bat` — 启动系统

**日常重启：**

只需双击 `scripts\start.bat`（不需要重新构建）

### 方式二：手动命令

```bash
# 构建前端（输出到 server/public/）
cd C:\PandaMartPMS\client
npm run build

# 构建后端
cd C:\PandaMartPMS\server
npm run build

# 启动生产服务器
cd C:\PandaMartPMS\server
set NODE_ENV=production
node dist/index.js
```

### 启动成功标志

看到以下日志说明启动成功：

```
数据库连接成功
PandaMart PMS 服务器已启动
端口: 3000
环境: production
```

---

## 7. 验证系统

### 7.1 浏览器访问

打开 Chrome 或 Edge 浏览器，访问：

```
http://localhost:3000
```

如果是从其他电脑访问，将 `localhost` 替换为服务器的 IP 地址，例如 `http://192.168.1.100:3000`

### 7.2 登录测试

1. 用户名输入 `admin`，密码输入你在 `SEED_ADMIN_PASSWORD` 中设置的值
2. 点击「登录系统」
3. 看到仪表盘页面说明一切正常

### 7.3 功能检查清单

| 检查项 | 操作 | 预期结果 |
|--------|------|---------|
| 登录 | 输入用户名密码登录 | 跳转到仪表盘 |
| 仪表盘 | 查看首页 | 显示统计卡片和图表 |
| 产品列表 | 点击「产品管理」 | 显示产品表格 |
| 库存页面 | 点击「库存管理」 | 显示库存状态 |
| 供应商 | 点击「供应商」 | 显示 8 个供应商 |
| 发票列表 | 点击「发票列表」 | 显示发票记录 |
| 数据分析 | 点击「数据分析」 | 显示趋势图和排名 |
| 通知 | 点击右上角铃铛 | 显示通知列表 |

### 7.4 API 健康检查

在浏览器访问：

```
http://localhost:3000/api/v1/health
```

应看到：

```json
{"success":true,"data":{"status":"ok","timestamp":"...","version":"1.0.0"}}
```

---

## 8. 日常维护

### 8.1 启动和停止

- **启动**：双击 `scripts\start.bat`
- **停止**：在运行窗口按 `Ctrl+C`

### 8.2 设为 Windows 服务（可选）

如果希望系统开机自动启动，可以使用 `pm2`：

```bash
# 安装 pm2
npm install -g pm2 pm2-windows-startup

# 注册为启动服务
cd C:\PandaMartPMS\server
set NODE_ENV=production
pm2 start dist/index.js --name pandamart-pms
pm2 save
pm2-startup install
```

之后可以用以下命令管理：

```bash
pm2 status              # 查看状态
pm2 restart pandamart-pms  # 重启
pm2 logs pandamart-pms     # 查看日志
pm2 stop pandamart-pms     # 停止
```

### 8.3 数据库备份

建议每天备份一次数据库：

```bash
# 使用 mysqldump 备份
mysqldump -u pandamart -p pandamart_pms > backup_2026-03-05.sql
```

或在 PowerShell 中创建自动备份脚本：

```powershell
$date = Get-Date -Format "yyyy-MM-dd"
$backupDir = "C:\PandaMartPMS\backups"
if (!(Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir }
mysqldump -u root -p你的密码 pandamart_pms > "$backupDir\backup_$date.sql"
```

### 8.4 查看日志

系统日志文件位于 `server/logs/` 目录下。

---

## 9. 故障排查

### 启动失败

| 错误信息 | 原因 | 解决方法 |
|---------|------|---------|
| `生产环境必须配置以下环境变量` | .env 中缺少必填项 | 检查 JWT_SECRET 和 AI_ENCRYPTION_KEY |
| `数据库连接失败` | 数据库未启动或配置错误 | 检查 MariaDB / MySQL 服务是否运行，以及 .env 中的数据库配置 |
| `未找到构建产物` | 没有执行构建 | 运行 `scripts\build.bat` |
| `端口已被占用` | 3000 端口被其他程序使用 | 修改 .env 中的 PORT，或关闭占用的程序 |

### 页面空白

- 确认已执行 `scripts\build.bat` 构建前端
- 检查 `server\public\index.html` 文件是否存在
- 查看浏览器控制台是否有错误（按 F12）

### 发票识别失败

- 确认已在「系统设置」中配置 AI 提供商
- 检查 AI 接口地址和 API Key 是否正确
- 点击「测试连接」验证连通性

### 忘记管理员密码

需要先生成新的 bcrypt 哈希，再写入数据库。示例：

```bash
cd C:\PandaMartPMS\server
node -e "require('bcrypt').hash(process.argv[1], 12).then(console.log)" "NewAdminPass123"
```

将生成的哈希值写入数据库：

```sql
UPDATE users
SET password_hash = '<新的 bcrypt 哈希>',
    login_attempts = 0,
    locked_until = NULL
WHERE username = 'admin';
```

> ⚠️ 重置后请立即登录并改为仅管理员知晓的强密码。

---

## 项目结构概览

```
PandaMartPMS/
├── scripts/              ← 部署脚本
│   ├── build.bat         ← 一键构建
│   ├── start.bat         ← 一键启动
│   └── setup-db.bat      ← 数据库初始化
├── client/               ← 前端源码
│   └── ...
├── server/               ← 后端源码
│   ├── .env              ← 环境配置（需手动创建）
│   ├── .env.production   ← 配置模板
│   ├── dist/             ← 后端构建产物
│   ├── public/           ← 前端构建产物（构建后自动生成）
│   ├── uploads/          ← 上传文件目录
│   └── logs/             ← 日志目录
├── docs/                 ← 文档
│   ├── user-guide.md     ← 用户操作指南
│   └── deployment-guide.md ← 本文档
└── package.json          ← 根项目配置
```

---

## 快速部署检查单

按顺序完成以下步骤：

- [ ] 安装 Node.js（v18+）
- [ ] 安装 MariaDB 并创建数据库 `pandamart_pms`
- [ ] 复制项目文件到目标目录
- [ ] 安装依赖：`cd server && npm install` + `cd client && npm install`
- [ ] 配置文件：复制 `server/.env.production` 为 `server/.env` 并修改
- [ ] 初始化数据库：运行 `scripts\setup-db.bat`
- [ ] 构建系统：运行 `scripts\build.bat`
- [ ] 启动系统：运行 `scripts\start.bat`
- [ ] 浏览器打开 `http://localhost:3000` 验证
- [ ] 用 `admin / <SEED_ADMIN_PASSWORD>` 登录
- [ ] 登录后立即修改管理员密码

---

> 📅 文档版本：2026 年 3 月 · PandaMart PMS v1.0
