# Crucible // Q-Lint One-Command Windows Launcher
if (-not (Test-Path ".venv")) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
    .venv\Scripts\pip.exe install -r requirements.txt
}
Write-Host "Starting Crucible // Q-Lint IDE at http://127.0.0.1:8000 ..." -ForegroundColor Green
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
