# Package the Windows agent as a zip (exe + default config + install/uninstall).
# Run on Windows AFTER `node build.mjs`. Authenticode signing + an .exe installer
# (Inno Setup/MSIX) are wired in CI with a code-signing certificate.
$ErrorActionPreference = 'Stop'
$agentDir = Split-Path -Parent $PSScriptRoot
$version = if ($env:VERSION) { $env:VERSION } else { '0.1.0' }
$arch = (node -p "process.arch")
$bin = Join-Path $agentDir "build/ai-orchestrator-agent-win32-$arch.exe"
if (-not (Test-Path $bin)) { throw "missing $bin — run: node build.mjs" }

$stage = Join-Path $agentDir "build/win"
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item $bin (Join-Path $stage 'ai-orchestrator-agent.exe')
Copy-Item (Join-Path $agentDir 'packaging/templates/agent.config.json') (Join-Path $stage 'agent.config.json')
Copy-Item (Join-Path $agentDir 'packaging/templates/windows-install.ps1') (Join-Path $stage 'install.ps1')
Copy-Item (Join-Path $agentDir 'packaging/templates/windows-uninstall.ps1') (Join-Path $stage 'uninstall.ps1')

$zip = Join-Path $agentDir "build/ai-orchestrator-agent-$version-win-$arch.zip"
Remove-Item -Force $zip -ErrorAction SilentlyContinue
Compress-Archive -Path "$stage/*" -DestinationPath $zip -Force
Write-Host "built $zip"
