# ==========================================
# STAGE 1: Builder
# ==========================================
FROM python:3.11-slim AS builder
WORKDIR /app

# Install system build dependencies
# Added libffi-dev which is strictly required to build cryptography/cffi wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    python3-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*
    
# Upgrade pip to ensure full compatibility with modern wheel building standards
RUN pip install --upgrade pip

COPY requirements.txt .

# Build wheels for all sub-dependencies
RUN pip wheel --no-cache-dir --wheel-dir /app/wheels -r requirements.txt

# ==========================================
# STAGE 2: Final Runtime
# ==========================================
FROM python:3.11-slim
WORKDIR /app

# Install ONLY runtime dependencies to keep container ultra-lightweight
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built wheels and requirements from the builder stage
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .

# Safely install strictly from the local wheels folder without reaching out to PyPI again
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt

# Copy application code
COPY . .

# FIXED: Removed Alembic from the startup command to prevent Database Locks from 
# hanging the deployment. We boot Uvicorn directly so the app comes online instantly.
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"