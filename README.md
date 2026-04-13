<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h3 align="center">CG1618 Media Tracker & Database</h3>

  <p align="center">
    A cloud-native web application for tracking, managing, and visualizing a personal media collection — built on a three-tier relational hierarchy with bi-directional Google Sheets sync and Jikan API enrichment.
    <br />
    <a href="https://github.com/cgentle1618/anime_site/tree/cloud"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/cgentle1618/anime_site/tree/cloud">View Repo</a>
    ·
    <a href="https://cg1618-tracker-516479765908.asia-east1.run.app/">View Live Site</a>
    ·
    <a href="https://github.com/cgentle1618/anime_site/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/cgentle1618/anime_site/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

---

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#architecture">Architecture</a>
      <ul>
        <li><a href="#repository-structure">Repository Structure</a></li>
        <li><a href="#database-schema">Database Schema</a></li>
        <li><a href="#data-flow">Data Flow</a></li>
        <li><a href="#api-routes">API Routes</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#local-development-setup">Local Development Setup</a></li>
        <li><a href="#environment-variables">Environment Variables</a></li>
        <li><a href="#google-sheets-integration-setup">Google Sheets Integration Setup</a></li>
      </ul>
    </li>
    <li>
      <a href="#deployment">Deployment</a>
      <ul>
        <li><a href="#dockerization">Dockerization</a></li>
        <li><a href="#gcp-cloud-run">GCP Cloud Run</a></li>
        <li><a href="#cicd-pipeline">CI/CD Pipeline</a></li>
      </ul>
    </li>
    <li><a href="#features">Features</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

<!-- ABOUT THE PROJECT -->

## About The Project

The **CG1618 Media Tracker & Database** is a custom-built, cloud-native web application designed to track, manage, and visualize a personal media collection. It was born out of a need to upgrade from a static, manual Google Sheets tracking system to a robust, relational database-driven web application — while maintaining the original Google Sheet as a synchronized backup and alternative data-entry interface.

The application serves two audiences:

- **Public (Guest):** A read-only gallery for sharing the collection with others.
- **Private (Admin):** A secure dashboard for adding entries, fetching metadata, and triggering data pipelines.

### Core Objectives

- **Three-Tier Hierarchy** — Data is organized into a `Franchise → Series → Anime` relational model, replacing flat spreadsheet rows with structured, linked records.
- **Modern Web Interface** — A responsive, visually appealing UI displaying cover art, synopses, ratings, and progress — rendered server-side via Jinja2 with Tailwind CSS v4.
- **Bi-Directional Sync** — A robust data pipeline pushing and pulling records between PostgreSQL and Google Sheets via the `gspread` API.
- **Automated Data Enrichment** — Integration with the MyAnimeList Jikan v4 API to auto-populate metadata (cover images, MAL/AniList ratings, synopses, studios).
- **Secure Access Control** — JWT-based authentication stored in HTTP-Only cookies, differentiating Admin from Guest users.
- **Cloud-Native Deployment** — Containerized via a 3-stage Docker build and deployed to Google Cloud Run for high availability and low maintenance.
- **Automated CI/CD** — GitHub Actions pipeline automatically builds, tags, and deploys every push to the `main` branch.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

### Built With

**Backend & Core**

- [![FastAPI][FastAPI-badge]][FastAPI-url] — High-performance ASGI web framework
- [![Python][Python-badge]][Python-url] — Python 3.11 runtime
- [![PostgreSQL][PostgreSQL-badge]][PostgreSQL-url] — Primary relational database (PostgreSQL 15)
- [![SQLAlchemy][SQLAlchemy-badge]][SQLAlchemy-url] — ORM and session management
- [![Alembic][Alembic-badge]][Alembic-url] — Database schema migration tooling

**Frontend**

