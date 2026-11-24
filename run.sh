#!/usr/bin/env bash
# One command: install, build seeded data, start the app.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
[ -d .venv ] || python3 -m venv .venv
[ -x .venv/bin/pip ] || .venv/bin/python -m ensurepip >/dev/null
.venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt
.venv/bin/python -m scripts.generate_data
echo "RideSync: http://localhost:${PORT:-8000}"
exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
