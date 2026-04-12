#!/bin/sh
set -e  # Exit immediately if a command fails

echo "🚀 Running Alembic Migrations..."
alembic upgrade head

echo "✨ Starting Uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'