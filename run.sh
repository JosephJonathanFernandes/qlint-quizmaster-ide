#!/usr/bin/env bash
set -e
if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
echo "Starting Crucible // Q-Lint IDE at http://127.0.0.1:8000 ..."
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
