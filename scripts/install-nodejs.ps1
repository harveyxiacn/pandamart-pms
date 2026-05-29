# PandaMart PMS - Node.js 自动安装脚本
# 优先使用 winget，回退到 MSI 下载安装

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Node.js 自动安装" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# 检查是否已安装
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if ($nodePath) {
    $ver = & node --version 2>$null
    Write-Host "  Node.js 已安装: $ver" -ForegroundColor Green
    Write-Host "  无需重复安装。" -ForegroundColor Green
    exit 0
}

# 方式一：使用 winget
$hasWinget = Get-Command winget -ErrorAction SilentlyContinue
if ($hasWinget) {
    Write-Host "  检测到 winget，正在安装 Node.js LTS..." -ForegroundColor Yellow
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "  Node.js 安装完成！" -ForegroundColor Green
        Write-Host "  请关闭此窗口，重新双击 PandaMart管理器.bat" -ForegroundColor Yellow
        exit 0
    }
    Write-Host "  winget 安装失败，尝试 MSI 方式..." -ForegroundColor Yellow
}

# 方式二：下载 MSI 安装
Write-Host "  正在下载 Node.js LTS 安装包..." -ForegroundColor Yellow

$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$msiUrl = "https://nodejs.org/dist/v22.12.0/node-v22.12.0-$arch.msi"
$msiFile = "$env:TEMP\nodejs-install.msi"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($msiUrl, $msiFile)
    Write-Host "  下载完成，正在安装..." -ForegroundColor Yellow

    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$msiFile`" /qn /norestart" -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -eq 0) {
        Write-Host ""
        Write-Host "  Node.js 安装完成！" -ForegroundColor Green
        Write-Host "  请关闭此窗口，重新双击 PandaMart管理器.bat" -ForegroundColor Yellow
        Remove-Item $msiFile -Force -ErrorAction SilentlyContinue
        exit 0
    } else {
        Write-Host "  MSI 安装失败 (退出码: $($proc.ExitCode))" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  下载失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "  请手动下载安装 Node.js:" -ForegroundColor Yellow
    Write-Host "  https://nodejs.org/zh-cn" -ForegroundColor Cyan
    exit 1
}
