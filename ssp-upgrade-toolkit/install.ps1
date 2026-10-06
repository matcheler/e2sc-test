# Installs the SSP upgrade kit into ~/.claude (or -Dest for testing).
# Never overwrites upgrade/gotchas.md, which accumulates your own notes.
param([string]$Dest = (Join-Path $env:USERPROFILE '.claude'))

$src = Join-Path $PSScriptRoot 'claude'
$keep = @('upgrade\gotchas.md')

Get-ChildItem $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1)
    $target = Join-Path $Dest $rel
    if ((Test-Path $target) -and ($keep -contains $rel)) { Write-Host "keep   $rel"; return }
    New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
    Copy-Item $_.FullName $target -Force
    Write-Host "copy   $rel"
}

# prerequisite check: the agent-loop kit
$missing = @('commands\setup-project.md','agents\test-author.md','agents\reviewer.md','loop\servers.md') |
    Where-Object { -not (Test-Path (Join-Path $Dest $_)) }
if ($missing) { Write-Warning "Agent-loop kit not found in $Dest. Missing: $($missing -join ', '). Install it first." }
else { Write-Host 'Prerequisites OK. Run /upgrade-project in your project.' }
