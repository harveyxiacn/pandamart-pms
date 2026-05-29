# 熊猫超市智能库存管理系统 — 部署方案文档

> 版本：v1.0  
> 日期：2026-03-04  
> 作者：Cascade AI  
> 状态：草稿

---

## 1. 部署环境概述

### 1.1 Namecheap 共享主机配置

| 项目 | 规格 |
|------|------|
| **主机类型** | Namecheap Shared Hosting (Stellar / Stellar Plus / Stellar Business) |
| **Web 服务器** | Apache / LiteSpeed |
| **Node.js** | 6.x - 22.x（通过 cPanel 的 Node.js 应用管理器） |
| **Python** | 2.x - 3.x |
| **数据库** | MariaDB 10.x |
| **控制面板** | cPanel |
| **SSH 访问** | 支持（Jailed SSH） |
| **SSL 证书** | 免费 AutoSSL（Let's Encrypt） |
| **文件管理** | cPanel File Manager / SFTP |

### 1.2 部署架构图

```
┌─────────────────────────────────────────────────────────┐
│                   Namecheap 共享主机                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Apache / LiteSpeed (反向代理)           │    │
│  │                                                 │    │
│  │  ┌──────────────────┐  ┌─────────────────────┐  │    │
│  │  │  静态文件服务       │  │  反向代理             │  │    │
│  │  │  /public_html/   │  │  /api → Node.js App │  │    │
│  │  │  (前端 SPA 构建产物)│  │  (Port 3001)       │  │    │
│  │  └──────────────────┘  └────────┬────────────┘  │    │
│  └─────────────────────────────────┼───────────────┘    │
│                                    │                     │
│  ┌─────────────────────────────────▼───────────────┐    │
│  │            Node.js 应用 (Express.js)              │    │
│  │            通过 cPanel Node.js 应用管理器运行        │    │
│  │            Passenger / PM2 进程管理               │    │
│  └─────────────────────────────────┬───────────────┘    │
│                                    │                     │
│  ┌─────────────────────────────────▼───────────────┐    │
│  │                  MariaDB 10.x                     │    │
│  │                  pandamart_pms 数据库              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │               文件存储                             │    │
│  │  /home/{user}/uploads/invoices/                   │    │
│  │  /home/{user}/uploads/products/                   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTPS (外部 API 调用)
                          ▼
              ┌──────────────────────┐
              │   OpenAI API Server  │
              │   api.openai.com     │
              └──────────────────────┘
```

---

## 2. 域名与 DNS 配置

### 2.1 域名方案

建议使用子域名或专用域名：
- **方案 A**：`pms.pandamart.com`（子域名，推荐）
- **方案 B**：`pandamartpms.com`（独立域名）
- **方案 C**：`pandamart.com/pms`（子目录，不推荐，路由复杂）

### 2.2 DNS 记录配置

在 Namecheap DNS 管理面板添加：

| 类型 | 主机记录 | 值 | TTL |
|------|----------|-----|-----|
| A | pms | {Namecheap 主机 IP} | 自动 |
| CNAME | www.pms | pms.pandamart.com | 自动 |

### 2.3 SSL 证书

Namecheap 共享主机提供免费 AutoSSL（基于 Comodo/Sectigo），通过 cPanel 自动申请和续期。

**配置步骤：**
1. 登录 cPanel → SSL/TLS Status
2. 确认域名已列出
3. 点击 "Run AutoSSL" 为新域名签发证书
4. 等待 10-30 分钟自动生效

---

## 3. 数据库部署

### 3.1 创建数据库

通过 cPanel → MySQL Databases：

1. **创建数据库**：`{cpanel_user}_pandapms`
2. **创建数据库用户**：`{cpanel_user}_pmsuser`
3. **设置密码**：使用强密码（16位以上，含大小写字母、数字、特殊字符）
4. **授权用户访问数据库**：赋予 ALL PRIVILEGES

