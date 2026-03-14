"""
main.py
The core orchestration file for the CG1618 Anime Database & Tracker.
Handles app initialization, modular router registration, static file serving, and admin seeding.
"""

import os
import traceback
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

import database
import models
from routers import pages, anime, series, admin, auth
from services.security import get_password_hash

# ==========================================
# SYSTEM INITIALIZATION (V2 UPDATES)
# ==========================================

# Ensure our local static directories exist for V2 Image Downloading
os.makedirs("static/covers", exist_ok=True)

app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description="A professional-grade backend for anime tracking with RBAC and Local Image Serving.",
    version="2.0.0",
)


# --- THE GLOBAL OSCILLOSCOPE (DEBUGGER) ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catches ANY unhandled 500 error, prints the exact Python traceback to GCP Logs,
    and returns the error message directly to the browser screen for instant debugging.
    """
    print(
        f"🔥 [CRITICAL 500 ERROR] Failed at: {request.method} {request.url}", flush=True
    )
    print("👇 --- TRACEBACK BEGIN --- 👇", flush=True)
    traceback.print_exc()
    print("👆 --- TRACEBACK END --- 👆", flush=True)

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "CRITICAL 500 ERROR",
            "error_message": str(exc),
            "endpoint": str(request.url),
        },
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

app.include_router(pages.router)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(anime.router)
app.include_router(series.router)
app.include_router(admin.router)

app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
