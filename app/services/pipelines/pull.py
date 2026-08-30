"""Pull pipeline: restore data from Google Sheets tabs."""

import json
import logging

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Collection,
    Franchise,
    Manga,
    Meme,
    Movies,
    Note,
    Quote,
    Series,
    SystemConfigs,
    TVShows,
    WatchOrderList,
)
from app.services.domain import (
    resolve_anime_movie_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_comic_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_movie_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
)
from app.services.domain.credits import (
    names_from_sheet_value,
    replace_credits,
    replace_tags,
)
from app.services.integrations.sheets import (
    SheetsUnavailableError,
    get_all_raw_rows,
)
from app.services.pipelines.tabs import (
    MEDIA_TYPE_FOR_TAB as _MEDIA_TYPE_FOR_TAB,
)
from app.services.pipelines.tabs import (
    TAB_MODELS,
    TAB_NAMES,
    TAB_PARSERS,
)
from app.utils.credit_roles import credit_roles_for, sheet_column_for, tag_fields_for
from app.utils.data_control_utils import log_data_control
from app.utils.formatter import (
    parse_row_to_dict,
)

logger = logging.getLogger(__name__)

# Hyphenated media_type key (app/utils/media_resolver.py's MEDIA_TABLES) for
# every entry tab that carries credit/tag link columns. Drives the pop-and-
# apply step below: a tab absent here has no link columns to restore.
MEDIA_TYPE_FOR_TAB = _MEDIA_TYPE_FOR_TAB


# Restore order for Pull All. STRICT: parents before children (FK constraints).
TABS_IN_ORDER = TAB_NAMES


