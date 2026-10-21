param(
    [Parameter(Mandatory = $true)][string]$WrapperPath,
    [string]$InstallDirectory = (Split-Path $PSScriptRoot -Parent)
)
$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this installer as Administrator on Windows Server.' }
$installRoot = (Resolve-Path -LiteralPath $InstallDirectory).Path
$wrapperSource = (Resolve-Path -LiteralPath $WrapperPath).Path
if ($installRoot -match '\\OneDrive\\') { throw 'Use a local server installation directory outside OneDrive.' }
if (-not (Test-Path -LiteralPath (Join-Path $installRoot '.env'))) { throw 'Configure .env and initialize the database before installing the service.' }
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'server/start.cjs'))) { throw 'The target does not contain the server bundle.' }
if (Get-Service -Name 'MilitaryAffairsServer' -ErrorAction SilentlyContinue) { throw 'The service already exists. Stop it and replace application files for an update; do not reinstall it.' }
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$serviceExecutable = Join-Path $installRoot 'MilitaryAffairsServer.exe'
Copy-Item -LiteralPath $wrapperSource -Destination $serviceExecutable
[xml]$serviceXml = Get-Content -LiteralPath (Join-Path $installRoot 'server/service.xml.example') -Raw
$serviceXml.service.executable = $nodeExecutable
$serviceXml.Save((Join-Path $installRoot 'MilitaryAffairsServer.xml'))
$logDirectory = Join-Path $installRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
& icacls.exe $installRoot /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant service read permissions.' }
& icacls.exe $logDirectory /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to grant log write permissions.' }
$environmentFile = Join-Path $installRoot '.env'
$environmentAcl = New-Object System.Security.AccessControl.FileSecurity
$environmentAcl.SetAccessRuleProtection($true, $false)
foreach ($entry in @(@('S-1-5-18', 'FullControl'), @('S-1-5-32-544', 'FullControl'), @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'FullControl'), @('S-1-5-19', 'Read'))) {
    $sid = New-Object Security.Principal.SecurityIdentifier($entry[0])
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, $entry[1], 'Allow')
    $environmentAcl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $environmentFile -AclObject $environmentAcl
& $serviceExecutable install
if ($LASTEXITCODE -ne 0) { throw 'Service installation failed.' }
Write-Host 'Service installed. Grant LocalService access to configured TLS files and write access to BACKUP_DIRECTORY, then start MilitaryAffairsServer.'