- [![Jinja2][Jinja2-badge]][Jinja2-url] — Server-side HTML rendering
- [![TailwindCSS][Tailwind-badge]][Tailwind-url] — Utility-first CSS framework (v4, compiled via Node.js CLI)
- [![JavaScript][JS-badge]][JS-url] — Vanilla JS for client-side interactivity and async updates

**Infrastructure & Cloud (GCP)**

- [![Docker][Docker-badge]][Docker-url] — 3-stage multi-stage container builds
- [![GoogleCloud][GCP-badge]][GCP-url] — Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry

**Integrations & Security**

- `gspread` — Google Sheets API wrapper for backup/pull pipelines
- `google-cloud-storage` — GCS client for serving anime cover images
- Jikan API v4 (MyAnimeList) — Metadata enrichment
- `PyJWT` + `passlib[bcrypt]` — JWT session tokens and password hashing
- `tenacity` — Exponential backoff for Jikan API rate limiting
- GitHub Actions — Automated CI/CD pipeline

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ARCHITECTURE -->

## Architecture

### Repository Structure

The project follows a modular monolithic architecture with strict separation by concern: routing, business logic, utilities, data access, and presentation are each isolated in their own layers.

```
cg1618-tracker/
│
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions CI/CD pipeline
│
├── routers/
│   ├── anime.py                    # Anime entry CRUD endpoints
│   ├── auth.py                     # JWT login/logout/session endpoints
│   ├── data_control.py             # Bulk data pipelines (backup, pull, batch fill) w/ SSE
│   ├── franchise.py                # Franchise hub management endpoints
│   ├── options.py                  # Dynamic dropdown/category option endpoints
│   ├── pages.py                    # Jinja2 HTML template rendering & UI routing
│   ├── series.py                   # Series grouping endpoints
│   ├── system.py                   # System-level metrics and configuration endpoints
│   └── ...
│
├── services/
│   ├── data_control.py             # Core logic for bulk DB operations
│   ├── image_manager.py            # Poster/cover image fetch and GCS storage
│   ├── jikan.py                    # Jikan v4 API integration with rate-limit backoff
│   ├── other_logics.py             # Episode tracking, completion checks, hierarchy resolution
│   ├── security.py                 # Bcrypt hashing and admin auth state
│   └── sheets.py                   # Google Sheets API wrapper for backup/restore
│
├── utils/
│   ├── data_control.py             # Helpers for data control pipelines
│   ├── gcp.py                      # GCP integration helpers
│   ├── jikan_utils.py              # Jikan payload → local schema mapping
│   └── utils.py                    # General-purpose stateless helpers and constants
│
├── templates/                      # Jinja2 server-side rendered views
│   ├── base.html                   # Master layout, navigation, global JS
│   ├── index.html                  # Active tracking dashboard
│   ├── library_anime.html          # Full collection grid with filtering
│   ├── anime.html                  # Individual anime detail/tracker page
│   ├── franchise_acg.html          # Franchise Hub hierarchical view
│   ├── search.html                 # Advanced search results interface
│   ├── add.html                    # New entry creation form
│   ├── modify.html                 # Dual-tab editor (Anime + Series)
│   ├── delete.html                 # Record deletion portal
│   ├── admin.html                  # System settings and diagnostics dashboard
│   ├── login.html                  # Administrator authentication portal
│   └── ...
│
├── static/
│   ├── css/                        # Per-page compiled CSS + Tailwind source
│   │   ├── base.css                # Global custom styles and typography rules
│   │   ├── input.css               # Master Tailwind v4 source file
│   │   ├── main.css                # Final minified CSS generated by Tailwind CLI
│   │   └── ...
│   └── js/                         # Per-page Vanilla JS modules
│       ├── base.js                 # Global logic for search, mobile menu, notifications
│       └── ...
│
├── main.py                         # FastAPI app entrypoint & router registration
├── models.py                       # SQLAlchemy ORM class definitions
├── database.py                     # Engine, SessionLocal, declarative Base
├── dependencies.py                 # FastAPI dependency injection (get_db, get_current_admin)
├── schemas.py                      # Pydantic request/response validation models
├── entrypoint.sh                   # Container startup script (runs before Uvicorn)
├── Dockerfile                      # 3-stage multi-stage Docker build
├── docker-compose.yml              # Local dev orchestration (PostgreSQL + Tailwind watcher)
├── package.json                    # Node.js manifest for Tailwind CSS CLI
└── requirements.txt                # Pinned Python dependencies
```

