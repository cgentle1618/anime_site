"""
main.py
The core orchestration file for the CG1618 Database & Tracker.
Handles app initialization, modular router registration, static file serving,
and database seeding using modern FastAPI lifespan events.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

import database
from database import engine
import models
from routers import (
    pages,
    auth,
    franchise,
    series,
    anime,
    options,
    data_control,
    system,
)
from services.security import get_password_hash

# ==========================================
# SYSTEM INITIALIZATION & LIFESPAN
# ==========================================

# Ensure our local static directories exist for Image Downloading
os.makedirs("static/covers", exist_ok=True)

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Industry Standard: Lifespan Context Manager.
    Executes exactly once before the server starts taking requests.
    Checks if the 'admin' user exists in PostgreSQL; if not, seeds the master account.
    """
    db = database.SessionLocal()
    try:
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

    # Yield control back to FastAPI so the app can run
    yield

    # Anything after the yield runs during server shutdown
    print("🛑 [System] Server shutting down safely.")


# Initialize the FastAPI Application
app = FastAPI(
    title="CG1618 Database & Tracker",
    description="A professional-grade backend for tracking franchises, series, and entries with RBAC.",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount the static directory so FastAPI can serve local images to the UI
app.mount("/static", StaticFiles(directory="static"), name="static")


# ==========================================
# ROUTER REGISTRATION
# ==========================================

# Frontend UI Pages
app.include_router(pages.router)

# Authentication (Login/JWT generation)
app.include_router(auth.router)

# Core V2 Resources (CRUD)
app.include_router(franchise.router)
app.include_router(series.router)
app.include_router(anime.router)
app.include_router(options.router)

# System & Administrative Pipelines
app.include_router(data_control.router)
app.include_router(system.router)
