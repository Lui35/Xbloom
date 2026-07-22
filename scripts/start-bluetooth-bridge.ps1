param(
  [string]$Token = $env:XBLOOM_BRIDGE_TOKEN
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path (Split-Path -Parent $projectRoot) "PyBloom\.venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $pythonPath)) {
  Write-Error "PyBloom's Python environment was not found at $pythonPath"
  exit 1
}

$env:XBLOOM_BRIDGE_SERVER = "1"
if ($Token) {
  $env:XBLOOM_BRIDGE_TOKEN = $Token
}
$env:XBLOOM_DATABASE = Join-Path $projectRoot "xbloom-bridge.db"
$env:XBLOOM_DEVICE_CACHE = Join-Path $projectRoot ".xbloom-device.json"
Write-Host "xBloom Windows Bluetooth bridge listening on port 8767"
Write-Host "Keep this window open while using the Docker app."
& $pythonPath -m uvicorn server.app:app --app-dir $projectRoot --host 0.0.0.0 --port 8767
