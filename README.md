⛩️ Anime Tracker (Work in Progress)⚠️ Project Status: On-going / Unfinished > This project is currently under active development. While the core infrastructure, database models, and initial frontend views are implemented, several features (like the Jikan API integration, admin dashboard, and production deployment) are still in the roadmap phases.A custom-built, high-performance web application designed to track, manage, and visualize my personal anime watch history.This project bridges the gap between the flexibility of manual spreadsheet tracking and the performance of a modern web application. It uses a decoupled architecture where a Google Sheet acts as the absolute source of truth, a local PostgreSQL database acts as a high-speed read-replica, and a FastAPI backend serves the data to a sleek TailwindCSS frontend.✨ Current & Planned FeaturesGoogle Sheets as a CMS: Manage data easily via Google Sheets without needing a complex admin panel for basic data entry.ETL Data Syncing: A robust Python script (sheets_sync.py) pulls data from published CSVs, cleanses NaN values, and performs bulk Upserts to prevent duplicates using UUIDs (system_id).Relational Data Structure: Groups individual anime seasons/movies (child records) under overarching Franchise/Series names (parent records) for an organized library view.Fast REST API: Powered by FastAPI and SQLAlchemy for rapid data retrieval.Modern UI: A responsive, dark-mode themed frontend built with Vanilla HTML, JavaScript, and Tailwind CSS.(Planned) MAL/Jikan API Enrichment: Automated fetching of cover art, synopses, and global ratings.(Planned) Dual-Write Architecture: Updating watch progress directly from the UI will instantly update the database cache and silently update the master Google Sheet.🏗️ Architecture & Tech StackBackend & ETLPython 3.xFastAPI: High-performance async web framework for building the REST API.SQLAlchemy & Pydantic: For ORM database modeling and strict JSON data validation/serialization.Pandas & Psycopg2: Used in the ETL pipeline for fast data manipulation and database insertion.Database & InfrastructurePostgreSQL 15: The core relational database.Docker & Docker Compose: Containerizes the PostgreSQL instance with volume mapping for persistent local data.FrontendVanilla HTML5 & JavaScript (ES6+)Tailwind CSS: For utility-first, rapid, and responsive UI styling.🗄️ Data DefinitionData is structured to prevent corruption and handle edge cases during manual sorting. Every row utilizes a generated UUID (system_id).Anime Series Table (Parent): Stores franchise-level metadata (series_en, series_cn, rating_series).Anime Table (Child): Stores granular season/movie data, watch progress, episode counts, release dates, and studio info. Linked to the parent via series_en.🚀 Setup & Installation (Local Development)1. PrerequisitesDocker Desktop installed and running.Python 3.9+ installed.Google Sheets published as CSVs (One for Series, one for individual Anime).2. Environment VariablesCreate a .env file in the root directory and configure your credentials:# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=anime_site_db
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/anime_site_db

# Google Sheets CSV Export URLs

SHEET_SERIES_URL="[https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_1](https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_1)"
SHEET_ANIME_URL="[https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_2](https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_2)" 3. Start the DatabaseInitialize the PostgreSQL container using Docker Compose:docker-compose up -d
(To stop the database, run: docker-compose down)4. Install Python DependenciesIt is recommended to use a virtual environment:python -m venv venv
source venv/bin/activate # On Windows: venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy psycopg2-binary pandas pydantic python-dotenv 5. Run the Initial Data SyncPopulate your PostgreSQL database from your Google Sheets:python sheets_sync.py 6. Start the Backend ServerLaunch the FastAPI development server:uvicorn main:app --reload
The API will be available at http://localhost:8000.The frontend application can be viewed by navigating to http://localhost:8000/static/index.html.📂 Repository Structure📦 anime-tracker
┣ 📂 static/ # Frontend assets
┃ ┣ 📜 index.html # Dashboard View
┃ ┣ 📜 library.html # Nested Series/Anime Library View
┃ ┣ 📜 app.js # Frontend logic and API calls
┃ ┗ 📜 style.css # Tailwind CSS directives
┣ 📜 main.py # FastAPI application and route definitions
┣ 📜 database.py # SQLAlchemy setup and ORM models
┣ 📜 schemas.py # Pydantic models for request/response validation
┣ 📜 sheets_sync.py # ETL pipeline script (Google Sheets -> Postgres)
┣ 📜 docker-compose.yml # Docker configuration for PostgreSQL
┣ 📜 .gitignore
┗ 📜 README.md
🗺️ Execution Roadmap[x] Phase 0-1: Git setup, Docker PostgreSQL initialization, and basic FastAPI backend.[x] Phase 2: Building the Google Sheets ETL pipeline to fetch and clean data (sheets_sync.py).[x] Phase 3-4: Developing FastAPI endpoints and the frontend UI (Dashboard and Library views) with TailwindCSS.[ ] Phase 5: Integrating the Jikan (MyAnimeList) API for automated data fetching (Cover images, scores) and background scheduling.[ ] Phase 6-7: Creating granular detail pages, integrating dual-write logic (UI -> DB & Google Sheets), and building an admin dashboard for handling edge cases.[ ] Phase 8: Containerizing the application and deploying it to production using Google Cloud Platform (Cloud SQL, Cloud Run/Compute).
