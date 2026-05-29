@echo off
chcp 65001 >nul
echo ============================================
echo   PandaMart PMS 生产构建
echo ============================================
echo.

echo [1/4] 安装前端依赖...
cd /d "%~dp0..\client"
call npm install --production=false
if errorlevel 1 (
    echo 错误：前端依赖安装失败
    pause
    exit /b 1
)

echo.
echo [2/4] 构建前端...
call npm run build
if errorlevel 1 (
    echo 错误：前端构建失败
    pause
    exit /b 1
)

echo.
echo [3/4] 安装后端依赖...
cd /d "%~dp0..\server"
call npm install
if errorlevel 1 (
    echo 错误：后端依赖安装失败
    pause
    exit /b 1
)

echo.
echo [4/4] 构建后端...
call npm run build
if errorlevel 1 (
    echo 错误：后端构建失败
    pause
    exit /b 1
)

echo.
echo ============================================
echo   构建完成！
echo   请确保 server/.env 已正确配置
echo   然后运行 scripts\start.bat 启动系统
echo ============================================
pause