**Layer Responsibilities:**

| Layer                    | Responsibility                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `routers/`               | HTTP request handling, parameter validation (Pydantic), HTTP responses only. Delegates all logic to `services/`. |
| `services/`              | Core application logic: modifies DB state, calls third-party APIs, orchestrates data pipelines.                  |
| `utils/`                 | Stateless, pure functions only. No DB calls, no HTTP requests. Data transformation and constants.                |
| `templates/` + `static/` | Frontend presentation. Jinja2 SSR, Tailwind CSS styling, Vanilla JS for client-side interactivity.               |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

### Database Schema

The database uses a **three-tier "Franchise Hub" hierarchy**: each `Anime` entry belongs to a `Series`, which belongs to a `Franchise`. This models real-world franchise structures (e.g., a universe → a storyline within it → individual seasons/movies).

| Table               | Description                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alembic_version`   | Tracks the current Alembic schema migration revision applied to the database.                                                                                                                    |
| `anime`             | Individual media entries: TV seasons, movies, OVAs, ONAs, Specials. Links to both `franchise` and `series` via Foreign Keys. Stores all watch progress, ratings, metadata, and external API IDs. |
| `data_control_logs` | Audit log for all data control pipeline operations (Backup, Pull, Fill, Replace) with timestamps and results.                                                                                    |
| `deleted_record`    | Soft-delete recycle bin. Retains records removed from core tables for audit and potential restoration.                                                                                           |
| `franchise`         | Top-level hub. Groups related series and anime under a single IP (e.g., "Fate"). Stores aggregate ratings and 3×3 grid slots.                                                                    |
| `seasonal`          | Tracks seasonal release groupings, used to organize entries by airing season (e.g., WIN 2026).                                                                                                   |
| `series`            | Intermediate grouping within a Franchise (e.g., "Fate/stay night"). Links to `franchise` via `franchise_id`.                                                                                     |
| `system_configs`    | Key-value store for runtime application configuration (e.g., current tracking season). Admin-editable.                                                                                           |
| `system_options`    | Stores the available options for dropdown fields on anime data entries. Each record represents a selectable value for a specific field category (e.g., available studios, directors, genres).    |
| `users`             | Administrator accounts. Stores hashed passwords and role assignments for JWT-based authentication.                                                                                               |

**Tables synchronized to Google Sheets:** `franchise`, `series`, `anime`, `system_options`.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

### Data Flow

The application manages data through four distinct lifecycle paths:

1. **Client Read Path** — All frontend reads query Cloud SQL (PostgreSQL) directly via SQLAlchemy. Google Sheets is fully bypassed for performance.

2. **Interactive Write Path (Admin)** — UI changes (e.g., incrementing episode counters) trigger an optimistic DOM update in the browser immediately, followed by an async `PATCH` request that updates both PostgreSQL and Google Sheets in the background.

3. **Data Control Pipelines** — Manual admin-triggered bulk operations streamed via Server-Sent Events (SSE) to avoid HTTP timeouts on long-running jobs:
   - **Backup** (`PostgreSQL → Google Sheets`): Exports all core tables to their corresponding Google Sheet tabs. Intended as a safe snapshot before performing risky bulk operations.
   - **Pull** (`Google Sheets → PostgreSQL`): Reads rows from the Google Sheet and performs an upsert against PostgreSQL using `system_id` as the merge key. The reverse of Backup.
   - **Fill** (`External APIs / Internal Logic → PostgreSQL`): Targets only entries where missing values are detected. Fetches and populates absent metadata from external sources (e.g., Jikan API for cover images, MAL/AniList ratings) as well as applying internally-defined filling logic not tied to any external API. Throttled to Jikan's rate limit (3 req/sec, 60 req/min) with exponential backoff via `tenacity`.
   - **Replace** (`External APIs / Internal Logic → PostgreSQL`): Identical in logic to Fill, but unconditionally targets the entire database regardless of whether an entry already has values populated. Used for a full metadata refresh.

4. **Image Management Flow** (`image_manager.py`) — Cover images fetched from Jikan are stored in a GCS bucket (`cg1618-anime-covers`) and served via public URLs, replacing the local `static/covers/` directory in production.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

### API Routes

> The full list of all endpoints, request schemas, and response models is available via the **FastAPI built-in Swagger UI** at `/docs` when the application is running.

**Anime (`/api/anime`)**

```
GET    /api/anime              List anime entries with optional filters
POST   /api/anime              Create a new anime entry
PATCH  /api/anime/{id}         Partially update an anime entry (optimistic UI target)
DELETE /api/anime/{id}         Delete an anime entry
```

**Franchise (`/api/franchise`)**

```
GET    /api/franchise          List all franchise hubs
POST   /api/franchise          Create a new franchise hub
PATCH  /api/franchise/{id}     Update franchise fields
DELETE /api/franchise/{id}     Delete a franchise and cascade to linked entries
```

**Series (`/api/series`)**

```
GET    /api/series             List all series
POST   /api/series             Create a new series under a franchise
PATCH  /api/series/{id}        Update series fields
DELETE /api/series/{id}        Delete a series
```

**Data Control (`/api/data-control`)**

```
POST   /api/data-control/backup          Export all core tables → Google Sheets (SSE stream)
POST   /api/data-control/pull            Upsert Google Sheets rows → PostgreSQL (SSE stream)
POST   /api/data-control/fill            Fill missing values from Jikan API + internal logic (SSE stream)
POST   /api/data-control/replace         Replace all values for entire database (SSE stream)
```

**Options (`/api/options`)**

```
GET    /api/options            Retrieve all system dropdown option categories
POST   /api/options            Add a new option value to a category
DELETE /api/options/{id}       Remove an option value
```

**Auth (`/api/auth`)**

```
POST   /api/auth/login         Authenticate admin, issue JWT HTTP-Only cookie
POST   /api/auth/logout        Clear the session cookie
GET    /api/auth/validate      Validate the current session token
```

**System (`/api/system`)**

```
GET    /api/system/logs        Retrieve data control operation logs
GET    /api/system/deleted     Retrieve soft-deleted records
POST   /api/system/test-bucket Test GCS bucket connectivity and permissions
```

**Pages (`/`)**

```
GET    /                       Dashboard — active tracking swimlanes
GET    /library                Full collection grid with filtering
GET    /anime/{id}             Individual anime detail and tracker page
GET    /franchise/{id}         Franchise Hub hierarchical view
GET    /admin                  Admin system settings and data control dashboard
```

> **Communication Patterns:** Standard CRUD operations use JSON payloads validated by Pydantic schemas. Long-running pipeline operations (Backup, Pull, Fill, Replace) use **Server-Sent Events (SSE)** to stream real-time progress to the UI without timing out.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- GETTING STARTED -->

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js (v20+ recommended) and npm — required for compiling Tailwind CSS v4
- Docker & Docker Compose — used for the local PostgreSQL database container
- A Google Cloud Platform project with the following APIs enabled:
  - Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact Registry
- A Google Cloud Service Account with Editor access to the target Google Sheet
- A MyAnimeList account (for obtaining `mal_id` values used in Jikan enrichment)

---

### Local Development Setup

1. **Clone the repository and switch to the `cloud` branch**

   ```sh
   git clone https://github.com/cgentle1618/anime_site.git
   cd anime_site
   git checkout cloud
   ```

2. **Install Node.js dependencies and build the CSS**

   The repository already includes `package.json` with all required entries, so no `npm init` is needed. Install the dev dependencies and compile the Tailwind CSS:

   ```sh
   npm install
   npm run build:css
   ```

   This installs `tailwindcss`, `@tailwindcss/cli`, `postcss`, and `autoprefixer`, then generates `static/css/main.css`. The compiled `main.css` is gitignored and must be built before first run.

   > **Note:** In production, this step is handled automatically by Stage 1 of the Docker multi-stage build — no local Node.js is required for deployment.

3. **Create and activate a Python virtual environment**

   ```sh
   python -m venv venv
   source venv/bin/activate       # macOS / Linux
   # venv\Scripts\activate        # Windows
   pip install -r requirements.txt
   ```

4. **Set up your `.env` file** _(never commit this file — it is gitignored)_

   See the [Environment Variables](#environment-variables) section below for the full reference.

5. **Place your Google Service Account key** at `credentials.json` in the project root _(also gitignored and dockerignored)_.

   Share your target Google Sheet with the Service Account email (e.g., `anime-bot@anime-site-sync.iam.gserviceaccount.com`) with **Editor** permissions. Set `GOOGLE_SHEET_ID` in your `.env` to the Sheet's unique ID.

6. **Start the local PostgreSQL container via Docker Compose**

   ```sh
   docker-compose up -d
   ```

7. **Run the development server**

   ```sh
   uvicorn main:app --reload
   ```

8. **Access the app** at `http://localhost:8000`

   On first boot, SQLAlchemy will auto-create all tables via `Base.metadata.create_all()`. Navigate to the Admin dashboard (`/admin`) and trigger a **Data Pull** to hydrate the database from your Google Sheet, or begin adding entries manually via `/add`.

   The full API reference is available at `http://localhost:8000/docs` via the FastAPI built-in Swagger UI.

