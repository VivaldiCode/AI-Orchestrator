# Install the AI Orchestrator agent to run at startup (run as Administrator).
# Uses a Scheduled Task — works with a plain console executable, no service
# wrapper or extra dependencies. The exe reads agent.config.json beside itself.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$exe = Join-Path $dir 'ai-orchestrator-agent.exe'
if (-not (Test-Path $exe)) { throw "ai-orchestrator-agent.exe not found next to this script." }

$action = New-ScheduledTaskAction -Execute $exe -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'AIOrchestratorAgent' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'AIOrchestratorAgent'
Write-Host 'Installed and started AI Orchestrator Agent (Scheduled Task "AIOrchestratorAgent").'
