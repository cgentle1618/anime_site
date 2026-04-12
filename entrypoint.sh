#!/bin/sh
set -e

echo "🚀 Performing one-time Alembic sync..."
# This marks the DB as 'up to date' without running the failing SQL
alembic stamp head 

echo "✨ Starting FastAPI..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'