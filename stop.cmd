@echo off
echo ==^> Stopping PostgreSQL (docker-compose down)
docker-compose --project-directory "%~dp0." down
