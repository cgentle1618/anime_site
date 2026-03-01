from pydantic import BaseModel
from typing import Optional


class AnimeResponse(BaseModel):
    system_id: str

    series_en: Optional[str] = None
    series_season_en: Optional[str] = None
    series_season_roman: Optional[str] = None
    series_season_cn: Optional[str] = None
    series_season: Optional[str] = None

    airing_type: Optional[str] = None
    my_progress: Optional[str] = None
    airing_status: Optional[str] = None
    ep_total: Optional[int] = None
    ep_fin: Optional[int] = None
    rating_mine: Optional[str] = None

    main_spinoff: Optional[str] = None
    release_date: Optional[str] = None
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    distributor_tw: Optional[str] = None

    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    remark: Optional[str] = None

    mal_id: Optional[int] = None
    mal_link: Optional[str] = None
    anilist_link: Optional[str] = None

    op: Optional[str] = None
    ed: Optional[str] = None
    insert_ost: Optional[str] = None
    seiyuu: Optional[str] = None

    source_baha: Optional[str] = None
    source_netflix: Optional[str] = None

    mal_rating: Optional[float] = None
    cover_image_url: Optional[str] = None

    class Config:
        from_attributes = True


# --- NEW SCHEMA: Anime Series ---
class AnimeSeriesResponse(BaseModel):
    system_id: str
    series_en: Optional[str] = None
    series_roman: Optional[str] = None
    series_cn: Optional[str] = None
    rating_series: Optional[str] = None
    alt_name: Optional[str] = None

    class Config:
        from_attributes = True
