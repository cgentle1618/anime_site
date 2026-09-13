"""
main.py
The core orchestration file for the CG1618 Database & Tracker.
Handles app initialization, modular router registration, static file serving,
and database seeding using modern FastAPI lifespan events.
"""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import database, models
from app.config import settings
from app.database import engine
from app.routers import (
    access_modes,
    account,
    anime,
    anime_movie,
    announcements,
    auth,
    cartoon,
    casting,
    character,
    collection,
    comic,
    community,
    constants,
    content_labels,
    credits,
    data_control,
    form_defaults,
    franchise,
    fx_rates,
    game,
    images,
    manga,
    me_list,
    media_relation,
    meme,
    movie,
    note,
    novel,
    options,
    person,
    plan_next,
    profile,
    publisher,
    quote,
    roles,
    search,
    seasonal,
    series,
    studio,
    system,
    tv_show,
    users,
    watch_order,
)
from app.schema_guard import ensure_schema
from app.services.integrations.image_manager import COVER_DIR, COVER_OWNERS
from app.services.rbac.modes import grant_all_modes_to_existing_accounts
from app.services.rbac.seed import ADMIN_ROLE, ensure_rbac_seed
from app.services.rbac.seed_modes import ensure_access_mode_seed
from app.services.security import get_password_hash

logger = logging.getLogger(__name__)

# ==========================================
# SYSTEM INITIALIZATION
# ==========================================

# One folder per owner table: a downloaded cover is stored at
# static/covers/<owner_type>/<system_id>.jpg, since a system_id alone is
# ambiguous across tables. Uploaded images are content-addressed instead,
# under static/library/ (see below).
for _owner in COVER_OWNERS:
    os.makedirs(os.path.join(COVER_DIR, _owner), exist_ok=True)
# static/quotes/ holds the pre-existing quote images, referenced by bare
# filename. Newly uploaded quote images go to the library instead.
os.makedirs("static/quotes", exist_ok=True)

# Uploaded library images and their thumbnails, content-addressed by
# checksum - see app/services/integrations/image_library.py.
os.makedirs("static/library/thumbs", exist_ok=True)

ensure_schema(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.
    Executes startup logic (e.g., seeding the admin user) before receiving requests,
    and handles safe shutdown logic upon termination.
    """
    # First, and outside the try below: that block swallows every exception
    # into a printed message, which is right for a seeding hiccup and wrong
    # for this. A refusal to start has to actually stop the start. It also
    # runs before the admin account is seeded from settings.admin_password,
    # which would otherwise bake the example password into the database.
    settings.validate_secrets()

    db = database.SessionLocal()
    try:
        # Roles first: the admin user below is created holding one, and every
        # request resolves against them. Idempotent, so this is safe on every
        # boot against an already-seeded database.
        ensure_rbac_seed(db)
        # Access modes next, and beside the roles rather than elsewhere: the
        # two axes are resolved together on every request, so the next reader
        # should find both seeds in one place. Idempotent for the same reason
        # ensure_rbac_seed is.
        ensure_access_mode_seed(db)
        # And make sure every existing account HOLDS a mode. A signed-in
        # caller with no mode resolves the empty object set - fail-closed,
        # and correct - so on a database built by create_all rather than by
        # Alembic (schema_guard's fresh-install path) the seeded admin would
        # otherwise log in and see nothing. Idempotent and all-or-nothing per
        # account: anyone already holding a mode is left alone, so this does
        # not fight the future rule that a NEW account gets `safe` only.
        grant_all_modes_to_existing_accounts(db)
        db.commit()
        admin_role = (
            db.query(models.Role).filter(models.Role.name == ADMIN_ROLE).first()
        )

        admin_user = (
            db.query(models.User).filter(models.User.username == "admin").first()
        )

        if admin_user and admin_user.role_id is None and admin_role:
            # A row that predates migration A, or one restored from a backup.
            admin_user.role_id = admin_role.system_id
            db.commit()

        if not admin_user:
            admin_pass = settings.admin_password
            print("🚀 [System] No admin detected. Seeding master account...")

            hashed_pwd = get_password_hash(admin_pass)
            new_admin = models.User(
                username="admin",
                hashed_password=hashed_pwd,
                role_id=admin_role.system_id,
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected server error occurred."},
    )

# Serve Vite build output (production only — frontend_dist/ is created by docker build)
FRONTEND_DIST = Path("frontend_dist")
if FRONTEND_DIST.exists():
    app.mount(
        "/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="vite-assets"
    )


# ==========================================
# ROUTER REGISTRATION
# ==========================================

app.include_router(auth.router)

app.include_router(options.router)
app.include_router(constants.router)
app.include_router(fx_rates.router)
app.include_router(collection.router)
app.include_router(franchise.router)
app.include_router(series.router)
app.include_router(anime.router)
app.include_router(anime_movie.router)
app.include_router(cartoon.router)
app.include_router(movie.router)
app.include_router(tv_show.router)
app.include_router(manga.router)
app.include_router(note.router)
app.include_router(novel.router)
app.include_router(comic.router)
app.include_router(game.router)
app.include_router(watch_order.router)
app.include_router(media_relation.router)
app.include_router(plan_next.router)
app.include_router(quote.router)
app.include_router(meme.router)
app.include_router(seasonal.router)
app.include_router(search.router)

app.include_router(announcements.router)
app.include_router(images.router)
app.include_router(form_defaults.router)

app.include_router(data_control.router)
app.include_router(system.router)
app.include_router(person.router)
app.include_router(character.router)
app.include_router(publisher.router)
app.include_router(studio.router)
app.include_router(credits.router)
app.include_router(casting.router)
app.include_router(roles.router)
app.include_router(access_modes.router)
app.include_router(users.router)
app.include_router(account.router)
app.include_router(profile.router)
app.include_router(community.router)
app.include_router(me_list.router)
app.include_router(content_labels.router)


# ==========================================
# SPA CATCH-ALL (must be last)
# ==========================================


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """Serves the React SPA for all non-API routes."""
    index = FRONTEND_DIST / "index.html"
    if not index.exists():
        return {"detail": "Frontend not built. Run: cd frontend && npm run build"}
    # Resolve and confine to the dist directory: ``full_path`` is
    # user-controlled and ``..%2F`` segments would otherwise read any file
    # on the server (e.g. /..%2F.env).
    dist_root = FRONTEND_DIST.resolve()
    candidate = (dist_root / full_path).resolve()
    if (
        candidate != dist_root
        and candidate.is_relative_to(dist_root)
        and candidate.is_file()
    ):
        return FileResponse(candidate)
    return FileResponse(index)
