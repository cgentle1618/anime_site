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
  <h3 align="center">CG1618 Anime Tracker & Database</h3>

  <p align="center">
    A cloud-native web app to track, manage, and visualize a personal anime collection — replacing Google Sheets with a relational database-driven interface.
    <br />
    <a href="https://github.com/cgentle1618/anime_site/tree/cloud"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/cgentle1618/anime_site/tree/cloud">View Repo</a>
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
    <li><a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#architecture">Architecture</a>
      <ul>
        <li><a href="#repository-structure">Repository Structure</a></li>
        <li><a href="#database-schema">Database Schema</a></li>
        <li><a href="#data-flow">Data Flow</a></li>
      </ul>
    </li>
    <li><a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#local-development-setup">Local Development Setup</a></li>
      </ul>
    </li>
    <li><a href="#deployment">Deployment</a>
      <ul>
        <li><a href="#dockerization">Dockerization</a></li>
        <li><a href="#gcp-cloud-run">GCP Cloud Run</a></li>
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

The **CG1618 Anime Tracker & Database** is a custom-built, cloud-native web application designed to track, manage, and visualize a personal anime collection. It was born out of a need to upgrade from a static, manual Google Sheets tracking system to a robust, relational database-driven web application — while maintaining the original Google Sheet as a synchronized backup and alternative data-entry interface.

The application serves two audiences:

- **Public (Guest):** A read-only gallery for sharing the collection with others.
- **Private (Admin):** A secure dashboard for adding entries, fetching metadata, and triggering database synchronizations.

### Core Objectives

- **Modern Web Interface** — A responsive, visually appealing UI displaying cover art, synopses, and structured data.
- **Relational Data Modeling** — Flat spreadsheet data migrated into a structured relational PostgreSQL database.
- **Bi-Directional Sync** — A robust sync engine pushing and pulling data between PostgreSQL and Google Sheets.
- **Automated Data Enrichment** — Integration with the MyAnimeList Jikan API to auto-populate metadata (cover images, genres, synopsis).
- **Secure Access Control** — JWT-based authentication differentiating Admin from Guest users.
- **Cloud-Native Deployment** — Containerized and deployed to Google Cloud Run for high availability and low maintenance.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

### Built With

**Backend & Core**

- [![FastAPI][FastAPI-badge]][FastAPI-url]
- [![Python][Python-badge]][Python-url]
- [![PostgreSQL][PostgreSQL-badge]][PostgreSQL-url]
- [![SQLAlchemy][SQLAlchemy-badge]][SQLAlchemy-url]

**Frontend**

- [![Jinja2][Jinja2-badge]][Jinja2-url]
- [![TailwindCSS][Tailwind-badge]][Tailwind-url]

**Infrastructure & Cloud (GCP)**

- [![Docker][Docker-badge]][Docker-url]
- [![GoogleCloud][GCP-badge]][GCP-url]

**Integrations**

- Google Sheets API (`gspread`)
- Jikan API v4 (MyAnimeList)
- JWT (`PyJWT`) + bcrypt (`passlib`)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ARCHITECTURE -->

## Architecture

### Repository Structure

```
anime_site/
│
├── main.py                  # App Entry Point & Orchestrator
├── database.py              # Database Engine & Connection Routing
├── models.py                # SQLAlchemy ORM Definitions
├── schemas.py               # Pydantic Data Validation Models
├── dependencies.py          # FastAPI Dependency Injection (Auth/DB)
├── requirements.txt         # Pinned Production Dependencies
│
├── Dockerfile               # Multi-Stage Container Build Instructions
├── docker-compose.yml       # Local Dev Database Orchestration
│
├── routers/
│   ├── admin.py             # Admin endpoints (Sync, Diagnostics, CRUD)
│   ├── anime.py             # Anime entry endpoints
│   ├── auth.py              # JWT Login/Logout session handlers
│   ├── pages.py             # HTML Template rendering & UI routing
│   └── series.py            # Franchise Hub endpoints
│
├── services/
│   ├── jikan_client.py      # MyAnimeList API integration
│   ├── security.py          # Bcrypt hashing & JWT cryptography
│   ├── sheets_client.py     # Low-level Google Sheets API CRUD logic
│   ├── sheets_sync.py       # Complex Sync Engine (Postgres <-> Sheets)
│   └── sync_utils.py        # Stateless string manipulation & regex tools
│
└── templates/               # Jinja2 Server-Side Rendered Views
    ├── base.html            # Master layout, navigation, and global JS
    ├── index.html           # Active Tracking Dashboard
    ├── library.html         # Advanced filtering archive
    ├── details.html         # Individual Anime metadata page
    ├── series.html          # Franchise Hub dashboard
    ├── search.html          # Global search results page
    ├── add.html             # Manual data entry form
    ├── modify.html          # Dual-tab editor for Anime/Series
    ├── delete.html          # Record termination portal
    ├── admin.html           # System diagnostics and audit logs
    └── login.html           # Administrator authentication portal
```

