from pydantic import BaseModel
from typing import Optional


class AnimeResponse(BaseModel):
    # Core Identifiers
    system_id: str

    # Naming & Titles
    series_en: Optional[str] = None
    series_roman: Optional[str] = None
    series_cn: Optional[str] = None
    series_season_en: Optional[str] = None
    series_season_roman: Optional[str] = None
    series_season_cn: Optional[str] = None
    alt_name: Optional[str] = None

    # Status & Progress
    airing_type: Optional[str] = None
    my_progress: Optional[str] = None
    airing_status: Optional[str] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = 0
    rating_mine: Optional[str] = None

    # Production Info
    main_spinoff: Optional[str] = None
    release_date: Optional[str] = None
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    distributor_tw: Optional[str] = None

    # Genres & Notes
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    remark: Optional[str] = None

    # External Links & IDs
    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None

    # Music & Cast
    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None

    # Streaming Sources
    source_baha: Optional[str] = None
    source_netflix: Optional[str] = None

    # External API Data
    mal_rating: Optional[float] = None
    cover_image_url: Optional[str] = None

    class Config:
        # This tells Pydantic to read directly from your SQLAlchemy ORM models
        from_attributes = True


# --- We will use this in the next step (Phase 3, Step 3) ---
class ProgressUpdate(BaseModel):
    ep_fin: int