---

### Environment Variables

Environment variables are managed differently between local development and production.

#### Local Development (`.env`)

Create a `.env` file in the project root. This file is gitignored and dockerignored — never commit it.

```env
# ── Database ──────────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=anime_site_db
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432

# ── Authentication & Security ──────────────────────────────────────
# Generate JWT_SECRET_KEY with: python -c "import secrets; print(secrets.token_urlsafe(32))"
JWT_SECRET_KEY=your_super_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440              # 24 hours — 1440 minutes
ADMIN_PASSWORD=your_admin_password

# ── External Integrations ──────────────────────────────────────────
GOOGLE_SHEET_ID=your_google_sheet_id
```

> `DATABASE_URL` may also be defined if your application constructs the SQLAlchemy connection string from it directly (e.g., `postgresql://user:pass@localhost:5432/anime_site_db`).

#### Production (GCP Cloud Run)

In production, variables are split into two categories injected at runtime — neither is ever stored in code.

**Plain Environment Variables** (set directly on the Cloud Run service):

| Variable                   | Description                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER`            | Cloud SQL database username                                                                                                |
| `POSTGRES_DB`              | Cloud SQL database name                                                                                                    |
| `INSTANCE_CONNECTION_NAME` | Cloud SQL instance connection name (format: `project-id:region:instance-id`). Used to route traffic via the VPC connector. |
| `GCS_BUCKET_NAME`          | Name of the GCS bucket used for hosting anime cover images                                                                 |

**Secrets via Google Secret Manager** (securely mounted into the Cloud Run service at runtime):

| Secret Name               | Description                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`       | Cloud SQL database password                                                                       |
| `JWT_SECRET_KEY`          | Cryptographic key for signing and verifying admin session tokens                                  |
| `ADMIN_PASSWORD`          | Root password for the administrator dashboard                                                     |
| `GOOGLE_CREDENTIALS_JSON` | Full JSON contents of the Google Service Account key (replaces the local `credentials.json` file) |
| `GOOGLE_SHEET_ID`         | Target Google Sheet ID for the Backup and Pull data pipelines                                     |

