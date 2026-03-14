# ==========================================
# STAGE 1: Builder
# ==========================================
FROM python:3.11-slim AS builder
WORKDIR /app

# Install basic system build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a Python Virtual Environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install requirements directly into the venv.
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==========================================
# STAGE 2: Final Runtime
# ==========================================
FROM python:3.11-slim
WORKDIR /app

# Install ONLY the runtime database dependency
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the fully built virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy your application code
COPY . .

# Restore V1 Alembic loop to safely migrate database schema on startup!
CMD for i in 1 2 3 4 5; do alembic upgrade head && break || sleep 3; done && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips="*"