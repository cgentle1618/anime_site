"""
main.py
The core orchestration file for the CG1618 Anime Database & Tracker.
Handles app initialization, modular router registration, and admin seeding.
"""

import os
from fastapi import FastAPI
import uvicorn

import database
import models
from routers import pages, anime, series, admin
from services.security import get_password_hash

# Initialize Database Schema
# In a production environment with frequent changes, we would use Alembic migrations.
# For now, this ensures our tables (including the new 'users' table) exist.
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description="A professional-grade backend for anime tracking with RBAC and Google Sheets sync.",
    version="1.2.0",
)


@app.on_event("startup")
async def seed_admin_user():
    """
    Industry Standard: Automatic Data Seeding.
    On startup, check if any user exists. If not, create the master admin
    using credentials provided in the .env file.
    """
    db = database.SessionLocal()
    try:
        # Check if the 'admin' user already exists
        admin_user = (
            db.query(models.User).filter(models.User.username == "admin").first()
        )

        if not admin_user:
            # Fallback to 'admin123' only if .env is missing the variable
            admin_pass = os.getenv("ADMIN_PASSWORD", "admin123")

            print("🚀 [System] No admin detected. Seeding master account...")
            new_admin = models.User(
                username="admin",
                hashed_password=get_password_hash(admin_pass),
                role="admin",
            )
            db.add(new_admin)
            db.commit()
            print("✅ [System] Admin user 'admin' created successfully.")
        else:
            print("ℹ️ [System] Admin account verified.")

    except Exception as e:
        print(f"❌ [System] Critical Error during seeding: {e}")
    finally:
        db.close()


# ==========================================
# ROUTER INCLUSION
# ==========================================

# Page routes (Jinja2 Templates)
app.include_router(pages.router)

# API routes (JSON Endpoints)
app.include_router(anime.router, prefix="/api/v1")
app.include_router(series.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")

# Note: We do not mount /static anymore.
# All CSS/JS is handled via CDNs or internal styles in templates.

if __name__ == "__main__":
    # Start the server locally
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
