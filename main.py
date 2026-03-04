"""
main.py
The entry point for the CG1618 Anime Database & Tracker API.
Initializes the FastAPI application, mounts static assets,
and includes all modular routers for a clean architecture.
"""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn

import database
import models
from routers import pages, anime, series, admin

# Initialize the database (Ensures all SQLAlchemy ORM models are registered as actual tables)
models.Base.metadata.create_all(bind=database.engine)

# Initialize the FastAPI application with updated title and descriptive metadata
app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description=(
        "An advanced backend system for archiving anime metadata and tracking personal "
        "viewing progress. Features robust synchronization between a PostgreSQL database "
        "and Google Sheets for seamless data management."
    ),
    version="1.0.0",
)

# Mount the 'static' directory to serve frontend HTML, CSS, and JS files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include modular routers to keep the application architecture clean and isolated
app.include_router(pages.router)
app.include_router(anime.router)
app.include_router(series.router)
app.include_router(admin.router)

if __name__ == "__main__":
    # Run the server using Uvicorn when executed directly (useful for local development)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
