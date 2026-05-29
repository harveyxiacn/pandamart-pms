# PandaMart PMS - MySQL 自动安装脚本
# 优先使用 winget，回退到 MSI 下载安装

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   MySQL 自动安装" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否已安装
$mysqlPath = Get-Command mysql -ErrorAction SilentlyContinue
if ($mysqlPath) {
    $ver = & mysql --version 2>$null
    Write-Host "  MySQL 已安装: $ver" -ForegroundColor Green
    exit 0
}

# 检查 MySQL 服务是否存在
$mysqlService = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue
if ($mysqlService) {
    Write-Host "  检测到 MySQL 服务: $($mysqlService.Name) ($($mysqlService.Status))" -ForegroundColor Green
    exit 0
}

# 方式一：使用 winget
$hasWinget = Get-Command winget -ErrorAction SilentlyContinue
if ($hasWinget) {
    Write-Host "  检测到 winget，正在安装 MySQL..." -ForegroundColor Yellow
    Write-Host "  （安装过程可能需要几分钟，请耐心等待）" -ForegroundColor Yellow
    Write-Host ""
    winget install --id Oracle.MySQL --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  MySQL 安装完成！" -ForegroundColor Green
        Write-Host ""
        Write-Host "  重要提示:" -ForegroundColor Yellow
        Write-Host "  1. MySQL 已安装并注册为 Windows 服务" -ForegroundColor Yellow
        Write-Host "  2. 默认 root 密码为空，请在管理器中设置密码" -ForegroundColor Yellow
        exit 0
    }
    Write-Host "  winget 安装失败，尝试 MSI 方式..." -ForegroundColor Yellow
}

# 方式二：下载 MySQL Installer
Write-Host "  正在下载 MySQL Installer..." -ForegroundColor Yellow

$msiUrl = "https://dev.mysql.com/get/Downloads/MySQLInstaller/mysql-installer-community-8.0.40.0.msi"
$msiFile = "$env:TEMP\mysql-installer.msi"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($msiUrl, $msiFile)
    Write-Host "  下载完成，正在启动安装向导..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  请在弹出的安装向导中：" -ForegroundColor Cyan
    Write-Host "  1. 选择 'Server only' 类型" -ForegroundColor Cyan
    Write-Host "  2. 按提示完成安装" -ForegroundColor Cyan
    Write-Host "  3. 设置 root 密码（请记住！）" -ForegroundColor Cyan
    Write-Host "  4. 勾选 'Configure MySQL Server as a Windows Service'" -ForegroundColor Cyan
    Write-Host ""

    Start-Process msiexec.exe -ArgumentList "/i `"$msiFile`"" -Wait
    Write-Host ""
    Write-Host "  MySQL 安装向导已完成。" -ForegroundColor Green
    Remove-Item $msiFile -Force -ErrorAction SilentlyContinue
    exit 0
} catch {
    Write-Host "  下载失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  请手动下载安装 MySQL:" -ForegroundColor Yellow
    Write-Host "  https://dev.mysql.com/downloads/installer/" -ForegroundColor Cyan
    Start-Process "https://dev.mysql.com/downloads/installer/"
    exit 1
}