### Database Schema

The database uses a **"Franchise Hub"** model:

| Table             | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `anime_entries`   | Individual seasons, movies, and OVAs with full metadata and watch progress |
| `anime_series`    | Parent franchise hubs grouping multiple `anime_entries`                    |
| `users`           | Authentication and role-based access control                               |
| `sync_logs`       | Bi-directional Google Sheets sync audit trail                              |
| `deleted_records` | Recycle bin and deletion audit log                                         |

Each `anime_entry` is linked to a parent `anime_series` via a `series_en` (English series name) field, enabling aggregate progress calculations and franchise-level ratings.

### Data Flow

The application manages data through four lifecycles:

1. **Client Read Path** — SQLAlchemy queries Cloud SQL directly. Google Sheets is fully bypassed for speed.
2. **Interactive Write Path** — Admin UI changes trigger an optimistic DOM update + a background `PATCH` to both PostgreSQL and Google Sheets simultaneously.
3. **Master Sync Engine (`sheets_sync.py`)** — Manual sync downloads all Sheet rows, compares against Postgres by `system_id`, and executes a full two-way merge (inserts, updates, orphan detection).
4. **API Enrichment Flow (`jikan_client.py`)** — Records with a `mal_id` but missing cover art or ratings are automatically enriched via the Jikan V4 API during sync.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- GETTING STARTED -->

## Getting Started

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- A Google Cloud Platform project with Cloud SQL, Secret Manager, Artifact Registry, and Cloud Run enabled
- A Google Service Account with access to the target Google Sheet
- A MyAnimeList account (for obtaining `mal_id` values)

```sh
npm install npm@latest -g  # Only needed if using docx tooling
pip install -r requirements.txt
```

### Local Development Setup

1. **Clone the repository**

   ```sh
   git clone https://github.com/cgentle1618/anime_site.git
   cd anime_site
   git checkout cloud
   ```

2. **Create a virtual environment**

   ```sh
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Set up your `.env` file** _(never commit this file)_

   ```env
   POSTGRES_USER=your_db_user
   POSTGRES_PASSWORD=your_db_password
   POSTGRES_HOST=localhost
   POSTGRES_PORT=5432
   POSTGRES_DB=anime_db
   JWT_SECRET_KEY=your_super_secret_key
   ADMIN_PASSWORD=your_admin_password
   ```

4. **Place your Google Service Account key** at `credentials.json` in the project root _(also never commit this file)_.

5. **Start the local PostgreSQL container**

   ```sh
   docker-compose up -d
   ```

6. **Run the application**

   ```sh
   uvicorn main:app --reload
   ```

7. **Access the app** at `http://localhost:8000`

   On first boot, SQLAlchemy will auto-create all tables and seed the admin user from your `.env` credentials. Navigate to the `/system` admin dashboard and trigger a **Manual Sync** to hydrate the database from Google Sheets.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- DEPLOYMENT -->

## Deployment

This project is designed for deployment on **Google Cloud Platform** using a serverless, zero-maintenance architecture.

### Dockerization

The `Dockerfile` uses a **multi-stage build**:

- **Stage 1 (Builder):** Compiles C-based dependencies (`psycopg2`, `bcrypt`) into pre-built `.whl` wheels.
- **Stage 2 (Runtime):** Starts from a clean `python:3.11-slim` base, copies only the compiled wheels and application code, producing a small, secure final image.

Build and tag the image:

```sh
docker build -t cg1618-tracker:latest .
docker tag cg1618-tracker:latest asia-east1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/cg1618-tracker:v1
```

### GCP Cloud Run

