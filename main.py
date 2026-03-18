"""
main.py
The core orchestration file for the CG1618 Anime Database & Tracker.
Handles app initialization, modular router registration, static file serving, and admin seeding.
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn

import database
import models
from routers import pages, anime, series, options, system, auth
from services.security import get_password_hash

# ==========================================
# SYSTEM INITIALIZATION
# ==========================================

# Ensure our local static directories exist for V2 Image Downloading
os.makedirs("static/covers", exist_ok=True)

app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description="A professional-grade backend for anime tracking with RBAC and Local Image Serving.",
    version="2.0.0",
)

# Mount the static directory so FastAPI can serve local images
app.mount("/static", StaticFiles(directory="static"), name="static")


# ==========================================
# STARTUP EVENTS
# ==========================================


@app.on_event("startup")
async def seed_admin_user():
    """
    Industry Standard: Automatic Data Seeding.
    On startup, check if any user exists. If not, create the master admin.
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

# Frontend Pages
app.include_router(pages.router)

# Authentication
app.include_router(auth.router, prefix="/api/v1")

# V2 Resource-Based Routers
app.include_router(anime.router)
app.include_router(series.router)
app.include_router(options.router)
app.include_router(system.router)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
