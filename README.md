<a id="readme-top"></a>

<br />
<div align="center">
  <h1 align="center">⛩️ Anime Tracker</h1>

  <p align="center">
    A custom-built, high-performance web application designed to track, manage, and visualize personal anime watch history.
    <br />
    <br />
    <a href="#about-the-project"><strong>Explore the details »</strong></a>
  </p>
</div>

> [!WARNING]
> **Project Status: On-going / Unfinished**
> This project is currently under active development. While the core infrastructure, database models, and initial frontend views are implemented, several features (like the Jikan API integration, admin dashboard, and production deployment) are still in the roadmap phases.

---

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#features">Features</a></li>
    <li><a href="#architecture--tech-stack">Architecture & Tech Stack</a></li>
    <li><a href="#data-definition">Data Definition</a></li>
    <li><a href="#setup--installation">Setup & Installation</a></li>
    <li><a href="#repository-structure">Repository Structure</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
  </ol>
</details>

---

## About The Project

This project bridges the gap between the flexibility of manual spreadsheet tracking and the performance of a modern web application. It uses a decoupled architecture where a Google Sheet acts as the absolute source of truth, a local PostgreSQL database acts as a high-speed read-replica, and a FastAPI backend serves the data to a sleek TailwindCSS frontend.

## Features

### Current Features

- **Google Sheets as a CMS:** Manage data easily via Google Sheets without needing a complex admin panel for basic data entry.
- **ETL Data Syncing:** A robust Python script (`sheets_sync.py`) pulls data from published CSVs, cleanses NaN values, and performs bulk Upserts to prevent duplicates using UUIDs (`system_id`).
- **Relational Data Structure:** Groups individual anime seasons/movies (child records) under overarching Franchise/Series names (parent records) for an organized library view.
- **Fast REST API:** Powered by FastAPI and SQLAlchemy for rapid data retrieval.
- **Modern UI:** A responsive, dark-mode themed frontend built with Vanilla HTML, JavaScript, and Tailwind CSS.

### Planned Features

- **MAL/Jikan API Enrichment:** Automated fetching of cover art, synopses, and global ratings.
- **Dual-Write Architecture:** Updating watch progress directly from the UI will instantly update the database cache and silently update the master Google Sheet.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Architecture & Tech Stack

### Backend & ETL

- **Python 3.x**
- **FastAPI:** High-performance async web framework for building the REST API.
- **SQLAlchemy & Pydantic:** For ORM database modeling and strict JSON data validation/serialization.
- **Pandas & Psycopg2:** Used in the ETL pipeline for fast data manipulation and database insertion.

### Database & Infrastructure

- **PostgreSQL 15:** The core relational database.
- **Docker & Docker Compose:** Containerizes the PostgreSQL instance with volume mapping for persistent local data.

### Frontend

- **Vanilla HTML5 & JavaScript (ES6+)**
- **Tailwind CSS:** For utility-first, rapid, and responsive UI styling.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Data Definition

Data is structured to prevent corruption and handle edge cases during manual sorting. Every row utilizes a generated UUID (`system_id`).

- **Anime Series Table (Parent):** Stores franchise-level metadata (`series_en`, `series_cn`, `rating_series`).
- **Anime Table (Child):** Stores granular season/movie data, watch progress, episode counts, release dates, and studio info. Linked to the parent via `series_en`.

---

## Setup & Installation

### 1. Prerequisites

- Docker Desktop installed and running.
- Python 3.9+ installed.
- Google Sheets published as CSVs (One for Series, one for individual Anime).

### 2. Environment Variables

Create a `.env` file in the root directory and configure your credentials:

````env
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=anime_site_db
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/anime_site_db

# Google Sheets CSV Export URLs
SHEET_SERIES_URL="[https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_1](https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_1)"
SHEET_ANIME_URL="[https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_2](https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/export?format=csv&gid=YOUR_GID_2)"


### 3. Start the Database

Initialize the PostgreSQL container using Docker Compose:

```bash
docker-compose up -d

### 4. Install Python Dependencies

It is recommended to use a virtual environment:

```bash
python -m venv venv
source venv/bin/activate # On Windows: venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy psycopg2-binary pandas pydantic python-dotenv

### 5. Run the Initial Data Sync

Populate your PostgreSQL database from your Google Sheets:

```bash
python sheets_sync.py

### 6. Start the Backend Server

Launch the FastAPI development server:

```bash
uvicorn main:app --reload

## Repository Structure

```text
📦 anime-tracker
┣ 📂 static/               # Frontend assets
┃ ┣ 📜 index.html          # Dashboard View
┃ ┣ 📜 library.html        # Nested Series/Anime Library View
┃ ┣ 📜 app.js              # Frontend logic and API calls
┃ ┗ 📜 style.css           # Tailwind CSS directives
┣ 📜 main.py               # FastAPI application and route definitions
┣ 📜 database.py           # SQLAlchemy setup and ORM models
┣ 📜 schemas.py            # Pydantic models for request/response validation
┣ 📜 sheets_sync.py        # ETL pipeline script (Google Sheets -> Postgres)
┣ 📜 docker-compose.yml    # Docker configuration for PostgreSQL
┣ 📜 .gitignore
┗ 📜 README.md


## Roadmap

### Phase 1: Foundation & Infrastructure
- Initialize Git repository and version control system.
- Configure Docker Compose to manage the PostgreSQL database instance.
- Set up persistent volume mapping for database data storage to ensure data integrity between restarts.
- Establish the base FastAPI directory structure and environment configuration, including `.env` management.

### Phase 2: ETL Pipeline Development
- Develop `sheets_sync.py` for fetching Google Sheets data published as CSVs.
- Implement robust data cleansing logic to handle `NaN` values, sanitize strings, and manage type inconsistencies.
- Create bulk upsert operations to synchronize the Google Sheet source of truth with the PostgreSQL database using `system_id` UUIDs to prevent duplicate entries.

### Phase 3: Backend Implementation
- Define SQLAlchemy ORM models for Anime Series (parent records for franchise-level metadata) and individual Anime records (child records for granular data).
- Create Pydantic schemas for strict request validation and serialization to ensure consistent data structures.
- Implement FastAPI REST endpoints to serve data queries, including search, filter, and retrieval operations from the database.

### Phase 4: Frontend Development
- Develop the main Dashboard view for high-level visualization of watch history.
- Build the Library view for nested navigation between Franchise Series and individual Anime entries.
- Implement Vanilla JavaScript logic to handle asynchronous API calls to the backend.
- Apply responsive design and dark-mode styling using Tailwind CSS.

### Phase 5: External API Enrichment
- Integrate the Jikan (MyAnimeList) API client to extend your local dataset.
- Automate the retrieval of external assets such as cover art, synopses, and global ratings.
- Implement background scheduling (using task queues or cron jobs) to periodically update cached data without blocking user requests.

### Phase 6: Granular Detail & Dual-Write
- Build detailed view pages for individual anime entries, displaying full metadata and progress.
- Integrate dual-write architectural logic to ensure that UI changes (e.g., updating watch status) instantly update the local database and silently push updates back to the master Google Sheet.

### Phase 7: Admin Dashboard
- Create a dedicated, secure admin interface for managing data edge cases.
- Implement tools for manual record overrides, handling data conflicts, and monitoring the status of the automated sync pipeline.

### Phase 8: Deploy to Web
- Refine Docker configuration for production readiness (using multi-stage builds or optimized images).
- Configure Google Cloud Platform resources including Cloud SQL for the relational database.
- Deploy the FastAPI application using Cloud Run or Compute Engine for scalable hosting.
````
