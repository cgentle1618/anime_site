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
    options,
    franchise,
    series,
    anime,
    data_control,
    system,
)
from services.security import get_password_hash

# ==========================================
# SYSTEM INITIALIZATION
# ==========================================

os.makedirs("static/covers", exist_ok=True)

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.
    Executes startup logic (e.g., seeding the admin user) before receiving requests,
    and handles safe shutdown logic upon termination.
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

    yield

    print("🛑 [System] Server shutting down safely.")


# ==========================================
# APPLICATION SETUP
# ==========================================

app = FastAPI(
    title="CG1618 Database & Tracker",
    description="A professional-grade backend for tracking franchises, series, and entries with RBAC.",
    version="1.0.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="static"), name="static")


# ==========================================
# ROUTER REGISTRATION
# ==========================================

app.include_router(pages.router)
app.include_router(auth.router)

app.include_router(options.router)
app.include_router(franchise.router)
app.include_router(series.router)
app.include_router(anime.router)

app.include_router(data_control.router)
app.include_router(system.router)
