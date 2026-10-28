@echo off
chcp 65001 >nul
echo ============================================
echo   PandaMart PMS 数据库初始化
echo ============================================
echo.

cd /d "%~dp0..\server"

if not exist ".env" (
    echo 错误：未找到 server/.env 配置文件
    echo 请先复制 .env.production 为 .env 并修改数据库连接信息
    pause
    exit /b 1
)

echo [1/2] 运行数据库迁移（创建表结构）...
call npx tsx ./node_modules/knex/bin/cli.js migrate:latest --knexfile src/config/knexfile.ts
if errorlevel 1 (
    echo 错误：数据库迁移失败，请检查数据库连接配置
    pause
    exit /b 1
)

echo.
echo [2/2] 导入初始数据（管理员账号 + 分类 + 演示数据）...
call npx tsx ./node_modules/knex/bin/cli.js seed:run --knexfile src/config/knexfile.ts
if errorlevel 1 (
    echo 错误：初始数据导入失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo   数据库初始化完成！
echo   管理员账号：admin
echo   管理员密码：你在 server\.env 中设置的 SEED_ADMIN_PASSWORD
echo   请登录后尽快修改密码
echo ============================================
pause