---

### Google Sheets Integration Setup

The application connects to Google Sheets using a Service Account for Server-to-Server OAuth 2.0 authentication.

1. Create (or reuse) a Google Cloud Service Account in your GCP project.
2. Download the JSON key and save it as `credentials.json` in the project root.
3. Share your Google Sheet with the Service Account email as **Editor**.
4. Set `GOOGLE_SHEET_ID` in your `.env` to the Sheet's unique document ID (found in the URL).

> The Sheet is expected to contain tabs named `Franchise`, `Series`, and `Anime` matching the database schema. The Backup pipeline will create/overwrite these tabs; the Pull pipeline reads from them.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- DEPLOYMENT -->

## Deployment

This project is designed for a fully serverless, zero-maintenance production architecture on **Google Cloud Platform**.

### Dockerization

The `Dockerfile` uses a **3-stage multi-stage build** to produce an ultra-lightweight, secure production image (target: < 500MB):

| Stage                              | Base Image         | Purpose                                                                                                                                                                                                            |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stage 1: CSS Builder**           | `node:20-slim`     | Installs Node.js deps, scans templates for class names, compiles Tailwind v4 into a minified `main.css`. `node_modules` never proceeds past this stage.                                                            |
| **Stage 2: Python Wheels Builder** | `python:3.11-slim` | Installs `gcc`, `libpq-dev`, `libffi-dev` build headers; compiles C-extension wheels (`psycopg2`, `bcrypt`, `cryptography`) into `/app/wheels`. Compilers never reach the final image.                             |
| **Stage 3: Final Runtime**         | `python:3.11-slim` | Installs only `libpq-dev` (runtime PostgreSQL client); copies pre-built wheels from Stage 2 (offline install); copies application source and compiled `main.css` from Stage 1. Executes `entrypoint.sh` → Uvicorn. |

