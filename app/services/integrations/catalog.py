"""
What each external API actually writes, per media type - as data.

The question this answers is the one a Fill or Replace run raises: I pointed
the pipeline at Tenrai, so what did it just change? Two different answers hide
behind that, and they are the reason the catalog exists:

  * Per FIELD - the write rule. Nearly every column is fill-only, written only
    when it is None. Nine are overwritten on every run, and the set is still
    deliberately small and shaped, not arbitrary: the three ratings
    (mal_rating, mal_rank, imdb_rating), the Metacritic score, the three
    current prices (price_current_us/jp/tw), and the two personal-progress
    columns (hours_played, achievements_earned). Those nine ARE "what gets
    replaced" - everything else stays fill-only, so a pipeline never rewrites
    something a person typed by hand. The two progress columns carry extra
    guards on top of being overwrite fields: steam_progress_sync=False skips
    both outright, and a zero or unknown value never overwrites a real one -
    see autofill_game_from_steam.
  * Per MEDIA TYPE - which pipelines exist at all. Comic and Studio have no
    bulk Replace; Comic is out of Fill All to protect its hourly quota. Game's
    bulk Replace runs its Steam half only - nothing in an IGDB record drifts.

Note what Replace is NOT: a different set of writes. `apply_single_replace_*`
in post_processing.py calls the same `autofill_*` function Fill calls, with the
same `force_replace_ratings=True`. Fill and Replace differ only in which
entries they select - Fill takes entries with something missing, Replace takes
every entry carrying an external id. So a per-field "Fill column / Replace
column" would print the same value twice, and this module deliberately records
one rule per field instead.

Hand-authored, because the rules are imperative code in
app/services/domain/autofill.py and there is nothing to derive them from. The
pipeline flags below are the exception - they are read off PIPELINES at
request time, never re-typed here. tests/api/test_external_api_catalog.py
guards the rest against drift: media keys against PIPELINES, column names
against the model, source keys against these client modules.

Served read-only to admins at GET /api/constants/external-apis and rendered by
frontend/src/pages/admin/ExternalApis.jsx. The prose version, with the mapping
rules this file omits, is docs/external-apis.md.
"""

from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

# A write's rule: when the value actually lands. Only "overwrite" can change
# something that is already there; every other rule leaves existing data alone.
WRITE_RULES: dict[str, str] = {
    "fill-only": "Written only when the column is empty. A second run changes nothing.",
    "overwrite": (
        "Rewritten on every run whenever the API returns a value. "
        "This is what Replace is for."
    ),
    "conditional": "Fill-only, plus a further gate - the note says which.",
    "if-absent": (
        "A credit, tag or source row added only when the entry has none of that "
        "kind yet. Existing rows are never edited or removed."
    ),
    "if-empty": (
        "An image downloaded only when the entry has no file yet. Done last, so "
        "a failed download cannot cost the cheap columns."
    ),
    "never": "Fetched and mapped, but deliberately not stored. The note says why.",
}

# Where a write lands.
WRITE_TARGETS: dict[str, str] = {
    "column": "a column on the entry's own table",
    "image": "a cover or logo in Google Cloud Storage, keyed on the entry",
    "credit": "a media_credit row",
    "tag": "a media_tag row",
    "source": "a media_source row",
    "none": "nothing - mapped but not stored",
}

# The targets whose `field` is a real column, and so can be checked against the
# model. A credit role or tag field is not a column and is spelled for a reader.
COLUMN_TARGETS: frozenset[str] = frozenset({"column", "image"})

# How a media type's sources relate to each other.
COMBINATIONS: dict[str, str] = {
    "single": "One source.",
    "merged": "Both are fetched for every entry and their results merged.",
    "either-or": (
        "One or the other per entry, never both - the routing note says which."
    ),
}


@dataclass(frozen=True)
class Service:
    """One external API, as the page's reference column."""

    key: str
    label: str
    module: str
    base_url: str
    auth: str
    rate_limit: str
    docs_anchor: str


@dataclass(frozen=True)
class Write:
    field: str
    target: str
    rule: str
    note: str = ""


@dataclass(frozen=True)
class SourceBlock:
    source: str
    writes: tuple[Write, ...]


