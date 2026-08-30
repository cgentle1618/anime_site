"""
Read-only link fields carried on every media entry response.

Twenty-six comma-joined string columns (anime.studio, comic.era, ...) were
migrated into media_credit / media_tag and dropped. The public pages still
render an entry from ONE list or detail response, so the payload keeps
carrying those keys - now derived at read time by
`app.services.domain.credits.attach_link_fields` instead of stored.

Deliberately mixed into the *Response schemas only, never into the Create /
Update bases: naming one of these on a write must still be rejected, because
the only writer is PUT /api/credits/{media_type}/{entry_id}.

The attribute names are the LEGACY column names, not the credit-role keys
(anime's composer credit is served as `music`, comic's comic_era tag as
`era`). `credit_roles.sheet_column_for` owns that mapping and is the single
source of it; tests/unit/test_link_fields_schema.py asserts these classes stay
in step with it, so a new role or field cannot be added on one side only.
"""

from typing import Optional

from pydantic import BaseModel


class AnimeLinkFields(BaseModel):
    studio: Optional[str] = None
    director: Optional[str] = None
    producer: Optional[str] = None
    music: Optional[str] = None
    distributor_tw: Optional[str] = None
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    label: Optional[str] = None


class AnimeMovieLinkFields(BaseModel):
    studio: Optional[str] = None
    director: Optional[str] = None


class MovieLinkFields(BaseModel):
    director: Optional[str] = None
    # Movie never had a legacy source_official column; the tag field is
    # offered on movies, so the key is its own name.
    source_official: Optional[str] = None


class TvShowLinkFields(BaseModel):
    source_official: Optional[str] = None


class CartoonLinkFields(BaseModel):
    source_official: Optional[str] = None


class MangaLinkFields(BaseModel):
    author_plot: Optional[str] = None
    author_draw: Optional[str] = None
    publisher_tw: Optional[str] = None


class NovelLinkFields(BaseModel):
    author: Optional[str] = None
    illustrator: Optional[str] = None
    publisher_tw: Optional[str] = None


class ComicLinkFields(BaseModel):
    writer: Optional[str] = None
    artist: Optional[str] = None
    publisher: Optional[str] = None
    imprint: Optional[str] = None
    continuity: Optional[str] = None
    era: Optional[str] = None
    events: Optional[str] = None
    publisher_tw: Optional[str] = None


# media_type key (hyphenated) -> mixin, for the drift test.
LINK_FIELD_MIXINS: dict[str, type[BaseModel]] = {
    "anime": AnimeLinkFields,
    "anime-movie": AnimeMovieLinkFields,
    "movie": MovieLinkFields,
    "tv-show": TvShowLinkFields,
    "cartoon": CartoonLinkFields,
    "manga": MangaLinkFields,
    "novel": NovelLinkFields,
    "comic": ComicLinkFields,
}