**Build and tag the image locally:**

```sh
docker build -t cg1618-tracker:latest .
docker tag cg1618-tracker:latest asia-east1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/cg1618-tracker:v1
```

> **`.dockerignore` enforces security:** `.env` and `credentials.json` are explicitly excluded from the build context and can never be baked into the image.

---

### GCP Cloud Run

The full production deployment uses five GCP services:

| Service                 | Role                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud Run**           | Serverless compute. Hosts the FastAPI Docker container. Auto-HTTPS, scales to 0 when idle. Configured for 80 concurrent requests and a **3600s timeout** (required for SSE data pipelines throttled by Jikan rate limits). |
| **Cloud SQL**           | Managed PostgreSQL 15 in `asia-east1` (Taiwan). Connected via a **Serverless VPC Access connector** over a private IP — no public IP exposure. 10GB SSD, auto-scaling enabled.                                             |
| **Cloud Storage (GCS)** | Hosts and serves anime cover images (`cg1618-anime-covers` bucket, `asia-east1`, public read access).                                                                                                                      |
| **Secret Manager**      | Secure runtime injection of `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `ADMIN_PASSWORD`, `GOOGLE_CREDENTIALS_JSON`, `GOOGLE_SHEET_ID`, `GCS_BUCKET_NAME`.                                                                      |
| **Artifact Registry**   | Private Docker image repository (`anime-repo`, `asia-east1`). Cleanup policies retain only the last N revisions.                                                                                                           |

**Push and deploy manually:**

```sh
# Authenticate Docker with GCP Artifact Registry
gcloud auth configure-docker asia-east1-docker.pkg.dev

# Push the tagged image
docker push asia-east1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/cg1618-tracker:v1

