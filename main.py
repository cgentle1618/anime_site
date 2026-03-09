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
from routers import pages, anime, series, admin, auth
from services.security import get_password_hash

app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description="A professional-grade backend for anime tracking with RBAC and Google Sheets sync.",
    version="1.1.0",
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
            admin_pass = os.getenv("ADMIN_PASSWORD", "admin123")

            print("🚀 [System] No admin detected. Seeding master account...")

            # Using the new native hash function
            hashed_pwd = get_password_hash(admin_pass)

            new_admin = models.User(
                username="admin", hashed_password=hashed_pwd, role="admin"
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
app.include_router(auth.router, prefix="/api/v1")  # Auth uses the new v1 prefix
app.include_router(anime.router)  # Resolves to /api/anime
app.include_router(series.router)  # Resolves to /api/series
app.include_router(admin.router)  # Resolves to /api/admin

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
