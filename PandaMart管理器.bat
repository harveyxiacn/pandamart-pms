@echo off
chcp 65001 >nul
title PandaMart PMS 管理器

echo.
echo   ============================================
echo    🐼 PandaMart PMS 管理器
echo    熊猫超市智能库存管理系统
echo   ============================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo   ⚠️  未检测到 Node.js
    echo.
    echo   Node.js 是运行本系统的必要环境。
    echo   现在为您自动安装 Node.js...
    echo.
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\install-nodejs.ps1"
    echo.

    :: 重新检查（先尝试刷新 PATH）
    set "PATH=%PATH%;C:\Program Files\nodejs"
    where node >nul 2>nul
    if errorlevel 1 (
        echo   ⚠️  安装已完成，但需要刷新系统环境变量。
        echo   请关闭此窗口，重新双击「PandaMart管理器.bat」启动。
        echo.
        pause
        exit /b 0
    )
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo   ✅ Node.js %NODE_VER%
echo.
echo   正在启动管理器，请稍候...
echo   管理器将在浏览器中自动打开
echo   （如果浏览器没有自动打开，请手动访问 http://localhost:9000）
echo.

:: 延迟后打开浏览器
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:9000"

:: 启动管理器
cd /d "%~dp0"
node launcher\server.js

pause