@dataclass(frozen=True)
class Coverage:
    key: str  # must be a PIPELINES key
    keyed_by: str  # the column the lookup runs on
    combination: str
    sources: tuple[SourceBlock, ...]
    requests_per_entry: str
    note: str = ""


# ---------------------------------------------------------------------------
# The services
# ---------------------------------------------------------------------------

SERVICES: dict[str, Service] = {
    "tenrai": Service(
        key="tenrai",
        label="Tenrai (MyAnimeList)",
        module="app.services.integrations.tenrai",
        base_url="https://api.tenrai.org/v1",
        auth="None - public read-only mirror",
        rate_limit="4 / second and 120 / minute; 1 s between entries",
        docs_anchor="tenrai-myanimelist",
    ),
    "tmdb": Service(
        key="tmdb",
        label="TMDB",
        module="app.services.integrations.tmdb",
        base_url="https://api.themoviedb.org/3",
        auth="TMDB_API_KEY, as a query parameter",
        rate_limit="40 / 10 seconds",
        docs_anchor="tmdb",
    ),
    "omdb": Service(
        key="omdb",
        label="OMDb",
        module="app.services.integrations.omdb",
        base_url="http://www.omdbapi.com",
        auth="OMDB_API_KEY",
        rate_limit="1000 / day (free tier)",
        docs_anchor="omdb",
    ),
    "comicvine": Service(
        key="comicvine",
        label="Comic Vine",
        module="app.services.integrations.comicvine",
        base_url="https://comicvine.gamespot.com/api",
        auth="COMICVINE_API_KEY",
        rate_limit="200 / hour - Fill stops when the budget is gone",
        docs_anchor="comic-vine",
    ),
    "openlibrary": Service(
        key="openlibrary",
        label="Open Library",
        module="app.services.integrations.openlibrary",
        base_url="https://openlibrary.org",
        auth="None - no key exists",
        rate_limit="100 / minute (politeness, not an enforced quota)",
        docs_anchor="open-library",
    ),
    "igdb": Service(
        key="igdb",
        label="IGDB",
        module="app.services.integrations.igdb",
        base_url="https://api.igdb.com/v4",
        auth=(
            "IGDB_CLIENT_ID + IGDB_CLIENT_SECRET, as a refreshed Twitch OAuth token"
        ),
        rate_limit="4 / second",
        docs_anchor="igdb",
    ),
    "steam": Service(
        key="steam",
        label="Steam",
        module="app.services.integrations.steam",
        base_url="https://store.steampowered.com/api (+ api.steampowered.com)",
        auth=(
            "none for the storefront; STEAM_API_KEY + STEAM_ID for playtime "
            "and achievements earned"
        ),
        rate_limit="~200 requests / 5 minutes per IP, observed not documented",
        docs_anchor="steam",
    ),
}

# A missing key is never fatal: the client logs and returns None, so the run
# simply fills nothing from that source.
KEY_MISSING_BEHAVIOUR = (
    "A missing key is never fatal. The client logs "
    '"<NAME> environment variable is not set." and returns nothing, so the run '
    "fills nothing from that source and moves on."
)

# ---------------------------------------------------------------------------
# The coverage, per media type
# ---------------------------------------------------------------------------

# Tenrai returns an anime's links in one list; the two the app keeps become
# media_source reference rows rather than columns.
_TENRAI_LINKS = (
    Write(
        "Official site",
        "source",
        "if-absent",
        "a reference media_source row, from Tenrai's external links",
    ),
    Write(
        "Twitter",
        "source",
        "if-absent",
        "a reference media_source row; matched on twitter.com or x.com",
    ),
)

