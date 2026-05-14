# Frontend Structure

React + Vite SPA. All pages call `/api/...` endpoints via native `fetch()`. Auth state is read from `AuthContext`. Toast notifications go through `useToast`.

---

## Directory Tree

```
frontend/src/
  main.jsx                        Entry point — mounts App
  App.jsx                         Root: routing, QueryClientProvider, AuthProvider, ToastProvider

  pages/
    Index.jsx                     Dashboard — tracked anime/TV/cartoons/manga/novels by status
    Login.jsx                     Admin login form
    Search.jsx                    Global search across all media types and franchises
    FutureReleases.jsx            Upcoming releases (anime, anime movie, movie, TV, cartoon)
    Completions.jsx               Completed media history
    Plan.jsx                      Watch-next, rewatch, and future watch/read plans
    Statistics.jsx                Aggregate stats — favorites, completion rates, ratings
    SeasonalOverall.jsx           Seasonal anime overview grid
    SeasonalDetail.jsx            Single-season anime detail view
    UnderDevelopment.jsx          Placeholder for WIP pages
    DataHistory.jsx               Audit log of data changes (admin)
    ReviewQueue.jsx               Pending data review queue (admin)
    Admin.jsx                     System controls and admin dashboard
    Add.jsx                       Admin add-entry form (tabs per media type)
    Modify.jsx                    Admin edit-entry form (tabs per media type)
    Delete.jsx                    Admin delete-entry page

    Anime.jsx                     Anime detail — episodes, metadata, notes, admin tools
    AnimeMovie.jsx                Anime movie detail
    Movie.jsx                     Live-action movie detail
    TV.jsx                        TV show detail
    Cartoon.jsx                   Cartoon detail
    Manga.jsx                     Manga detail — chapter tracking, metadata
    Novel.jsx                     Light novel detail — chapter/volume tracking

    Franchise.jsx                 Thin wrapper delegating to FranchisePage
    FranchisePage.jsx             Franchise overview — all related media with filtering/sorting
    FranchiseLibrary.jsx          Browsable franchise grid with type filters

    LibraryAnime.jsx              Anime library — grid/table with filters and sort
    LibraryAnimeMovie.jsx         Anime movie library
    LibraryMovie.jsx              Live-action movie library
    LibraryTV.jsx                 TV show library
    LibraryCartoon.jsx            Cartoon library
    LibraryManga.jsx              Manga library
    LibraryNovel.jsx              Light novel library

    AnimeNotes.jsx                Notes editor for anime
    AnimeMovieNotes.jsx           Notes editor for anime movies
    MovieNotes.jsx                Notes editor for movies
    TVShowNotes.jsx               Notes editor for TV shows
    CartoonNotes.jsx              Notes editor for cartoons
    MangaNotes.jsx                Notes editor for manga
    NovelNotes.jsx                Notes editor for novels

    notes/
      NotesTemplate.jsx           Shared notes editor shell (used by all 7 notes pages)
      configs/
        animeNotesConfig.js       Field definitions for anime notes
        animeMovieNotesConfig.js  Field definitions for anime movie notes
        movieNotesConfig.js       Field definitions for movie notes
        tvShowNotesConfig.js      Field definitions for TV show notes
        cartoonNotesConfig.js     Field definitions for cartoon notes
        mangaNotesConfig.js       Field definitions for manga notes
        novelNotesConfig.js       Field definitions for novel notes

    plan/
      usePlanData.js              Hook — fetches all media data for Plan page
      PlanWatchNext.jsx           "Watch Next" section grouped by franchise
      PlanToRewatch.jsx           "To Rewatch" section
      PlanToWatchFuture.jsx       "Plan to Watch (Future Releases)" section

    statistics/
      useStatisticsData.js        Hook — fetches franchise and media data for Statistics
      StatsCompletions.jsx        Completion counts and timeline
      StatsFavoriteGrids.jsx      3×3 favorite franchise cover grids
      StatsFranchiseSummary.jsx   Per-franchise stats summary

    add-tabs/
      AnimeAddTab.jsx             Add form for anime
      AnimeMovieAddTab.jsx        Add form for anime movies
      MovieAddTab.jsx             Add form for movies
      TVShowAddTab.jsx            Add form for TV shows
      CartoonAddTab.jsx           Add form for cartoons
      MangaAddTab.jsx             Add form for manga
      NovelAddTab.jsx             Add form for novels
      FranchiseAddTab.jsx         Add form for franchises
      SeriesAddTab.jsx            Add form for series
      SeasonalAddTab.jsx          Add form for seasonal entries

    modify-tabs/
      AnimeModifyTab.jsx          Edit form for anime
      AnimeMovieModifyTab.jsx     Edit form for anime movies
      MovieModifyTab.jsx          Edit form for movies
      TVShowModifyTab.jsx         Edit form for TV shows
      CartoonModifyTab.jsx        Edit form for cartoons
      MangaModifyTab.jsx          Edit form for manga
      NovelModifyTab.jsx          Edit form for novels
      FranchiseModifyTab.jsx      Edit form for franchises
      SeriesModifyTab.jsx         Edit form for series
      SeasonalModifyTab.jsx       Edit form for seasonal entries
      Fav3x3ModifyTab.jsx         Edit favorite franchise 3×3 grids

  components/
    layout/
      Layout.jsx                  App shell — wraps all pages with Nav and Toast
      Nav.jsx                     Top navigation bar
      ProtectedRoute.jsx          Route guard for admin-only pages
      Toast.jsx                   Toast notification renderer

    cards/
      MediaCard.jsx               Unified media card (type + variant props) — library and future variants
      FranchiseCard.jsx           Franchise poster card for FranchiseLibrary

    info/
      InfoCard.jsx                Key-value info card (production, ratings, dates)
      NamingCard.jsx              All language name variants for anime/manga/novel
      CartoonNamingCard.jsx       Naming card variant for cartoons
      MovieNamingCard.jsx         Naming card variant for movies
      TVNamingCard.jsx            Naming card variant for TV shows
      ScoreBlock.jsx              MAL / AniList score display
      SourcesCard.jsx             External links (Baha, Netflix, official, MAL, AniList)
      RatingDistributionBlock.jsx Rating distribution visualization
      BelongingNovelsEditor.jsx   Editor for grouping novels under a franchise/series

    forms/
      FormField.jsx               Labeled input wrapper
      ComboBox.jsx                Searchable dropdown / autocomplete
      MultiSelect.jsx             Multi-value select input

    modals/
      SeriesModal.jsx             Series detail popup
      FranchiseCreateModal.jsx    Create-franchise inline modal
      CreateNewEntityModal.jsx    Generic create-entity modal (used in Add flow)

    tracker/
      DashboardCard.jsx           Anime/TV/cartoon tracker card with episode progress
      NovelDashboardCard.jsx      Novel tracker card with volume/chapter progress
      MyTrackerCard.jsx           Unified watch/read status + rating + progress block (used on detail pages)
      NovelTrackerBlock.jsx       Extended novel progress tracker (used on Novel detail page)

    charts/
      BarChart.jsx                Reusable horizontal bar chart

  hooks/
    useToast.jsx                  Toast state provider + useToast() hook

  contexts/
    AuthContext.jsx               Auth state (isAdmin, username) — checks /api/auth/me on mount

  utils/
    media.js                      Shared helpers: getCoverUrl, getDisplayName, getSortName, isBaha,
                                  getStatusButtonConfig, getReadingButtonConfig, getCardStatusConfig,
                                  getRatingWeight, getReleaseFallback, cleanString, formatLength,
                                  parseTypes, MEDIA_CONFIG, buildAnimePayload, buildAnimeMoviePayload
    statsUtils.js                 Statistics calculation helpers
```

