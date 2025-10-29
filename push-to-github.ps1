# push-to-github.ps1
param(
  [string]$RepoUrl = "https://github.com/kyd888/https-github.com-kyd888-NC-website-3.git",
  [string]$Branch = "main"
)

# Fail on errors
$ErrorActionPreference = "Stop"

Write-Host "==> Preparing repository"

if (-not (Test-Path ".git")) {
  Write-Host "Initializing new git repository"
  git init
} else {
  Write-Host "Git repo already exists, reusing it"
}

# Ensure git knows who you are (only if not already configured globally)
# git config user.name  "Your Name"
# git config user.email "you@example.com"

Write-Host "==> Adding files"
git add .

Write-Host "==> Creating commit (or amending existing)"
git commit --allow-empty -m "Prepare project for Render deployment"

Write-Host "==> Setting remote"
if ((git remote).Trim() -ne "") {
  Write-Host "Remote(s) found. Updating 'origin' -> $RepoUrl"
  git remote remove origin 2>$null
}
git remote add origin $RepoUrl

Write-Host "==> Pushing to GitHub"
git push -u origin $Branch

Write-Host ""
Write-Host "All done! Repository pushed to $RepoUrl on branch $Branch."
Write-Host "Next steps:"
Write-Host "  1. In Render, create a new service from this repo (it contains render.yaml)."
Write-Host "  2. Set env vars (STRIPE_SECRET_KEY, ADMIN_KEY, FRONTEND_ORIGIN, etc.)."
Write-Host "  3. Trigger a deploy."
