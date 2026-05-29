@echo off
chcp 65001 >nul
echo ============================================
echo   PandaMart PMS 启动
echo ============================================
echo.

cd /d "%~dp0..\server"

if not exist ".env" (
    echo 错误：未找到 server/.env 配置文件
    echo 请复制 .env.production 为 .env 并修改配置
    pause
    exit /b 1
)

if not exist "dist\index.js" (
    echo 错误：未找到构建产物，请先运行 build.bat
    pause
    exit /b 1
)

if not exist "public\index.html" (
    echo 错误：未找到前端构建产物，请先运行 build.bat
    pause
    exit /b 1
)

echo 启动 PandaMart PMS 服务器...
echo 按 Ctrl+C 可停止服务器
echo.
node dist/index.js
pause