The full cloud deployment uses four GCP services:

| Service               | Role                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Cloud Run**         | Serverless compute; hosts the FastAPI Docker container with auto-HTTPS                                             |
| **Cloud SQL**         | Managed PostgreSQL in `asia-east1` (Taiwan), connected via Unix Sockets                                            |
| **Secret Manager**    | Secure runtime injection of `POSTGRES_PASSWORD`, `JWT_SECRET_KEY`, `ADMIN_PASSWORD`, and `GOOGLE_CREDENTIALS_JSON` |
| **Artifact Registry** | Private Docker image repository                                                                                    |

**Push and deploy:**

```sh
# Authenticate Docker with GCP
gcloud auth configure-docker asia-east1-docker.pkg.dev

# Push image
docker push asia-east1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/cg1618-tracker:v1

# Deploy to Cloud Run
gcloud run deploy cg1618-tracker \
  --image asia-east1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/cg1618-tracker:v1 \
  --region asia-east1 \
  --add-cloudsql-instances YOUR_INSTANCE_CONNECTION_NAME \
  --set-secrets "POSTGRES_PASSWORD=POSTGRES_PASSWORD:latest,JWT_SECRET_KEY=JWT_SECRET_KEY:latest,ADMIN_PASSWORD=ADMIN_PASSWORD:latest,GOOGLE_CREDENTIALS_JSON=GOOGLE_CREDENTIALS_JSON:latest" \
  --allow-unauthenticated
```

> **Note:** `--allow-unauthenticated` is intentional. Guest read-only access is public; all write operations are protected by the application-level JWT + HTTP-Only Cookie authentication system built in Phase 2.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- FEATURES -->

## Features

### Public Views (Guest)

- **Dashboard (`/`)** — Kanban-style swimlanes for Active, Passive, Paused, and Temp Dropped shows.
- **Library (`/library`)** — Full collection grid with client-side filtering by type, status, genre, rating, and streaming source.
- **Details (`/anime/{id}`)** — Full metadata page: cover art (Jikan-fetched), cast, studios, MAL/AniList links.
- **Series Hub (`/series/{id}`)** — Franchise view with aggregate episode counts and completion percentage.
- **Search** — Fuzzy global search with string normalization; results categorized by Series and Anime Entry.

### Admin-Only Features

- **Optimistic UI Updates** — Episode counters and progress bars update instantly in the browser while syncing in the background.
- **Add Entry** — Smart autocomplete for series names, multi-select studio tagger, and pre-submission duplicate detection.
- **Modify** — Dual-tab editor (Anime + Series) with cascade-update logic for relational field changes.
- **Delete** — Cascade deletion for Series Hubs and smart orphan cleanup for the last entry in a franchise.
- **Sync Dashboard (`/system`)** — Trigger manual Google Sheets ↔ PostgreSQL sync, view sync audit logs, scan for and purge orphaned records.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- ROADMAP -->

## Roadmap

- [x] Relational database with Franchise Hub model
- [x] Bi-directional Google Sheets sync engine
- [x] Jikan API auto-enrichment (cover art, MAL ratings)
- [x] JWT + HTTP-Only Cookie authentication
- [x] GCP Cloud Run deployment with Secret Manager
- [x] Optimistic UI updates with Vanilla JS
- [ ] Cron-based automated scheduled sync
- [ ] Version 2: Public user accounts and watchlists
- [ ] Version 2: Enhanced analytics and statistics dashboard
- [ ] Version 2: Mobile app companion

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
- [Jikan API v4 (Unofficial MyAnimeList)](https://jikan.moe/)
- [gspread — Google Sheets Python API](https://docs.gspread.org/)
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Google Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Tailwind CSS](https://tailwindcss.com/)
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
[PostgreSQL-badge]: https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white
[PostgreSQL-url]: https://www.postgresql.org/
[SQLAlchemy-badge]: https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white
[SQLAlchemy-url]: https://www.sqlalchemy.org/
[Jinja2-badge]: https://img.shields.io/badge/Jinja2-B41717?style=for-the-badge&logo=jinja&logoColor=white
[Jinja2-url]: https://jinja.palletsprojects.com/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Docker-badge]: https://img.shields.io/badge/Docker-0db7ed?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
[GCP-badge]: https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white
[GCP-url]: https://cloud.google.com/
