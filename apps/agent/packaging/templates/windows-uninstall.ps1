# Remove the AI Orchestrator agent startup task (run as Administrator).
$ErrorActionPreference = 'SilentlyContinue'
Stop-ScheduledTask -TaskName 'AIOrchestratorAgent'
Unregister-ScheduledTask -TaskName 'AIOrchestratorAgent' -Confirm:$false
Write-Host 'Removed AI Orchestrator Agent.'
