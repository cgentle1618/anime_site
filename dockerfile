# ==========================================
# STAGE 1: Builder
# ==========================================
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system dependencies required for compiling Python packages (psycopg2, bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Build wheels for all dependencies to transfer to the final stage
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# ==========================================
# STAGE 2: Final Runtime
# ==========================================
FROM python:3.11-slim

WORKDIR /app

# Install only the runtime system dependencies for PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-compiled wheels from the builder stage
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .

# Install the wheels
RUN pip install --no-cache /wheels/*

# Copy the application source code securely (ignores files in .dockerignore)
COPY . .

# Cloud Run defaults to port 8080
EXPOSE 8080

# Run migrations, THEN start the server
CMD alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8080 --proxy-headers --forwarded-allow-ips="*"