---

## Routes

| Path | Page |
|------|------|
| `/` | Index |
| `/login` | Login |
| `/search` | Search |
| `/future-releases` | FutureReleases |
| `/completions` | Completions |
| `/plan` | Plan |
| `/statistics` | Statistics |
| `/seasonal` | SeasonalOverall |
| `/seasonal/:id` | SeasonalDetail |
| `/library/anime` | LibraryAnime |
| `/library/anime-movie` | LibraryAnimeMovie |
| `/library/movie` | LibraryMovie |
| `/library/tv-show` | LibraryTV |
| `/library/cartoon` | LibraryCartoon |
| `/library/manga` | LibraryManga |
| `/library/novel` | LibraryNovel |
| `/library/franchise` | FranchiseLibrary |
| `/anime/:id` | Anime |
| `/anime-movie/:id` | AnimeMovie |
| `/movie/:id` | Movie |
| `/tv-show/:id` | TV |
| `/cartoon/:id` | Cartoon |
| `/manga/:id` | Manga |
| `/novel/:id` | Novel |
| `/franchise/:id` | Franchise → FranchisePage |
| `/add` *(admin)* | Add |
| `/modify` *(admin)* | Modify |
| `/delete` *(admin)* | Delete |
| `/system` *(admin)* | Admin |
| `/data-history` *(admin)* | DataHistory |
| `/review-queue` *(admin)* | ReviewQueue |

---

## Page → API Endpoints