def execute_pull_specific(
    db: Session, tab_name: str, action_type: str = "Manual", log_action: bool = True
) -> dict:
    """
    Pulls data from a specific Google Sheet tab and gracefully Upserts it into PostgreSQL.
    Tracks exact rows added vs updated for logging.
    """
    MODEL_MAP = TAB_MODELS
    PARSER_MAP = TAB_PARSERS

    if tab_name not in MODEL_MAP:
        return {"status": "error", "message": f"Unknown tab: {tab_name}"}

    logger.info(f"Starting Pull Pipeline for '{tab_name}'...")

    try:
        raw_matrix = get_all_raw_rows(tab_name)
    except SheetsUnavailableError as e:
        # A tab we could not read is not a tab with nothing in it. Reporting
        # this as "no data / Success" is how a Google outage used to slip
        # through a full Pull with the tab silently skipped.
        logger.error(f"Pull aborted for '{tab_name}': {e}")
        if log_action:
            log_data_control(
                db,
                "Pull",
                f"Pull {tab_name}",
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {
            "status": "error",
            "message": str(e),
            "reason": "sheet_unavailable",
        }

    if not raw_matrix or len(raw_matrix) < 2:
        logger.info(f"No data found in '{tab_name}' to pull.")
        if log_action:
            log_data_control(db, "Pull", f"Pull {tab_name}", action_type, "Success")
        return {"status": "success", "processed": 0, "rows_added": 0, "rows_updated": 0}

    headers = raw_matrix[0]
    data_rows = raw_matrix[1:]

    Model = MODEL_MAP[tab_name]
    parser = PARSER_MAP[tab_name]

    processed = 0
    rows_added = 0
    rows_updated = 0

    for row in data_rows:
        if not row or not any(row):
            continue

        raw_header_dict = parse_row_to_dict(headers, row)
        clean_header_dict = parser(raw_header_dict)

        # Keep only the columns the sheet header actually carried. Every parser
        # emits its full key set regardless of the incoming header, so a tab
        # whose header row predates a migration would otherwise arrive as
        # {"new_col": None} and the setattr loop below would null a perfectly
        # good DB value on every Pull. parse_row_to_dict builds raw_header_dict
        # purely from the header row, so membership in it is an exact "was this
        # column in the sheet?" test.
        #
        # A blank cell is deliberately NOT filtered: the column is present, it
        # parses to None, and that still means "clear this value".
        clean_header_dict = {
            key: value
            for key, value in clean_header_dict.items()
            if key in raw_header_dict
        }

        # Credit/tag columns (studio, director, genre_main, ...) no longer
        # back a real column on the entry model - Task 10 dropped them once
        # media_credit/media_tag took over. Pop them out under their legacy
        # header names here so neither the setattr loop nor Model(**...)
        # below ever sees them; they are applied via replace_credits/
        # replace_tags once the row itself exists, further down.
        media_type = MEDIA_TYPE_FOR_TAB.get(tab_name)
        pending_credits: list[tuple[str, object]] = []
        pending_tags: list[tuple[str, object]] = []
        if media_type:
            for role in credit_roles_for(media_type):
                header = sheet_column_for(media_type, role.key)
                if header in clean_header_dict:
                    pending_credits.append((role.key, clean_header_dict.pop(header)))
            for field in tag_fields_for(media_type):
                header = sheet_column_for(media_type, field.key)
                if header in clean_header_dict:
                    pending_tags.append((field.key, clean_header_dict.pop(header)))

        # Resolve String Foreign Keys -> Actual UUIDs
        # TV Show uses resolve_tv_show_parent_hierarchy (auto-creates franchise, looks up series)
        if tab_name == "TV Shows" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("tv_name_en"),
                "cn": clean_header_dict.get("tv_name_cn"),
                "alt": clean_header_dict.get("tv_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_tv_show_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Cartoon uses resolve_cartoon_parent_hierarchy (auto-creates franchise with type "Cartoon", looks up series)
        elif tab_name == "Cartoons" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("cartoon_name_en"),
                "cn": clean_header_dict.get("cartoon_name_cn"),
                "alt": clean_header_dict.get("cartoon_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_cartoon_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Manga uses resolve_manga_parent_hierarchy (auto-creates franchise with type "ACG", looks up series)
        elif tab_name == "Manga" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("manga_name_en"),
                "cn": clean_header_dict.get("manga_name_cn"),
                "roman": clean_header_dict.get("manga_name_roman"),
                "jp": clean_header_dict.get("manga_name_jp"),
                "alt": clean_header_dict.get("manga_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_manga_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Novel uses resolve_novel_parent_hierarchy (auto-creates franchise with type "Novel", looks up series)
        elif tab_name == "Novel" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("novel_name_en"),
                "cn": clean_header_dict.get("novel_name_cn"),
                "roman": clean_header_dict.get("novel_name_roman"),
                "jp": clean_header_dict.get("novel_name_jp"),
                "alt": clean_header_dict.get("novel_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_novel_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Comic uses resolve_comic_parent_hierarchy (auto-creates franchise with type "Comic", looks up series)
        elif tab_name == "Comic" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("comic_name_en"),
                "cn": clean_header_dict.get("comic_name_cn"),
                "alt": clean_header_dict.get("comic_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_comic_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Movie uses resolve_movie_parent_hierarchy (auto-creates franchise, looks up series)
        elif tab_name == "Movies" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("movie_name_en"),
                "cn": clean_header_dict.get("movie_name_cn"),
                "alt": clean_header_dict.get("movie_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_movie_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Anime Movie uses resolve_anime_movie_parent_hierarchy (auto-creates franchise if missing)
        elif tab_name == "Anime Movie" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            if fid is None or isinstance(fid, str):
                name_fields = {
                    "en": clean_header_dict.get("anime_movie_name_en"),
                    "cn": clean_header_dict.get("anime_movie_name_cn"),
                    "roman": clean_header_dict.get("anime_movie_name_roman"),
                    "jp": clean_header_dict.get("anime_movie_name_jp"),
                    "alt": clean_header_dict.get("anime_movie_name_alt"),
                }
                clean_header_dict["franchise_id"] = (
                    resolve_anime_movie_parent_hierarchy(db, fid, name_fields)
                )
        elif "franchise_id" in clean_header_dict and isinstance(
            clean_header_dict["franchise_id"], str
        ):
            fname = clean_header_dict["franchise_id"]
            if fname.strip():
                fran = (
                    db.query(Franchise)
                    .filter(
                        or_(
                            Franchise.franchise_name_en == fname,
                            Franchise.franchise_name_cn == fname,
                            Franchise.franchise_name_jp == fname,
                            Franchise.franchise_name_alt == fname,
                        )
                    )
                    .first()
                )
                if fran:
                    clean_header_dict["franchise_id"] = fran.system_id
                else:
                    logger.warning(
                        f"Could not resolve franchise FK for: {fname}. Skipping row."
                    )
                    continue

        if "collection_id" in clean_header_dict and isinstance(
            clean_header_dict["collection_id"], str
        ):
            cname = clean_header_dict["collection_id"].strip()
            resolved = None
            if cname:
                resolved = (
                    db.query(Collection)
                    .filter(
                        or_(
                            Collection.collection_name_en == cname,
                            Collection.collection_name_cn == cname,
                            Collection.collection_name_roman == cname,
                            Collection.collection_name_jp == cname,
                            Collection.collection_name_alt == cname,
                        )
                    )
                    .first()
                )
                if not resolved:
                    logger.warning(
                        f"Could not resolve collection FK for: {cname}. "
                        "Leaving franchise uncollected."
                    )
            # Deliberately does NOT skip the row: Collection is an optional tier,
            # so an unknown name must not drop an otherwise valid franchise.
            clean_header_dict["collection_id"] = resolved.system_id if resolved else None

        if "series_id" in clean_header_dict and isinstance(
            clean_header_dict["series_id"], str
        ):
            sname = clean_header_dict["series_id"]
            if sname.strip():
                series = (
                    db.query(Series)
                    .filter(
                        or_(
                            Series.series_name_en == sname,
                            Series.series_name_cn == sname,
                            Series.series_name_alt == sname,
                        )
                    )
                    .first()
                )
                if series:
                    clean_header_dict["series_id"] = series.system_id
                else:
                    logger.warning(
                        f"Could not resolve series FK for: {sname}. Skipping row."
                    )
                    continue

        # System Configs, Person Role and System Option Scope are
        # autoincrement integer PKs and use 'id', Seasonal uses 'seasonal',
        # others use 'system_id'. System Options used to have an 'id' PK too,
        # but Task 4 reshaped it onto 'system_id' and Task 10 dropped the
        # 'id' column outright - it belongs with the 'system_id' tabs now.
        if tab_name in ("System Configs", "Person Role", "System Option Scope"):
            pk_field = "id"
        elif tab_name == "Seasonal":
            pk_field = "seasonal"
        else:
            pk_field = "system_id"
        pk_value = clean_header_dict.get(pk_field)

        # Smart Primary Key Logic (Upsert vs Insert)
        if not pk_value or (isinstance(pk_value, str) and not pk_value.strip()):
            existing_record = None
            if tab_name == "Franchise":
                name = clean_header_dict.get(
                    "franchise_name_en"
                ) or clean_header_dict.get("franchise_name_cn")
                if name:
                    existing_record = (
                        db.query(Franchise)
                        .filter(
                            or_(
                                Franchise.franchise_name_en == name,
                                Franchise.franchise_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Collection":
                name = clean_header_dict.get(
                    "collection_name_en"
                ) or clean_header_dict.get("collection_name_cn")
                if name:
                    existing_record = (
                        db.query(Collection)
                        .filter(
                            or_(
                                Collection.collection_name_en == name,
                                Collection.collection_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "System Configs":
                # config_key is UNIQUE, so an id-less row whose key already
                # exists locally would fail the INSERT and roll back the whole
                # tab. Match on the key instead and update it in place.
                config_key = clean_header_dict.get("config_key")
                if config_key:
                    existing_record = (
                        db.query(SystemConfigs)
                        .filter(SystemConfigs.config_key == config_key)
                        .first()
                    )
            elif tab_name == "Watch Order List":
                # An id-less row is matched on owner + name. Items have no
                # natural key at all, so an id-less item row always inserts.
                name = clean_header_dict.get("list_name")
                owner_franchise = clean_header_dict.get("franchise_id")
                owner_collection = clean_header_dict.get("collection_id")
                if name and (owner_franchise or owner_collection):
                    existing_record = (
                        db.query(WatchOrderList)
                        .filter(
                            WatchOrderList.list_name == name,
                            WatchOrderList.franchise_id == owner_franchise,
                            WatchOrderList.collection_id == owner_collection,
                        )
                        .first()
                    )
            elif tab_name == "Meme":
                # An id-less row is matched on the owner plus its text, so
                # re-importing the same sheet updates rather than duplicating.
                # Memes have no name of their own to match on.
                m_owner_type = clean_header_dict.get("owner_type")
                m_owner_id = clean_header_dict.get("owner_id")
                m_text = clean_header_dict.get("text")
                if m_owner_type and m_owner_id and m_text:
                    existing_record = (
                        db.query(Meme)
                        .filter(
                            Meme.owner_type == m_owner_type,
                            Meme.owner_id == m_owner_id,
                            Meme.text == m_text,
                        )
                        .first()
                    )
            elif tab_name == "Note":
                # An id-less row is matched on owner + section + content, so
                # re-importing the same sheet updates rather than duplicating.
                # Notes have no name of their own to match on.
                n_owner_type = clean_header_dict.get("owner_type")
                n_owner_id = clean_header_dict.get("owner_id")
                n_section = clean_header_dict.get("section")
                n_content = clean_header_dict.get("content")
                # Deliberately not guarded on n_content like the other three:
                # a blank cell parses to None (parse_note_from_sheet blanks
                # empty strings before typing), and SQLAlchemy renders
                # `Note.content == None` as IS NULL, so a content-less note
                # still matches its existing row instead of duplicating on
                # every pull. Guarding on it here would make every blank-
                # content row skip the match and insert fresh each time.
                if n_owner_type and n_owner_id and n_section:
                    existing_record = (
                        db.query(Note)
                        .filter(
                            Note.owner_type == n_owner_type,
                            Note.owner_id == n_owner_id,
                            Note.section == n_section,
                            Note.content == n_content,
                        )
                        .first()
                    )
            elif tab_name == "Quote":
                # An id-less row is matched on the entry it belongs to plus its
                # text, so re-importing the same sheet updates rather than
                # duplicating. Quotes have no name of their own to match on.
                q_media_type = clean_header_dict.get("media_type")
                q_entry_id = clean_header_dict.get("entry_id")
                q_text = clean_header_dict.get("text")
                if q_media_type and q_entry_id and q_text:
                    existing_record = (
                        db.query(Quote)
                        .filter(
                            Quote.media_type == q_media_type,
                            Quote.entry_id == q_entry_id,
                            Quote.text == q_text,
                        )
                        .first()
                    )
            elif tab_name == "Series":
                name = clean_header_dict.get("series_name_en") or clean_header_dict.get(
                    "series_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Series)
                        .filter(
                            or_(
                                Series.series_name_en == name,
                                Series.series_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Anime":
                name = clean_header_dict.get("anime_name_en") or clean_header_dict.get(
                    "anime_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Anime)
                        .filter(
                            or_(
                                Anime.anime_name_en == name, Anime.anime_name_cn == name
                            )
                        )
                        .first()
                    )
            elif tab_name == "Anime Movie":
                name = clean_header_dict.get(
                    "anime_movie_name_en"
                ) or clean_header_dict.get("anime_movie_name_cn")
                if name:
                    existing_record = (
                        db.query(AnimeMovies)
                        .filter(
                            or_(
                                AnimeMovies.anime_movie_name_en == name,
                                AnimeMovies.anime_movie_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Movies":
                name = clean_header_dict.get("movie_name_en") or clean_header_dict.get(
                    "movie_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Movies)
                        .filter(
                            or_(
                                Movies.movie_name_en == name,
                                Movies.movie_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "TV Shows":
                name = clean_header_dict.get("tv_name_en") or clean_header_dict.get(
                    "tv_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(TVShows)
                        .filter(
                            or_(
                                TVShows.tv_name_en == name,
                                TVShows.tv_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Cartoons":
                name = clean_header_dict.get(
                    "cartoon_name_en"
                ) or clean_header_dict.get("cartoon_name_cn")
                if name:
                    existing_record = (
                        db.query(Cartoon)
                        .filter(
                            or_(
                                Cartoon.cartoon_name_en == name,
                                Cartoon.cartoon_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Manga":
                name = clean_header_dict.get("manga_name_en") or clean_header_dict.get(
                    "manga_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Manga)
                        .filter(
                            or_(
                                Manga.manga_name_en == name,
                                Manga.manga_name_cn == name,
                            )
                        )
                        .first()
                    )

            if existing_record:
                pk_value = getattr(existing_record, pk_field)
                clean_header_dict[pk_field] = pk_value
            else:
                clean_header_dict.pop(pk_field, None)
                pk_value = None

        # A remark note is a singleton per owner - ix_note_one_remark_per_owner
        # forbids a second row - so a blind INSERT is fatal to the WHOLE tab:
        # the IntegrityError surfaces at db.commit() below, which rolls back
        # every row and returns {"status": "error"}. A sheet remark row whose
        # system_id is missing locally takes exactly that path, and that is the
        # normal case rather than a rare one: the r1e2m3a4r5k6 migration minted
        # fresh UUIDs for every migrated remark, and clearing then re-typing a
        # remark after a backup mints another. So retarget such a row at the
        # remark row the owner already has and update it in place, keeping the
        # local system_id (popped from the payload so it is not overwritten).
        if tab_name == "Note" and clean_header_dict.get("section") == "remark":
            rk_owner_type = clean_header_dict.get("owner_type")
            rk_owner_id = clean_header_dict.get("owner_id")
            if rk_owner_type and rk_owner_id:
                local_remark = (
                    db.query(Note)
                    .filter(
                        Note.owner_type == rk_owner_type,
                        Note.owner_id == rk_owner_id,
                        Note.section == "remark",
                    )
                    .first()
                )
                if local_remark is not None:
                    clean_header_dict.pop(pk_field, None)
                    pk_value = local_remark.system_id

        # Resolve the target row BEFORE sanitizing. The defaults below exist to
        # make an INSERT valid, so applying them to an UPDATE would overwrite a
        # good DB value with a default every time the sheet omits that column -
        # the same silent wipe the header filter above prevents for every other
        # column. A missing PK, or a PK with no local row, means INSERT.
        existing = None
        if pk_value:
            existing = (
                db.query(Model).filter(getattr(Model, pk_field) == pk_value).first()
            )

        # Data Sanitization (Prevent Pydantic Schema 500 Validation Errors).
        # INSERT-only: an UPDATE keeps whatever the row already holds.
        if existing is None:
            # Blank airing_status / airing_type stay NULL: "" is in no
            # vocabulary and defeats every `airing_type in {...}` check.
            if tab_name in ("Anime", "Movies", "Anime Movie", "TV Shows", "Cartoons"):
                if clean_header_dict.get("watching_status") is None:
                    clean_header_dict["watching_status"] = "Might Watch"
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
            elif tab_name == "Manga":
                if clean_header_dict.get("reading_status") is None:
                    clean_header_dict["reading_status"] = "Might Read"
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
            elif tab_name in ("Collection", "Franchise", "Series"):
                # created_at/updated_at are non-nullable on these models, so a
                # tier tab that never carried them still needs a stamp to
                # insert at all.
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()

        # UPSERT LOGIC
        if existing is not None:
            # Update existing record
            for key, value in clean_header_dict.items():
                setattr(existing, key, value)
            rows_updated += 1
            entry = existing
        else:
            # Create new record (PK missing, or provided but absent locally)
            new_record = Model(**clean_header_dict)
            db.add(new_record)
            rows_added += 1
            entry = new_record

        # Apply the credit/tag columns popped out above, now that the row
        # exists. A fresh insert needs a flush first: system_id is a
        # server/Python-side default that is not guaranteed to be populated
        # on the instance until the row actually goes to the database, and
        # media_credit/media_tag rows need a real entry_id to point at.
        if media_type and (pending_credits or pending_tags):
            if entry.system_id is None:
                db.flush()
            for role_key, raw_value in pending_credits:
                replace_credits(
                    db, media_type, entry.system_id, role_key,
                    names_from_sheet_value(raw_value),
                )
            for field_key, raw_value in pending_tags:
                replace_tags(
                    db, media_type, entry.system_id, field_key,
                    names_from_sheet_value(raw_value),
                )

        processed += 1

        # Flush periodically so DB generates new UUIDs immediately for Foreign Key references
        if processed % 50 == 0:
            db.flush()

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing batch for {tab_name}: {e}")
        if log_action:
            log_data_control(
                db,
                "Pull",
                f"Pull {tab_name}",
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e)}

    # Tabs whose rows restore with the sheet's own integer PK. Postgres does
    # not advance a sequence when a value is supplied explicitly, so after a
    # restore into a fresh instance the table holds ids 1..N while its
    # sequence still sits at 1 - and the next INSERT that lets the sequence
    # pick a value fails on the primary key. Resync every one of them.
    #
    # Note there is deliberately NO system_options_id_seq here: that table's
    # key became a UUID (system_id), so it has no sequence to resync.
    id_sequences = {
        "System Configs": ("system_configs_id_seq", "system_configs"),
        "Person Role": ("person_role_id_seq", "person_role"),
        "System Option Scope": ("system_option_scope_id_seq", "system_option_scope"),
    }
    if tab_name in id_sequences:
        sequence, table = id_sequences[tab_name]
        db.execute(
            text(
                f"SELECT setval('{sequence}', "
                f"COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
            )
        )
        db.commit()

    logger.info(
        f"Successfully pulled and upserted {processed} records from '{tab_name}'."
    )
    if log_action:
        log_data_control(
            db,
            "Pull",
            f"Pull {tab_name}",
            action_type,
            "Success",
            rows_added=rows_added,
            rows_updated=rows_updated,
        )

    return {
        "status": "success",
        "processed": processed,
        "rows_added": rows_added,
        "rows_updated": rows_updated,
    }


def execute_pull_all(db: Session, action_type: str = "Manual") -> dict:
    """
    Pulls ALL tabs from Google Sheets into the database.
    WARNING: The execution order is STRICT to satisfy Foreign Key constraints.
    """
    logger.info("Starting Full Pull Pipeline (All Tabs)...")

    tabs_in_order = TABS_IN_ORDER

    results = {}
    unread_tabs = {}
    total_added = 0
    total_updated = 0

    try:
        for tab in tabs_in_order:
            res = execute_pull_specific(db, tab, action_type="Manual", log_action=True)

            if res.get("status") == "error":
                # A Sheets outage on one tab says nothing about the next one,
                # so carry on and report the gap at the end rather than losing
                # a twenty-tab restore to a blip. Any other error is about the
                # data or the DB and stops the run where it stands.
                if res.get("reason") == "sheet_unavailable":
                    logger.error(f"Tab '{tab}' could not be read: {res.get('message')}")
                    unread_tabs[tab] = res.get("message")
                    continue

                raise Exception(f"Pull failed on tab {tab}: {res.get('message')}")

            total_added += res.get("rows_added", 0)
            total_updated += res.get("rows_updated", 0)
            results[tab] = res.get("processed", 0)

    except Exception as e:
        logger.error(f"Full Pull Pipeline crashed: {e}")
        log_data_control(
            db, "Pull", "Pull All", action_type, "Failed", error_message=str(e)
        )
        raise e

    if unread_tabs:
        summary = (
            "Full Pull Pipeline incomplete. Tabs not pulled: "
            f"{', '.join(unread_tabs)}"
        )
        logger.error(summary)
        log_data_control(
            db,
            "Pull",
            "Pull All",
            action_type,
            "Failed",
            rows_added=total_added,
            rows_updated=total_updated,
            error_message=summary,
            details_json=json.dumps({"pulled": results, "unread": unread_tabs}),
        )
        raise SheetsUnavailableError(summary)

    logger.info("Full Pull Pipeline completed successfully.")
    log_data_control(
        db,
        "Pull",
        "Pull All",
        action_type,
        "Success",
        rows_added=total_added,
        rows_updated=total_updated,
        details_json=json.dumps(results),
    )
    return {"status": "success", "details": results}