# Deploy to Cloud Run
gcloud run deploy cg1618-tracker \
  --image asia-east1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/cg1618-tracker:v1 \
  --region asia-east1 \
  --add-cloudsql-instances YOUR_INSTANCE_CONNECTION_NAME \
  --set-secrets "POSTGRES_PASSWORD=POSTGRES_PASSWORD:latest,\
JWT_SECRET_KEY=JWT_SECRET_KEY:latest,\
ADMIN_PASSWORD=ADMIN_PASSWORD:latest,\
GOOGLE_CREDENTIALS_JSON=GOOGLE_CREDENTIALS_JSON:latest,\
GOOGLE_SHEET_ID=GOOGLE_SHEET_ID:latest,\
GCS_BUCKET_NAME=GCS_BUCKET_NAME:latest" \
  --timeout=3600 \
  --allow-unauthenticated
```

> **Note:** `--allow-unauthenticated` is intentional. The public read-only gallery is open access. All write operations and admin pages are protected by the application-level JWT + HTTP-Only Cookie authentication system.

---

### CI/CD Pipeline

Every push to `main` automatically triggers the GitHub Actions workflow defined in `.github/workflows/deploy.yml`:

1. **Authenticate** with GCP using the `GCP_CREDENTIALS` GitHub Secret (dedicated `github-actions-deployer` Service Account).
2. **Build** the 3-stage Docker image, tagging it with the unique Git commit SHA (`${{ github.sha }}`).
3. **Push** the tagged image to Google Artifact Registry.
4. **Deploy** the new image revision to Cloud Run via `google-github-actions/deploy-cloudrun@v2`, including the extended 3600s timeout.

This ensures every production deployment is traceable to a specific commit, reproducible, and requires zero manual intervention.

**IAM — Principle of Least Privilege:**

| Service Account               | Purpose                        | Roles                                                                                                    |
| ----------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `anime-bot@...`               | Runtime identity for Cloud Run | Cloud SQL Client, Secret Manager Accessor, GCS read/write on `cg1618-anime-covers`, Google Sheets Editor |
| `github-actions-deployer@...` | CI/CD pipeline identity        | Artifact Registry Writer, Cloud Run Developer                                                            |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- FEATURES -->

## Features

### Public Views (Guest)

- **Dashboard (`/`)** — Kanban-style swimlanes grouping anime by watching status (Active Watching, Passive Watching, Paused, Temp Dropped, etc.) for at-a-glance progress tracking.
- **Library (`/library`)** — Full collection grid with client-side filtering by type, watching status, airing type, rating, release season, studio, and genre.
- **Anime Detail (`/anime/{id}`)** — Full metadata page: Jikan-fetched cover art, MAL/AniList ratings and links, studio, release info, synopsis, episode progress bar, and series/franchise context.
- **Franchise Hub (`/franchise/{id}`)** — Three-tier hierarchical view showing all series and anime entries within a franchise with aggregate completion data.
- **Search** — Global search across anime titles (EN, CN, Romanji, JP, Alt), franchise names, and series names with string normalization.

### Admin-Only Features

- **Optimistic UI Updates** — Episode counters and progress bars update instantly in the browser while a background PATCH syncs to PostgreSQL and Google Sheets simultaneously.
- **Add Entry** — Smart autocomplete for franchise and series fields, multi-select studio tagger, duplicate detection on submission.
- **Modify** — Dual-tab editor for Anime and Series records with cascade-update logic for relational field changes.
- **Delete** — Cascade deletion handling for Franchise Hubs and orphan cleanup for the last entry in a series.
- **Data Control Dashboard (`/admin`)** — Trigger Backup (DB → Sheets), Pull (Sheets → DB), and Batch Fill (Jikan API enrichment) pipelines with real-time SSE progress streaming.
- **System Diagnostics** — View data control operation logs, inspect soft-deleted records, and test GCS bucket connectivity.

### Jikan API Integration

- Rate-limited to 3 requests/second and 60 requests/minute (Jikan v4 limits).
- Exponential backoff via `tenacity` on rate-limit responses (HTTP 429).
- Fetches: cover image URL, MAL score, MAL rank, AniList rating, synopsis, studio, airing dates, airing status.
- Cover images downloaded and stored in GCS; served via public URL in production.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ROADMAP -->

## Roadmap

- [x] Basic Anime Tracker & Database Implementation
- [x] GCP Cloud Run deployment
- [x] GitHub Actions CI/CD pipeline (auto-deploy on push to `main`)
- [ ] Intermediate Anime Tracker & Database Implementation
- [ ] Add Anime Movies entries to Tracker & Database
- [ ] Add Movie entries to Tracker & Database
- [ ] Add TV Show entries to Tracker & Database
- [ ] Add Cartoon entries to Tracker & Database
- [ ] Add Manga entries to Tracker & Database
- [ ] Add Novel entries to Tracker & Database
- [ ] Advanced Anime Tracker & Database Implementation
- [ ] Re-implement frontend using modern frontend frameworks (React/Vue)
- [ ] more TBD

See the [open issues](https://github.com/cgentle1618/anime_site/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- CONTRIBUTING -->

## Contributing

Contributions are welcome! If you have a suggestion that would improve this project, please fork the repo and create a pull request. You can also open an issue with the tag `enhancement`.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- LICENSE -->

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- CONTACT -->

## Contact

Project Link: [https://github.com/cgentle1618/anime_site/tree/cloud](https://github.com/cgentle1618/anime_site/tree/cloud)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ACKNOWLEDGMENTS -->

## Acknowledgments

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy ORM](https://docs.sqlalchemy.org/)
- [Alembic — Database Migrations](https://alembic.sqlalchemy.org/)
- [Jikan API v4 — Unofficial MyAnimeList API](https://jikan.moe/)
- [gspread — Google Sheets Python API](https://docs.gspread.org/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Google Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Google Cloud Storage Documentation](https://cloud.google.com/storage/docs)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [tenacity — Retry Library](https://tenacity.readthedocs.io/)
- [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
- [Img Shields](https://shields.io)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- MARKDOWN LINKS & BADGES -->

[contributors-shield]: https://img.shields.io/github/contributors/cgentle1618/anime_site.svg?style=for-the-badge
[contributors-url]: https://github.com/cgentle1618/anime_site/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/cgentle1618/anime_site.svg?style=for-the-badge
[forks-url]: https://github.com/cgentle1618/anime_site/network/members
[stars-shield]: https://img.shields.io/github/stars/cgentle1618/anime_site.svg?style=for-the-badge
[stars-url]: https://github.com/cgentle1618/anime_site/stargazers
[issues-shield]: https://img.shields.io/github/issues/cgentle1618/anime_site.svg?style=for-the-badge
[issues-url]: https://github.com/cgentle1618/anime_site/issues
[license-shield]: https://img.shields.io/github/license/cgentle1618/anime_site.svg?style=for-the-badge
[license-url]: https://github.com/cgentle1618/anime_site/blob/cloud/LICENSE.txt
[FastAPI-badge]: https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi
[FastAPI-url]: https://fastapi.tiangolo.com/
[Python-badge]: https://img.shields.io/badge/Python_3.11-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54
[Python-url]: https://python.org/
[PostgreSQL-badge]: https://img.shields.io/badge/PostgreSQL_15-316192?style=for-the-badge&logo=postgresql&logoColor=white
[PostgreSQL-url]: https://www.postgresql.org/
[SQLAlchemy-badge]: https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white
[SQLAlchemy-url]: https://www.sqlalchemy.org/
[Alembic-badge]: https://img.shields.io/badge/Alembic-6BA81E?style=for-the-badge&logo=alembic&logoColor=white
[Alembic-url]: https://alembic.sqlalchemy.org/
[Jinja2-badge]: https://img.shields.io/badge/Jinja2-B41717?style=for-the-badge&logo=jinja&logoColor=white
[Jinja2-url]: https://jinja.palletsprojects.com/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[JS-badge]: https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[JS-url]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[Docker-badge]: https://img.shields.io/badge/Docker-0db7ed?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
[GCP-badge]: https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white
[GCP-url]: https://cloud.google.com/