### 3.2 数据库配置

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME={cpanel_user}_pandapms
DB_USER={cpanel_user}_pmsuser
DB_PASSWORD=xxxxxxxxxxxxxxxx
```

> 注意：Namecheap 共享主机的数据库名和用户名会自动加上 cPanel 用户名前缀。

### 3.3 执行数据库迁移

通过 SSH 连接服务器后执行：
```bash
cd ~/pandamartpms/server
npm run migrate
npm run seed
```

如需通过 phpMyAdmin 导入历史数据：
1. cPanel → **phpMyAdmin**
2. 选择数据库 `{cpanel_user}_pandapms`
3. 点击 **Import**，上传 `.sql` 备份文件
4. 导入完成后再执行 `npm run migrate`，保证结构与当前代码一致

数据库准备完成后，建议先在服务器执行后端 E2E 集成测试：
```bash
cd ~/pandamartpms/server
npm run test:e2e
# 需要验证写入链路时
E2E_WRITE_TEST=true npm run test:e2e
```

### 3.4 数据库备份策略

| 备份类型 | 频率 | 方式 | 保留期限 |
|----------|------|------|----------|
| **自动备份** | 每日 | cPanel 自带的 JetBackup / 主机商备份 | 7-30天 |
| **手动备份** | 每周 | cPanel → phpMyAdmin → 导出 | 手动管理 |
| **系统内导出** | 按需 | 通过系统的全量备份导出功能 | 手动管理 |

---

## 4. 后端部署（Node.js）

### 4.1 通过 cPanel Node.js 应用管理器

Namecheap 共享主机使用 **Phusion Passenger** 来管理 Node.js 应用。通过 cPanel 配置：

**步骤：**
1. 登录 cPanel → **Setup Node.js App**
2. 点击 **CREATE APPLICATION**
3. 填写配置：

| 配置项 | 值 |
|--------|-----|
| Node.js version | 20.x (LTS) |
| Application mode | Production |
| Application root | pandamartpms/server |
| Application URL | pms.pandamart.com |
| Application startup file | dist/index.js |

4. 点击 **CREATE** 保存
5. 在应用管理器中点击 **Run NPM Install** 安装依赖

### 4.2 项目文件上传

**方式一：通过 Git（推荐）**
```bash
# SSH 登录服务器
ssh {user}@{server_ip}

# 克隆仓库
cd ~
git clone https://github.com/{your-repo}/PandaMartPMS.git pandamartpms

# 安装依赖并构建
cd pandamartpms/server
npm install
npm run build
```

**方式二：通过 SFTP**
1. 使用 FileZilla 等 SFTP 工具连接
2. 上传 `server/` 目录到 `~/pandamartpms/server/`
3. 上传 `server/dist/`（已构建的 JS 文件）
4. SSH 登接后执行 `npm install --production`

### 4.3 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# 应用配置
NODE_ENV=production
PORT=3001
API_BASE_URL=https://pms.pandamart.com/api/v1

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME={cpanel_user}_pandapms
DB_USER={cpanel_user}_pmsuser
DB_PASSWORD=your_strong_password_here

# JWT 配置
JWT_SECRET=your_very_long_random_secret_string_at_least_64_chars
JWT_EXPIRES_IN=86400

# AI 提供商加密密钥（用于 AES-256 加密存储 API Key）
AI_ENCRYPTION_KEY=your_32_char_secret_here

# 初始化管理员密码（执行 seed 时必填）
SEED_ADMIN_PASSWORD=your_strong_admin_password_here

# 注意：AI 提供商的 Base URL / API Key / 模型 等配置
# 不再通过环境变量管理，而是通过 Web UI 的「AI 设置」页面配置，
# 存储在数据库 ai_providers 表中（API Key 加密存储）。
#
# 如需通过种子数据创建默认 AI 提供商，可额外提供：
#   Base URL: http://127.0.0.1:8317
#   SEED_DEFAULT_AI_PROVIDER_API_KEY=<your-key>
#   Model:    gpt-5.2
#   Thinking Effort: xhigh

# 文件上传配置
UPLOAD_DIR=/home/{user}/pandamartpms/uploads
MAX_FILE_SIZE=20971520

# 邮件配置（可选）
SMTP_HOST=mail.pandamart.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@pandamart.com
SMTP_PASS=email_password
NOTIFICATION_FROM=PandaMart PMS <noreply@pandamart.com>

# CORS
CORS_ORIGIN=https://pms.pandamart.com
```

> ⚠️ **安全提醒**：`.env` 文件必须加入 `.gitignore`，绝不能提交到版本库。

### 4.4 Passenger 配置

