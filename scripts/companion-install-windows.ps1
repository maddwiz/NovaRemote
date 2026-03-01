param(
  [string]$TargetDir = "$env:USERPROFILE\codex_remote"
)

$ErrorActionPreference = "Stop"

function Ensure-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function New-RandomHex {
  param([int]$Bytes = 48)
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return ($buffer | ForEach-Object { $_.ToString("x2") }) -join ""
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$localSource = Resolve-Path (Join-Path $scriptDir "..\..\codex_remote") -ErrorAction SilentlyContinue

Ensure-Command git
$python = (Get-Command py -ErrorAction SilentlyContinue)
if (-not $python) {
  $python = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $python) {
  throw "Python 3 is required. Install Python and re-run this script."
}

if ($localSource -and (Test-Path (Join-Path $localSource.Path "app"))) {
  Write-Host "Using local codex_remote source: $($localSource.Path)"
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  & robocopy "$($localSource.Path)" "$TargetDir" /MIR /XD .git .venv __pycache__ | Out-Null
} else {
  Write-Host "Local codex_remote source not found; cloning from GitHub."
  if (-not (Test-Path (Join-Path $TargetDir ".git"))) {
    git clone https://github.com/maddwiz/codex_remote.git "$TargetDir"
  } else {
    git -C "$TargetDir" pull --ff-only
  }
}

if (-not (Test-Path (Join-Path $TargetDir "requirements.txt")) -or -not (Test-Path (Join-Path $TargetDir "app"))) {
  throw "Target directory does not look like codex_remote: $TargetDir"
}

Push-Location $TargetDir
try {
  if ($python.Name -eq "py") {
    & py -3 -m venv .venv
  } else {
    & python -m venv .venv
  }

  $venvPython = Join-Path $TargetDir ".venv\Scripts\python.exe"
  & $venvPython -m pip install --upgrade pip
  & $venvPython -m pip install -r requirements.txt
}
finally {
  Pop-Location
}

$configDir = Join-Path $env:USERPROFILE ".codexremote"
$configFile = Join-Path $configDir "config.ps1"
$startScript = Join-Path $configDir "start_codexremote.ps1"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

$token = $null
if (Test-Path $configFile) {
  $existing = Get-Content $configFile -Raw
  $match = [regex]::Match($existing, "\$env:CODEXREMOTE_TOKEN\s*=\s*\"([^\"]+)\"")
  if ($match.Success) {
    $token = $match.Groups[1].Value
  }
}
if (-not $token) {
  $token = New-RandomHex -Bytes 48
}

$configBody = @"
`$env:CODEXREMOTE_TOKEN = "$token"
`$env:CODEXREMOTE_BIND_HOST = "0.0.0.0"
`$env:CODEXREMOTE_BIND_PORT = "8787"
`$env:CODEXREMOTE_TMUX_BIN = "tmux"
`$env:CODEXREMOTE_CODEX_BIN = "codex"
`$env:CODEXREMOTE_CODEX_ARGS = "exec --dangerously-bypass-approvals-and-sandbox"
`$env:CODEXREMOTE_DEFAULT_CWD = "$env:USERPROFILE"
`$env:CODEXREMOTE_AUDIT_LOG = "$configDir\audit.log"
"@
Set-Content -Path $configFile -Value $configBody -Encoding UTF8

$startBody = @"
`$ErrorActionPreference = "Stop"
. "$configFile"
Set-Location "$TargetDir"
& "$TargetDir\.venv\Scripts\python.exe" -m uvicorn app.server:app --host `$env:CODEXREMOTE_BIND_HOST --port `$env:CODEXREMOTE_BIND_PORT
"@
Set-Content -Path $startScript -Value $startBody -Encoding UTF8

Write-Host ""
Write-Host "Codex Remote install complete"
Write-Host "Source: $TargetDir"
Write-Host "Config: $configFile"
Write-Host "Token: $token"
Write-Host ""
Write-Host "Start server: powershell -ExecutionPolicy Bypass -File $startScript"
Write-Host "Health: http://127.0.0.1:8787/health"
Write-Host ""
Write-Host "Use token in NovaRemote server profile bearer token field."

$port = "8787"
$lanIp = $null
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -and $_.IPAddress -ne "127.0.0.1" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress
} catch {
  $lanIp = $null
}
if (-not $lanIp) {
  $lanIp = "127.0.0.1"
}

$encodedName = [uri]::EscapeDataString($env:COMPUTERNAME)
$encodedUrl = [uri]::EscapeDataString("http://${lanIp}:${port}")
$encodedToken = [uri]::EscapeDataString($token)
$deepLink = "novaremote://add-server?name=${encodedName}&url=${encodedUrl}&token=${encodedToken}"

Write-Host ""
Write-Host "Open this link on your phone to connect NovaRemote:"
Write-Host $deepLink
Write-Host ""
Write-Host "Or paste this URL into any QR code generator and scan with NovaRemote."
