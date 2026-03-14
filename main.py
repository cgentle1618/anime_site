"""
main.py
The core orchestration file for the CG1618 Anime Database & Tracker.
Handles app initialization, modular router registration, static file serving, and admin seeding.
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
import uvicorn

import database
import models
from routers import pages, anime, series, admin, auth
from services.security import get_password_hash

# ==========================================
# SYSTEM INITIALIZATION (V2 UPDATES)
# ==========================================

# Ensure our local static directories exist for V2 Image Downloading
# This prevents crashes when the ImageManager tries to save new covers
os.makedirs("static/covers", exist_ok=True)

app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description="A professional-grade backend for anime tracking with RBAC and Local Image Serving.",
    version="2.0.0",
)

# Mount the static directory so FastAPI can serve local images, CSS, and JS to the frontend
# Any file in static/covers/123.jpg will be accessible at http://yourdomain/static/covers/123.jpg
app.mount("/static", StaticFiles(directory="static"), name="static")


# ==========================================
# STARTUP EVENTS
# ==========================================


@app.on_event("startup")
async def seed_admin_user():
    """
    Industry Standard: Automatic Data Seeding & Schema Updating.
    On startup, check if tables exist/need altering, and ensure the master admin exists.
    """

    # 1. Create any brand NEW tables (like system_options). This safely ignores existing tables.
    models.Base.metadata.create_all(bind=database.engine)

    # 2. V2 SAFE COLUMN INJECTION (No data deletion!)
    # This uses standard PostgreSQL commands to safely add the missing V2 columns
    # to your existing V1 tables while preserving all your data.
    with database.engine.begin() as conn:
        # Add new columns to Anime Series
        conn.execute(
            text(
                "ALTER TABLE anime_series ADD COLUMN IF NOT EXISTS series_alt_name VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_series ADD COLUMN IF NOT EXISTS series_expectation VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_series ADD COLUMN IF NOT EXISTS favorite_3x3_slot INTEGER;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_series ADD COLUMN IF NOT EXISTS rating_series VARCHAR;"
            )
        )

        # Add new columns to Anime Entries
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS mal_rating VARCHAR;"
            )
        )
        conn.execute(
            text("ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS mal_rank VARCHAR;")
        )
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS cover_image_file VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS source_other VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS source_other_link VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS anime_alt_name VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS series_season_roman VARCHAR;"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE anime_entries ADD COLUMN IF NOT EXISTS series_season_cn VARCHAR;"
            )
        )

        # 3. V2 CLEANUP: DROP DEPRECATED COLUMNS
        # Safely removes old V1 columns that are no longer needed in the V2 architecture.
        # The 'IF EXISTS' prevents crashes on future restarts once they are already deleted.
        conn.execute(
            text("ALTER TABLE anime_entries DROP COLUMN IF EXISTS release_date;")
        )
        conn.execute(text("ALTER TABLE anime_series DROP COLUMN IF EXISTS alt_name;"))
        # We also drop alt_name from anime_entries if you originally had it there in V1 before renaming to anime_alt_name
        conn.execute(text("ALTER TABLE anime_entries DROP COLUMN IF EXISTS alt_name;"))

    # 4. Admin Seeding
    db = database.SessionLocal()
    try:
        # Check if the 'admin' user already exists
        admin_user = (
            db.query(models.User).filter(models.User.username == "admin").first()
        )

        if not admin_user:
            admin_pass = os.getenv("ADMIN_PASSWORD", "admin123")

            print("🚀 [System] No admin detected. Seeding master account...")

            # Using the native hash function
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
app.include_router(auth.router, prefix="/api/v1")  # Auth uses the v1 prefix
app.include_router(anime.router)  # Resolves to /api/anime
app.include_router(series.router)  # Resolves to /api/series
app.include_router(admin.router)  # Resolves to /api/admin