EXTERNAL_APIS: tuple[Coverage, ...] = (
    Coverage(
        key="anime",
        keyed_by="mal_id",
        combination="single",
        requests_per_entry="1",
        sources=(
            SourceBlock(
                source="tenrai",
                writes=(
                    Write(
                        "airing_type",
                        "column",
                        "fill-only",
                        "anything outside TV/Movie/ONA/OVA/Special becomes Other",
                    ),
                    Write("airing_status", "column", "fill-only"),
                    Write(
                        "release_season",
                        "column",
                        "fill-only",
                        "winter/spring/summer/fall to WIN/SPR/SUM/FAL",
                    ),
                    Write(
                        "release_date",
                        "column",
                        "fill-only",
                        "precision taken from MAL's own aired string, never padded",
                    ),
                    Write("ep_total", "column", "fill-only"),
                    *_TENRAI_LINKS,
                    Write("mal_rating", "column", "overwrite"),
                    Write("mal_rank", "column", "overwrite"),
                    Write("cover_image_file", "image", "if-empty"),
                ),
            ),
        ),
    ),
    Coverage(
        key="anime-movie",
        keyed_by="mal_id",
        combination="single",
        requests_per_entry="1",
        note="Same Tenrai anime record as Anime, read for fewer columns.",
        sources=(
            SourceBlock(
                source="tenrai",
                writes=(
                    Write("airing_status", "column", "fill-only"),
                    Write("release_date_jp", "column", "fill-only"),
                    *_TENRAI_LINKS,
                    Write("mal_rating", "column", "overwrite"),
                    Write("mal_rank", "column", "overwrite"),
                    Write("cover_image_file", "image", "if-empty"),
                    Write(
                        "ep_total",
                        "none",
                        "never",
                        "mapped by the shared anime mapper; a movie has no episode "
                        "count worth storing",
                    ),
                ),
            ),
        ),
    ),
    Coverage(
        key="movie",
        keyed_by="imdb_id",
        combination="merged",
        requests_per_entry="3",
        note="OMDb wins on imdb_rating, the only key the two sources share.",
        sources=(
            SourceBlock(
                source="tmdb",
                writes=(
                    Write("length_min", "column", "fill-only"),
                    Write("release_date_usa", "column", "fill-only"),
                    Write(
                        "airing_status",
                        "column",
                        "fill-only",
                        "derived, not fetched: a release date on or before today "
                        "is Finished Airing",
                    ),
                    Write(
                        "director",
                        "credit",
                        "if-absent",
                        "the first crew member with job Director; movies has no "
                        "director column",
                    ),
                    Write("cover_image_file", "image", "if-empty"),
                ),
            ),
            SourceBlock(
                source="omdb",
                writes=(
                    Write(
                        "imdb_rating",
                        "column",
                        "overwrite",
                        "the one thing TMDB does not expose",
                    ),
                ),
            ),
        ),
    ),
    Coverage(
        key="tv-show",
        keyed_by="imdb_id",
        combination="merged",
        requests_per_entry="4",
        note=(
            "A fourth call fetches the one season this entry is, taken from "
            "season_part."
        ),
        sources=(
            SourceBlock(
                source="tmdb",
                writes=(
                    Write(
                        "release_date",
                        "column",
                        "fill-only",
                        "the season's air date, not the show's",
                    ),
                    Write(
                        "ep_total",
                        "column",
                        "conditional",
                        "fill-only, and skipped when the season reports zero episodes",
                    ),
                    Write(
                        "airing_status",
                        "column",
                        "fill-only",
                        "derived: a future air date is Not Yet Aired, an undated or "
                        "future episode is Airing",
                    ),
                    Write(
                        "cover_image_file",
                        "image",
                        "if-empty",
                        "the season poster, falling back to the show's",
                    ),
                ),
            ),
            SourceBlock(
                source="omdb",
                writes=(Write("imdb_rating", "column", "overwrite"),),
            ),
        ),
    ),
    Coverage(
        key="cartoon",
        keyed_by="imdb_id",
        combination="merged",
        requests_per_entry="3 for a Movie, 4 for a TV cartoon",
        note=(
            "Routes on airing_type: Movie takes the movie path, TV the season "
            "path, anything else is skipped entirely."
        ),
        sources=(
            SourceBlock(
                source="tmdb",
                writes=(
                    Write(
                        "release_date",
                        "column",
                        "fill-only",
                        "the film's release date, or the season's air date",
                    ),
                    Write(
                        "ep_total",
                        "column",
                        "conditional",
                        "TV path only, and skipped when the season reports zero "
                        "episodes",
                    ),
                    Write(
                        "airing_status",
                        "column",
                        "fill-only",
                        "derived, by whichever path ran",
                    ),
                    Write("cover_image_file", "image", "if-empty"),
                    Write(
                        "length_ep_min",
                        "none",
                        "never",
                        "the mapper computes it from the season's episode runtimes, "
                        "but the autofill does not write it",
                    ),
                ),
            ),
            SourceBlock(
                source="omdb",
                writes=(Write("imdb_rating", "column", "overwrite"),),
            ),
        ),
    ),
    Coverage(
        key="manga",
        keyed_by="mal_id",
        combination="single",
        requests_per_entry="1",
        sources=(
            SourceBlock(
                source="tenrai",
                writes=(
                    Write(
                        "serialization_status",
                        "column",
                        "fill-only",
                        "Finished/Publishing/On Hiatus/Discontinued become "
                        "完結/連載中/停更/腰斬",
                    ),
                    Write("release_date", "column", "fill-only"),
                    Write("end_date", "column", "fill-only"),
                    Write(
                        "vol_total",
                        "column",
                        "conditional",
                        "only once serialization_status is 完結 - a running series' "
                        "totals stay blank",
                    ),
                    Write(
                        "ch_total",
                        "column",
                        "conditional",
                        "only once serialization_status is 完結",
                    ),
                    Write("mal_rating", "column", "overwrite"),
                    Write("mal_rank", "column", "overwrite"),
                    Write("cover_image_file", "image", "if-empty"),
                ),
            ),
        ),
    ),
    Coverage(
        key="novel",
        keyed_by="mal_id",
        combination="either-or",
        requests_per_entry="1 via Tenrai; 1 to 3 via Open Library",
        note=(
            "A mal_link routes to Tenrai, which returns strictly more. Open "
            "Library covers only the novels MAL does not have, and its stored "
            "work id names the entry's anchor book rather than the whole entry - "
            "which is why it writes so little. Bulk Replace only selects "
            "MAL-linked rows, so an Open-Library-only novel is never re-fetched; "
            "every Open Library write is fill-only, so there is nothing for "
            "Replace to redo."
        ),
        sources=(
            SourceBlock(
                source="tenrai",
                writes=(
                    Write(
                        "serialization_status",
                        "column",
                        "fill-only",
                        "adds 未出 for Not yet published, which manga does not take",
                    ),
                    Write("release_date", "column", "fill-only"),
                    Write("end_date", "column", "fill-only"),
                    Write(
                        "vol_total_original",
                        "column",
                        "conditional",
                        "only once serialization_status is 完結",
                    ),
                    Write(
                        "ch_total",
                        "column",
                        "conditional",
                        "only once serialization_status is 完結",
                    ),
                    Write("mal_rating", "column", "overwrite"),
                    Write("mal_rank", "column", "overwrite"),
                    Write("cover_image_file", "image", "if-empty"),
                ),
            ),
            SourceBlock(
                source="openlibrary",
                writes=(
                    Write(
                        "release_date",
                        "column",
                        "fill-only",
                        "the earliest edition year; the editions call is skipped "
                        "entirely when a date is already set",
                    ),
                    Write(
                        "author",
                        "credit",
                        "if-absent",
                        "the authors call is skipped entirely when an author credit "
                        "already exists",
                    ),
                    Write("cover_image_file", "image", "if-empty"),
                ),
            ),
        ),
    ),
    Coverage(
        key="comic",
        keyed_by="comicvine_id",
        combination="single",
        requests_per_entry="1",
        note=(
            "Fill-only throughout, and Fill Comic runs on its own: it is out of "
            "Fill All, and stops early when the hourly budget is gone."
        ),
        sources=(
            SourceBlock(
                source="comicvine",
                writes=(
                    Write(
                        "release_date",
                        "column",
                        "fill-only",
                        "the volume's start year, at year precision",
                    ),
                    Write("issue_total", "column", "fill-only"),
                    Write(
                        "volume_label",
                        "column",
                        "fill-only",
                        "the start year in brackets, e.g. (2018)",
                    ),
                    Write(
                        "author",
                        "credit",
                        "if-absent",
                        "Comic Vine's writer credits",
                    ),
                    Write(
                        "illustrator",
                        "credit",
                        "if-absent",
                        "Comic Vine's penciler / penciller / artist credits; inker "
                        "never matches",
                    ),
                    Write("publisher", "credit", "if-absent"),
                    Write(
                        "cover_image_file",
                        "image",
                        "if-empty",
                        "Comic Vine's stock placeholder images are recognised and "
                        "rejected",
                    ),
                    Write(
                        "comic_name_en",
                        "none",
                        "never",
                        "the name is the entry's identity, and often a deliberate "
                        "shorthand",
                    ),
                ),
            ),
        ),
    ),
    Coverage(
        key="game",
        keyed_by="igdb_id",
        combination="merged",
        requests_per_entry=(
            "6 - the IGDB game and its time-to-beat, three Steam storefronts, "
            "and one achievement call, skipped entirely when "
            "steam_progress_sync is false; the Steam library is fetched once "
            "a run"
        ),
        note=(
            "Two sources keyed on different columns: IGDB on igdb_id, Steam "
            "on steam_appid - supplied by IGDB's external_games, or read "
            "from a hand-typed steam_link, both written by IGDB rather than "
            "Steam itself. The tag writes go through the alias layer: IGDB "
            "speaks English and the vocabulary is Chinese, and a term with "
            "no alias row is logged and skipped, never stored raw - see the "
            "Alias Conversion page. Steam writes columns only and never "
            "touches that layer."
        ),
        sources=(
            SourceBlock(
                source="igdb",
                writes=(
                    Write(
                        "release_date",
                        "column",
                        "fill-only",
                        "Unix seconds read as UTC, so a midnight release does not "
                        "shift a day",
                    ),
                    Write("igdb_link", "column", "fill-only"),
                    Write(
                        "hltb_main",
                        "column",
                        "fill-only",
                        "from IGDB's game_time_to_beats, converted from seconds to "
                        "hours - HowLongToBeat itself is never called",
                    ),
                    Write("hltb_main_extra", "column", "fill-only"),
                    Write("hltb_completionist", "column", "fill-only"),
                    Write(
                        "base_game_id",
                        "column",
                        "conditional",
                        "fill-only, and only when IGDB's parent game is already in "
                        "the database",
                    ),
                    Write(
                        "studio",
                        "credit",
                        "if-absent",
                        "IGDB's developer - a game's developer is its studio",
                    ),
                    Write("publisher", "credit", "if-absent"),
                    Write("game_genre", "tag", "if-absent", "alias-resolved"),
                    Write("game_theme", "tag", "if-absent", "alias-resolved"),
                    Write("game_mode", "tag", "if-absent", "alias-resolved"),
                    Write(
                        "game_platform",
                        "tag",
                        "if-absent",
                        "alias-resolved; a whole console generation folds into one "
                        "family, and the duplicate is dropped",
                    ),
                    Write("cover_image_file", "image", "if-empty"),
                    Write(
                        "game_name_en",
                        "none",
                        "never",
                        "the name is the entry's identity, and often a deliberate "
                        "shorthand",
                    ),
                    Write(
                        "summary",
                        "none",
                        "never",
                        "games has no summary column by design; a synopsis belongs "
                        "in the entry's notes",
                    ),
                    Write(
                        "steam_appid",
                        "column",
                        "fill-only",
                        "from IGDB's external_games; the appid and steam_link are "
                        "adopted as a pair, and only when the entry carries "
                        "neither - a hand-typed link with a still-blank appid is "
                        "never paired with IGDB's appid, which can name a "
                        "different app entirely",
                    ),
                    Write("steam_link", "column", "fill-only"),
                ),
            ),
            SourceBlock(
                source="steam",
                writes=(
                    Write(
                        "metacritic_score",
                        "column",
                        "overwrite",
                        "the critic metascore; Steam does not publish the user "
                        "score, so metacritic_user_score stays hand-typed",
                    ),
                    Write(
                        "price_original_us",
                        "column",
                        "fill-only",
                        "the undiscounted list price, not the launch price - a "
                        "permanent price cut is not chased",
                    ),
                    Write("price_original_jp", "column", "fill-only"),
                    Write("price_original_tw", "column", "fill-only"),
                    Write(
                        "price_current_us",
                        "column",
                        "overwrite",
                        "what it costs today; this is what a game Replace is for",
                    ),
                    Write("price_current_jp", "column", "overwrite"),
                    Write("price_current_tw", "column", "overwrite"),
                    Write("achievements_total", "column", "fill-only"),
                    Write(
                        "hours_played",
                        "column",
                        "overwrite",
                        "from the Steam library, in hours; skipped entirely when "
                        "steam_progress_sync is false, and a zero never "
                        "overwrites a hand-typed figure",
                    ),
                    Write(
                        "achievements_earned",
                        "column",
                        "overwrite",
                        "same two guards as hours_played; an unknown count is "
                        "not a zero",
                    ),
                    Write(
                        "metacritic_user_score",
                        "none",
                        "never",
                        "Steam does not publish it",
                    ),
                    Write(
                        "genres",
                        "none",
                        "never",
                        "IGDB already owns the game vocabulary through the "
                        "alias layer; a second one would fight it",
                    ),
                ),
            ),
        ),
    ),
    Coverage(
        key="studio",
        keyed_by="mal_id",
        combination="single",
        requests_per_entry="1",
        note=(
            "MAL calls a studio a producer, and its URL is "
            "/anime/producer/<id>/<slug>, which needs its own id pattern. Strictly "
            "fill-only: a producer record carries no score or rank that drifts, so "
            "there is no Replace at all. It also runs inside the studio write "
            "request, so every failure is logged and swallowed - a flaky Tenrai "
            "must never turn a save into a 500."
        ),
        sources=(
            SourceBlock(
                source="tenrai",
                writes=(
                    Write("mal_link", "column", "fill-only"),
                    Write(
                        "founded_date",
                        "column",
                        "fill-only",
                        "a producer carries no precision block, so a year-only "
                        "founding is stored as that January 1st",
                    ),
                    Write(
                        "name_jp",
                        "column",
                        "fill-only",
                        "the Japanese title only; the Default title and the Synonym "
                        "are dropped",
                    ),
                    Write(
                        "website_url",
                        "column",
                        "fill-only",
                        "the first link that is not a social host - a studio's site "
                        "is listed under its own domain",
                    ),
                    Write("logo_file", "image", "if-empty"),
                ),
            ),
        ),
    ),
)


