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

Two keys are NOT legacy columns and carry ids instead of a joined string:
`studio_refs` and `credit_refs`. They repeat credits the legacy strings
already name, shaped so a page can link to the entity - those strings have no
ids and are the Sheets contract, so neither replaces the other.
"""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel

from app.schemas.sources import SourceRef


class SourceFields(BaseModel):
    """Attached by services.domain.sources.attach_sources at read time."""

    sources: list[SourceRef] = []


class StudioRef(BaseModel):
    """A studio a page can link to. The `studio` string beside it has no ids."""

    system_id: UUID
    display_name: str


class PublisherRef(BaseModel):
    """
    A publisher a page can link to.

    Shaped like StudioRef plus PersonRef's `label`: one publisher role reads
    台灣代理商 on an anime and 發行商 on a game, so the page can render the
    heading without knowing the vocabulary. credit_label() in
    app/utils/credit_roles.py owns that mapping. StudioRef needs no label:
    a studio is a studio on both types that credit one.
    """

    system_id: UUID
    display_name: str
    label: str


class PersonRef(BaseModel):
    """
    One credited person a page can link to.

    `label` is what the credit is called ON THIS MEDIA TYPE - the same person
    role reads as 原作 on a manga, Author on a novel and Writer on a comic - so
    a page can render the heading without knowing the vocabulary.
    credit_label() in app/utils/credit_roles.py owns that mapping.
    """

    system_id: UUID
    display_name: str
    label: str


class AnimeLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    studio: Optional[str] = None
    studio_refs: list[StudioRef] = []
    director: Optional[str] = None
    producer: Optional[str] = None
    music: Optional[str] = None
    # The publisher credit, carried under the header it has always used: the
    # value moved from media_tag to media_credit, `distributor_tw` did not
    # move at all. sheet_column_for("anime", "publisher") owns that mapping.
    distributor_tw: Optional[str] = None
    publisher_refs: list[PublisherRef] = []
    genre_main: Optional[str] = None
    genre_sub: Optional[str] = None
    label: Optional[str] = None
    quality: Optional[str] = None
    exclusive_source: Optional[str] = None


class AnimeMovieLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    studio: Optional[str] = None
    studio_refs: list[StudioRef] = []
    director: Optional[str] = None
    # Anime Movie is the one type whose distributor column is genuinely new -
    # it never carried publisher_tw - but it takes anime's header, because the
    # two tabs describe the same fact and read the same way.
    distributor_tw: Optional[str] = None
    publisher_refs: list[PublisherRef] = []
    exclusive_source: Optional[str] = None


class MovieLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    director: Optional[str] = None
    # Movie never had a legacy source_official column; the tag field is
    # offered on movies, so the key is its own name.
    original_source: Optional[str] = None


class TvShowLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    # Legacy sheet column stays "source_official" - sheet_column_for maps the
    # renamed field key back to it.
    source_official: Optional[str] = None


class CartoonLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    source_official: Optional[str] = None


class MangaLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    author_plot: Optional[str] = None
    author_draw: Optional[str] = None
    # The publisher credit under the header manga has always used - see
    # AnimeLinkFields.
    publisher_tw: Optional[str] = None
    publisher_refs: list[PublisherRef] = []
    serialization_platform: Optional[str] = None


class NovelLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    author: Optional[str] = None
    illustrator: Optional[str] = None
    # The publisher credit under the header novel has always used - see
    # AnimeLinkFields.
    publisher_tw: Optional[str] = None
    publisher_refs: list[PublisherRef] = []
    serialization_platform: Optional[str] = None


class ComicLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    writer: Optional[str] = None
    artist: Optional[str] = None
    # Comic's publisher header is unchanged by the migration: the retired
    # comic_publisher tag already wrote under "publisher", and so does the
    # credit that replaced it. Its unused publisher_tw column is gone.
    publisher: Optional[str] = None
    publisher_refs: list[PublisherRef] = []
    imprint: Optional[str] = None
    continuity: Optional[str] = None
    era: Optional[str] = None
    events: Optional[str] = None


class GameLinkFields(SourceFields):
    credit_refs: dict[str, list[PersonRef]] = {}
    studio_refs: list[StudioRef] = []
    publisher_refs: list[PublisherRef] = []
    studio: Optional[str] = None
    publisher: Optional[str] = None
    director: Optional[str] = None
    composer: Optional[str] = None
    game_genre: Optional[str] = None
    game_theme: Optional[str] = None
    game_mode: Optional[str] = None
    combat_mode: Optional[str] = None
    game_platform: Optional[str] = None
    label: Optional[str] = None


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
    "game": GameLinkFields,
}