| Page | Endpoints |
|------|-----------|
| Index | GET `/api/anime/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/manga/`, `/api/novel/`, `/api/franchise/`; PATCH individual items |
| Login | POST `/api/auth/login` |
| Search | GET all list endpoints + `/api/series/`, `/api/seasonal/` |
| FutureReleases | GET `/api/anime/`, `/api/franchise/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`; PATCH status |
| LibraryAnime | GET `/api/anime/`, `/api/franchise/`, `/api/series/`; PATCH status |
| LibraryAnimeMovie | GET `/api/anime-movie/`, `/api/franchise/`; PATCH status |
| LibraryMovie | GET `/api/movies/`, `/api/franchise/`; PATCH status |
| LibraryTV | GET `/api/tv-shows/`, `/api/franchise/`; PATCH status |
| LibraryCartoon | GET `/api/cartoon/`, `/api/franchise/`; PATCH status |
| LibraryManga | GET `/api/manga/`, `/api/franchise/`; PATCH status |
| LibraryNovel | GET `/api/novel/`, `/api/franchise/`; PATCH status |
| FranchiseLibrary | GET `/api/franchise/` + all media lists (with `?limit=2000`) |
| Anime | GET `/api/anime/:id`, `/api/franchise/`, `/api/series/`, `/api/anime/`; PATCH, POST complete, POST replace |
| AnimeMovie | GET `/api/anime-movie/:id`, `/api/franchise/`; PATCH, POST complete, POST replace |
| Movie | GET `/api/movies/:id`, `/api/franchise/`; PATCH, POST replace |
| TV | GET `/api/tv-shows/:id`, `/api/franchise/`; PATCH, POST replace |
| Cartoon | GET `/api/cartoon/:id`, `/api/franchise/`; PATCH, POST replace |
| Manga | GET `/api/manga/:id`, `/api/franchise/`; PATCH, POST replace |
| Novel | GET `/api/novel/:id`, `/api/franchise/`; PATCH, POST replace |
| FranchisePage | GET `/api/franchise/:id`, `/api/anime/`, `/api/anime-movie/`, `/api/movies/`, `/api/tv-shows/`, `/api/cartoon/`, `/api/manga/`, `/api/novel/`, `/api/series/`; PATCH items |
| Plan | GET all media lists + `/api/franchise/`, `/api/system/config/current_season` |
| Statistics | GET all media lists + `/api/franchise/` |
| Completions | GET all media lists + `/api/franchise/` |
| SeasonalOverall | GET `/api/seasonal/`, `/api/franchise/` |
| SeasonalDetail | GET `/api/seasonal/:id`, `/api/anime/`, `/api/franchise/` |
| Add | GET + POST all entity endpoints + `/api/options/` |
| Modify | GET + PUT/PATCH all entity endpoints + `/api/options/` |
| Delete | GET + DELETE all entity endpoints |
| Admin | GET/POST `/api/system/`, `/api/data-control/` |
| DataHistory | GET `/api/data-control/deleted-records/` |
| ReviewQueue | GET/PATCH `/api/data-control/review-queue/` |
| *Notes pages* | GET + PATCH individual media endpoint for notes field |

---

## Data Flow

```
AuthContext (on mount)
  └─ GET /api/auth/me → isAdmin, username

Page component
  ├─ fetch() in useEffect → raw API data → useState
  ├─ useMemo → filtered/sorted list
  └─ render
       ├─ MediaCard / FranchiseCard / DashboardCard — compact cards
       ├─ InfoCard / NamingCard / ScoreBlock / SourcesCard — detail sections
       └─ MyTrackerCard / NovelTrackerBlock — status + progress editors
```

Status/progress mutations go through inline `fetch()` PATCH calls inside card or tracker components. `onUpdated(updated)` callback propagates the new object back to the parent's state array.

---

## Key Shared Utilities (`utils/media.js`)

| Export | Purpose |
|--------|---------|
| `MEDIA_CONFIG` | Per-type config: API endpoint, nav path, status field, status type |
| `getCoverUrl(file)` | Returns local `/static/covers/` or GCS URL depending on hostname |
| `FALLBACK_SVG` | Gray "No Image" placeholder |
| `getDisplayName(item, type)` | Primary display name using `{type}_name_cn` → `_en` → ... fallback |
| `getSortName(item, type)` | Sort-stable name (English first) |
| `getStatusButtonConfig(status)` | Watch-status cycle config (symbol, color, next target) |
| `getReadingButtonConfig(status)` | Read-status cycle config |
| `getCardStatusConfig(type, status)` | Routes to watch or read config by type |
| `getReleaseFallback(anime)` | Season/year or month/year release string |
| `getRatingWeight(rating)` | Numeric weight for S/A+/A/B/C/D/E/F sort |
| `cleanString(str)` | Lowercase, punctuation-stripped string for search matching |
| `formatLength(minutes)` | "2hr 15min" format |
| `isBaha(item)` | True if source_baha flag is set |
| `parseTypes(franchiseType)` | Splits comma-separated franchise type string |
