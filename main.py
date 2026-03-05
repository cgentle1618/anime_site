"""
main.py
The entry point for the CG1618 Anime Database & Tracker API.
Initializes the FastAPI application and includes modular routers.
"""

from fastapi import FastAPI
import uvicorn

import database
import models
from routers import pages, anime, series, admin

# Initialize the database
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(
    title="CG1618 Anime Database & Tracker",
    description="Backend system for archiving anime metadata with Google Sheets synchronization.",
    version="1.1.0",
)

# NOTE: The /static mount has been removed to prevent the RuntimeError,
# as HTML files are now rendered via Jinja2 from the /templates directory.

# Include modular routers
app.include_router(pages.router)
app.include_router(anime.router)
app.include_router(series.router)
app.include_router(admin.router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
