<#
  Agent loop kit installer (Windows, PowerShell 7+).
  Copies the kit into %USERPROFILE%\.claude and registers the lock hook and the SSH guard hook in settings.json.
  Existing files are kept unless -Force is given. A backup of settings.json is written first.

  Usage (from the agent-loop-toolkit folder):
    pwsh -File .\install.ps1            # install, keep anything you already have
    pwsh -File .\install.ps1 -Force     # overwrite kit files with this version
#>
param([switch]$Force, [string]$Dest = (Join-Path $HOME ".claude"))
$ErrorActionPreference = 'Stop'
$kit = Join-Path $PSScriptRoot 'claude'
$dest = $Dest
if (-not (Test-Path $kit)) { throw "Run this from the agent-loop-toolkit folder (missing $kit)." }

# Prerequisites
$missing = @()
foreach ($tool in 'node', 'npx', 'curl', 'ssh') { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { $missing += $tool } }
if (-not (Get-Command svn -ErrorAction SilentlyContinue)) { $missing += 'svn (install TortoiseSVN with "command line client tools")' }
if ($missing) { Write-Warning ("Missing on PATH: " + ($missing -join ', ') + ". Install them before using the loop.") }

# Copy files
$copied = 0; $kept = 0
Get-ChildItem $kit -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($kit.Length).TrimStart('\', '/')
  $target = Join-Path $dest $rel
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  # Personal files: never overwritten, even with -Force (they hold your projects and client rules).
  $personal = $rel -in @('loop\servers.md', 'loop\always-human.md')
  if ((Test-Path $target) -and ($personal -or -not $Force)) { $kept++ } else { Copy-Item $_.FullName $target -Force; $copied++ }
}
Write-Host "Copied $copied file(s) into $dest; kept $kept existing file(s)$(if ($kept -and -not $Force) {' (use -Force to overwrite)'})."

# Register the PreToolUse hook
$settingsPath = Join-Path $dest 'settings.json'
$hookPath = (Join-Path $dest 'hooks\protect-locked-tests.js') -replace '\\', '/'
$hookCmd = "node `"$hookPath`""
$matcher = 'Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell'
if (Test-Path $settingsPath) {
  Copy-Item $settingsPath "$settingsPath.bak-$(Get-Date -Format yyyyMMddHHmmss)"
  try { $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable }
  catch { throw "settings.json is not valid JSON; fix it first (a backup was written next to it). $_" }
} else { $settings = @{} }
if ($null -eq $settings) { $settings = @{} }
if (-not $settings.ContainsKey('hooks')) { $settings['hooks'] = @{} }
if (-not $settings['hooks'].ContainsKey('PreToolUse')) { $settings['hooks']['PreToolUse'] = @() }
$already = $settings['hooks']['PreToolUse'] | Where-Object { ($_.hooks | ForEach-Object { $_.command }) -match 'protect-locked-tests' }
if ($already) { Write-Host 'Lock hook already registered.' }
else {
  $settings['hooks']['PreToolUse'] = @($settings['hooks']['PreToolUse']) + @(@{ matcher = $matcher; hooks = @(@{ type = 'command'; command = $hookCmd }) })
  Write-Host 'Lock hook registered.'
}
$sshHookPath = (Join-Path $dest 'hooks\loop-ssh-guard.js') -replace '\\', '/'
$sshAlready = $settings['hooks']['PreToolUse'] | Where-Object { ($_.hooks | ForEach-Object { $_.command }) -match 'loop-ssh-guard' }
if ($sshAlready) { Write-Host 'SSH guard hook already registered.' }
else {
  $settings['hooks']['PreToolUse'] = @($settings['hooks']['PreToolUse']) + @(@{ matcher = 'Bash'; hooks = @(@{ type = 'command'; command = "node `"$sshHookPath`"" }) })
  Write-Host 'SSH guard hook registered.'
}
# Allow ssh/scp without prompts; the SSH guard hook still forces a prompt for reloads, populate, p2c and restarts.
if (-not $settings.ContainsKey('permissions')) { $settings['permissions'] = @{} }
$allow = @($settings['permissions']['allow'])
foreach ($rule in 'Bash(ssh *)', 'Bash(scp *)') { if ($allow -notcontains $rule) { $allow += $rule } }
$settings['permissions']['allow'] = @($allow | Where-Object { $_ })
# Allow the loop's read-only commands and the gate without a prompt (merged, never removed)
$loopAllow = @(
  'Bash(bash ~/.claude/scripts/loop-verify.sh *)',
  'Bash(node ~/.claude/scripts/jira.js get *)',
  'Bash(node ~/.claude/scripts/jira.js transitions *)',
  'Bash(svn status)', 'Bash(svn status *)', 'Bash(svn diff)', 'Bash(svn diff *)', 'Bash(svn log *)', 'Bash(svn info *)',
  'Read(~/.claude/**)'
)
if (-not $settings.ContainsKey('permissions')) { $settings['permissions'] = @{} }
if (-not $settings['permissions'].ContainsKey('allow')) { $settings['permissions']['allow'] = @() }
$added = @($loopAllow | Where-Object { $_ -notin $settings['permissions']['allow'] })
$settings['permissions']['allow'] = @($settings['permissions']['allow']) + $added
Write-Host "Added $($added.Count) allow rule(s) for the loop's read-only commands."
if (-not $settings.ContainsKey('env')) { $settings['env'] = @{} }
$gitBash = 'C:\Program Files\Git\bin\bash.exe'
if (-not $settings['env'].ContainsKey('CLAUDE_CODE_GIT_BASH_PATH') -and (Test-Path $gitBash)) { $settings['env']['CLAUDE_CODE_GIT_BASH_PATH'] = $gitBash }
$settings | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8NoBOM $settingsPath

# Self-test the hook
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("loopkit-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force (Join-Path $tmp '.loop\X-1') | Out-Null
New-Item -ItemType File (Join-Path $tmp '.loop\X-1\tests.locked') | Out-Null
$payload = @{ cwd = $tmp; tool_name = 'Edit'; tool_input = @{ file_path = (Join-Path $tmp 'e2sc-ui_tests\tests\locked\X-1\a.spec.ts') } } | ConvertTo-Json -Compress
$payload | node $hookPath 2>$null; $code = $LASTEXITCODE
Remove-Item $tmp -Recurse -Force
if ($code -eq 2) { Write-Host 'Hook self-test passed (locked edit blocked).' } else { Write-Warning "Hook self-test FAILED (exit $code). Locked tests are not protected." }

Write-Host ''
Write-Host 'Next: restart Claude Code, open your project folder, and run /setup-project'