# ---------------------------------------------------------------------------
# Payload
# ---------------------------------------------------------------------------


def catalog_payload() -> dict:
    """
    The catalog as plain JSON, with the pipeline flags read off PIPELINES.

    Those flags are derived rather than declared above precisely because they
    are the part most likely to be edited elsewhere: flipping `in_replace_all`
    on a spec must light the page up without anyone remembering this file.
    """
    # Imported here rather than at module scope: specs.py pulls in the whole
    # domain/autofill layer, and this module is imported by a router.
    from app.services.pipelines.specs import PIPELINES

    return {
        "services": [
            {
                "key": s.key,
                "label": s.label,
                "base_url": s.base_url,
                "auth": s.auth,
                "rate_limit": s.rate_limit,
                "docs_anchor": s.docs_anchor,
                "feeds": [
                    c.key
                    for c in EXTERNAL_APIS
                    if any(b.source == s.key for b in c.sources)
                ],
            }
            for s in SERVICES.values()
        ],
        "rules": [{"key": k, "description": v} for k, v in WRITE_RULES.items()],
        "targets": [{"key": k, "description": v} for k, v in WRITE_TARGETS.items()],
        "combinations": [
            {"key": k, "description": v} for k, v in COMBINATIONS.items()
        ],
        "key_missing_behaviour": KEY_MISSING_BEHAVIOUR,
        "media": [
            {
                "key": c.key,
                "label": PIPELINES[c.key].label,
                "keyed_by": c.keyed_by,
                "combination": c.combination,
                "requests_per_entry": c.requests_per_entry,
                "note": c.note,
                # Derived, never declared - see the docstring.
                "in_fill_all": PIPELINES[c.key].in_fill_all,
                "has_bulk_replace": PIPELINES[c.key].replace_select is not None,
                "fill_only": PIPELINES[c.key].fill_only,
                "budget_limited": PIPELINES[c.key].budget is not None,
                "sources": [
                    {
                        "source": b.source,
                        "label": SERVICES[b.source].label,
                        "writes": [
                            {
                                "field": w.field,
                                "target": w.target,
                                "rule": w.rule,
                                "note": w.note,
                            }
                            for w in b.writes
                        ],
                    }
                    for b in c.sources
                ],
            }
            for c in EXTERNAL_APIS
        ],
    }