Namecheap 的 cPanel Node.js 应用管理器使用 Passenger 作为进程管理器。需要确保 `server/dist/index.js` 中正确导出 Express app：

```typescript
// server/src/index.ts
import app from './app';

const PORT = process.env.PORT || 3001;

if (process.env.NODE_ENV !== 'production') {
  // 开发模式：直接监听端口
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Passenger 模式：导出 app
export default app;
```

同时在 `server/` 根目录创建 `app.js`（Passenger 入口）：

```javascript
const app = require('./dist/index').default;

if (typeof app.listen === 'function') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT);
}
```

### 4.5 .htaccess 配置（反向代理）

在网站根目录 (`public_html/`) 创建或修改 `.htaccess`：

```apache
# 启用 Rewrite 引擎
RewriteEngine On

# API 请求代理到 Node.js 应用
RewriteRule ^api/(.*)$ http://127.0.0.1:3001/api/$1 [P,L]

# 上传文件的静态访问
RewriteRule ^uploads/(.*)$ /home/{user}/pandamartpms/uploads/$1 [L]

# 前端 SPA：所有非文件请求 → index.html
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_URI} !^/uploads/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

> 注意：如果 Passenger 自动处理代理，则可能不需要手动配置反向代理规则。具体视 cPanel 配置而定。

---

## 5. 前端部署

### 5.1 构建前端

```bash
cd client
npm run build
```

构建产物位于 `client/dist/` 目录。

### 5.2 前端环境变量

创建 `client/.env.production`：

```env
VITE_API_BASE_URL=https://pms.pandamart.com/api/v1
VITE_APP_NAME=PandaMart PMS
```

### 5.3 部署前端文件

将 `client/dist/` 目录中的所有文件上传到 `public_html/` 目录：

```bash
# 通过 SSH
cp -r ~/pandamartpms/client/dist/* ~/public_html/

# 或通过 SFTP 上传
# 将 dist/ 内的文件上传到 public_html/
```

### 5.4 前端文件结构

```
public_html/
├── index.html              # SPA 入口
├── assets/                 # 构建产物（JS/CSS/图片）
│   ├── index-xxxxx.js
│   ├── index-xxxxx.css
│   └── ...
├── favicon.ico
└── .htaccess               # URL 重写规则
```

---

## 6. 上传文件目录

### 6.1 目录结构

```
~/pandamartpms/uploads/
├── invoices/               # 发票原件
│   ├── 2026/
│   │   ├── 03/
│   │   │   ├── 1709568000_vegis_invoice.pdf
│   │   │   └── 1709568100_dry_goods.xlsx
│   │   └── 04/
│   └── ...
└── products/               # 产品图片
    ├── product_15.jpg
    └── ...
```

### 6.2 目录权限

```bash
# 确保 uploads 目录可写
chmod 755 ~/pandamartpms/uploads
chmod 755 ~/pandamartpms/uploads/invoices
chmod 755 ~/pandamartpms/uploads/products
```

### 6.3 存储空间规划

| 内容 | 单文件大小 | 月增量（估算） | 年增量 |
|------|-----------|---------------|--------|
| 发票原件 | 0.1-5 MB | 50-500 MB | 0.6-6 GB |
| 产品图片 | 0.1-2 MB | 10-50 MB | 0.1-0.6 GB |
| 数据库 | - | 5-20 MB | 60-240 MB |

> Namecheap Stellar 计划提供 20GB SSD，Stellar Plus 提供 Unmetered SSD，一般足够使用。

---

## 7. 更新部署流程

### 7.1 标准更新流程

```bash
# 1. SSH 登录服务器
ssh {user}@{server_ip}

# 2. 拉取最新代码
cd ~/pandamartpms
git pull origin main

# 3. 后端更新
cd server
npm install --production
npm run build
# 数据库迁移（如有新迁移文件）
npm run migrate

# 4. 前端更新
cd ../client
npm install
npm run build
cp -r dist/* ~/public_html/

# 5. 重启 Node.js 应用
# 方式一：通过 cPanel Node.js 应用管理器点击 Restart
# 方式二：通过命令行
touch ~/pandamartpms/server/tmp/restart.txt
```

### 7.2 快速前端更新（仅前端变更）

```bash
cd ~/pandamartpms/client
git pull origin main
npm run build
cp -r dist/* ~/public_html/
```

### 7.3 回滚方案

```bash
# 回滚到上一个版本
cd ~/pandamartpms
git log --oneline -5         # 查看最近提交
git checkout {commit_hash}   # 回滚到指定版本

# 重新构建和部署
cd server && npm run build
cd ../client && npm run build && cp -r dist/* ~/public_html/

# 数据库回滚（谨慎操作）
cd server && npx knex migrate:rollback
```

---

## 8. 监控与维护

### 8.1 日志管理

| 日志类型 | 位置 | 说明 |
|----------|------|------|
| Node.js 应用日志 | `~/pandamartpms/server/logs/` | 应用运行日志 |
| Apache/LiteSpeed 错误日志 | cPanel → Error Log | Web 服务器错误 |
| Apache/LiteSpeed 访问日志 | cPanel → Raw Access Logs | 访问记录 |
| 数据库慢查询日志 | MariaDB 配置 | 慢查询分析 |

### 8.2 健康检查

系统提供健康检查端点：

```
GET /api/v1/health
```

响应：
```json
{
  "status": "ok",
  "timestamp": "2026-03-04T15:30:00.000Z",
  "database": "connected",
  "version": "1.0.0",
  "uptime": 86400
}
```

可配置外部监控服务（如 UptimeRobot，免费）定期检查此端点。

### 8.3 性能监控

- **cPanel 资源使用**：监控 CPU、内存、磁盘使用情况
- **数据库性能**：通过 phpMyAdmin 检查慢查询
- **应用响应时间**：通过日志记录请求处理时间

### 8.4 定期维护任务

| 任务 | 频率 | 方式 |
|------|------|------|
| 数据库备份 | 每周 | cPanel cron job / 手动 |
| 日志清理 | 每月 | cron job 删除 30 天前日志 |
| 过期通知清理 | 每月 | cron job 删除 3 个月前已读通知 |
| SSL 证书续期 | 自动 | AutoSSL 自动处理 |
| 依赖安全更新 | 每月 | npm audit + 手动更新 |
| 存储空间检查 | 每月 | cPanel 磁盘使用情况 |

### 8.5 Cron Job 配置

通过 cPanel → Cron Jobs 添加：

```bash
# 每天凌晨 2:00 检查库存预警并发送通知
0 2 * * * cd ~/pandamartpms/server && node dist/scripts/check-stock-alerts.js

# 每周日凌晨 3:00 自动备份数据库
0 3 * * 0 mysqldump -u {user} -p{password} {dbname} > ~/backups/pandapms_$(date +\%Y\%m\%d).sql

# 每月 1 号凌晨 4:00 清理过期数据
0 4 1 * * cd ~/pandamartpms/server && node dist/scripts/cleanup-old-data.js
```

---

## 9. 安全加固

### 9.1 服务器安全

| 措施 | 说明 |
|------|------|
| SSH 密钥认证 | 使用 SSH 密钥对替代密码登录 |
| 文件权限 | 敏感文件（.env）权限设为 600 |
| 目录权限 | uploads 目录 755，禁止执行脚本 |
| .htaccess 保护 | 阻止直接访问 .env、node_modules 等 |

### 9.2 .htaccess 安全规则

在 `public_html/.htaccess` 添加：

```apache
# 阻止访问敏感文件
<FilesMatch "^\.env|\.git|node_modules">
    Require all denied
</FilesMatch>

# 阻止目录浏览
Options -Indexes

# 安全头
Header set X-Content-Type-Options "nosniff"
Header set X-Frame-Options "DENY"
Header set X-XSS-Protection "1; mode=block"
Header set Referrer-Policy "strict-origin-when-cross-origin"
Header set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.openai.com;"

# 强制 HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

### 9.3 uploads 目录安全

在 `uploads/.htaccess` 添加：

```apache
# 禁止执行脚本
<FilesMatch "\.(php|phtml|php3|php4|php5|pl|py|jsp|asp|sh|cgi)$">
    Require all denied
</FilesMatch>

# 仅允许特定文件类型
<FilesMatch "\.(pdf|jpg|jpeg|png|gif|xlsx|xls)$">
    Require all granted
</FilesMatch>
```

---

## 10. 故障排除

### 10.1 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 502 Bad Gateway | Node.js 应用未运行 | cPanel 重启 Node.js 应用 |
| 500 Internal Server Error | 代码错误 / .htaccess 配置错误 | 检查错误日志 |
| 数据库连接失败 | 密码错误 / 连接数超限 | 检查 .env 配置 / 重启应用 |
| 文件上传失败 | 目录权限不足 / 超过大小限制 | 检查权限 / 调整 php.ini 或 Node 配置 |
| API 超时 | AI 调用慢 / 数据库查询慢 | 检查网络 / 优化查询 |
| SSL 证书失效 | AutoSSL 续期失败 | cPanel 手动运行 AutoSSL |
| 磁盘空间满 | 上传文件和日志累积 | 清理旧日志 / 归档旧文件 |

### 10.2 紧急恢复流程

1. **检查服务状态**：访问 `/api/v1/health`
2. **查看错误日志**：cPanel → Error Log
3. **重启应用**：cPanel → Node.js App → Restart
4. **数据库恢复**：从最近备份恢复
5. **代码回滚**：Git 回滚到上一个稳定版本

---

## 11. 成本估算

### 11.1 固定成本

| 项目 | 月费用 | 年费用 | 说明 |
|------|--------|--------|------|
| Namecheap Stellar | ~$2.88/月 | ~$34.56/年 | 首年优惠价 |
| Namecheap Stellar Plus | ~$4.88/月 | ~$58.56/年 | 推荐（不限网站+存储） |
| 域名 | ~$1/月 | ~$12/年 | .com 域名 |
| **固定成本合计** | **~$4-6/月** | **~$47-71/年** | |

### 11.2 变动成本

| 项目 | 单价 | 月用量估算 | 月费用 |
|------|------|-----------|--------|
| OpenAI GPT-4o Vision | ~$0.01/张图片 | 100-200张 | $1-2 |
| OpenAI GPT-4o 文本 | ~$0.005/次 | 50-100次 | $0.25-0.5 |
| **变动成本合计** | | | **$1-3/月** |

> 注意：PDF 文本提取和 Excel 解析完全免费，仅图片/扫描件识别需要调用 AI API。随着供应商模板记忆积累，AI 调用会逐渐减少。

### 11.3 总成本

| 阶段 | 月费用 | 说明 |
|------|--------|------|
| 初始阶段（AI 调用多） | $6-9/月 | 模板库尚未建立 |
| 稳定阶段（模板记忆完善） | $5-7/月 | 大部分发票可用模板处理 |

---

## 12. 上线检查清单

### 12.1 部署前检查

- [ ] 所有环境变量已正确配置
- [ ] .env 文件权限设为 600
- [ ] .env 已加入 .gitignore
- [ ] 数据库迁移已执行
- [ ] 种子数据已插入（管理员账号）
- [ ] 已使用自定义 `SEED_ADMIN_PASSWORD` 初始化管理员账号，并在首次登录后完成改密
- [ ] OpenAI API Key 已配置
- [ ] uploads 目录已创建且权限正确
- [ ] SSL 证书已生效
- [ ] .htaccess 安全规则已配置

### 12.2 功能验证

- [ ] 登录/登出正常
- [ ] 上传 PDF 发票 → OCR 识别成功
- [ ] 上传图片发票 → AI 识别成功
- [ ] 上传 Excel 发票 → 解析成功
- [ ] 发票确认入库 → 库存更新
- [ ] 产品 CRUD 正常
- [ ] 库存查询和预警正常
- [ ] 供应商管理正常
- [ ] 仪表盘数据正确
- [ ] 数据分析报表正确
- [ ] 通知系统正常
- [ ] 数据导出功能正常
- [ ] 自动化后端集成测试通过（`npm run test:e2e`）
- [ ] 手机端访问正常
- [ ] 平板端访问正常

### 12.3 性能验证

- [ ] 首页加载时间 < 2 秒
- [ ] API 响应时间 < 500ms（普通查询）
- [ ] OCR 处理时间 < 15 秒（AI 识别）
- [ ] 无明显的 JavaScript 报错

### 12.4 安全验证

- [ ] HTTPS 强制跳转正常
- [ ] 未登录无法访问 API
- [ ] Staff 角色权限限制正常
- [ ] 文件上传类型限制正常
- [ ] SQL 注入测试通过
- [ ] XSS 测试通过
