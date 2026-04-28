param(
  [string]$Message = "",
  [switch]$SkipPull
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$gitDir = Join-Path $repoRoot ".git"
if (-not (Test-Path $gitDir)) {
  Write-Error "Not a git repository: $repoRoot"
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  $Message = "Update project ($stamp)"
}

if (-not $SkipPull) {
  git pull --rebase
}

git add .

$hasStagedChanges = (git diff --cached --name-only).Length -gt 0
if (-not $hasStagedChanges) {
  Write-Host "No staged changes. Nothing to commit."
  exit 0
}

git commit -m $Message
git push

Write-Host "Done: pushed to origin/main"
