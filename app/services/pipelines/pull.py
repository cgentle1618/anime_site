"""Pull pipeline: restore data from Google Sheets tabs."""

import json
import logging
from typing import Optional

from sqlalchemy import Sequence, or_, text
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.ext.associationproxy import AssociationProxyExtensionType
from sqlalchemy.orm import Session

from app.database import get_taipei_now
from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Collection,
    Franchise,
    Manga,
    Media,
    Meme,
    Movies,
    Note,
    Quote,
    Role,
    Series,
    SystemConfigs,
    SystemOption,
    TVShows,
    User,
    WatchOrderList,
)
from app.services.domain import (
    resolve_anime_movie_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_comic_parent_hierarchy,
    resolve_game_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_movie_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
)
from app.services.domain.credits import (
    AmbiguousNameError,
    find_person,
    find_publisher,
    find_studio,
    names_from_sheet_value,
    replace_credits,
    replace_tags,
)
from app.services.domain.user_list import installation_owner_id
from app.services.integrations.sheets import (
    SheetsUnavailableError,
    get_all_raw_rows,
)
from app.services.pipelines.tabs import (
    AUTHZ_TABS,
    TAB_BY_NAME,
    TAB_MODELS,
    TAB_NAMES,
    TAB_PARSERS,
)
from app.services.pipelines.tabs import (
    MEDIA_TYPE_FOR_TAB as _MEDIA_TYPE_FOR_TAB,
)
from app.services.security import UNUSABLE_PASSWORD_HASH
from app.utils.credit_roles import (
    CREDIT_ROLES,
    credit_roles_for,
    sheet_column_for,
    tag_fields_for,
)
from app.utils.data_control_utils import log_data_control
from app.utils.formatter import (
    parse_from_sheet,
    parse_row_to_dict,
)

logger = logging.getLogger(__name__)

# The find-only half of credits.resolve_*, keyed the way CreditRole.target is.
# Used to tell "this name matched nothing and is about to be invented" from
# "this name resolved", which resolve_* alone cannot report.
_FINDERS = {
    "person": find_person,
    "studio": find_studio,
    "publisher": find_publisher,
}

# Hyphenated media_type key (app/utils/media_resolver.py's MEDIA_TABLES) for
# every entry tab that carries credit/tag link columns. Drives the pop-and-
# apply step below: a tab absent here has no link columns to restore.
MEDIA_TYPE_FOR_TAB = _MEDIA_TYPE_FOR_TAB


# Restore order for Pull All. STRICT: parents before children (FK constraints).
TABS_IN_ORDER = TAB_NAMES


# ---------------------------------------------------------------------------
# Derived identity: rows whose system_id is minted, not carried by the source.
#
# system_option, person and studio hold no identity of their own in the
# spreadsheet - they are DERIVED, minted row by row by the credit backfill and
# by extract_system_options. Two databases that run those migrations therefore
# end up with the SAME natural keys under COMPLETELY DIFFERENT system_ids, and
# a sheet backed up from one of them is full of uuids the other has never seen.
#
# Resolving such a row by system_id alone misses every time, and the INSERT
# that follows collides with the UNIQUE constraint the same logical row already
# occupies - which rolls back the whole tab. So for these tabs the sheet's uuid
# is only a hint; what actually identifies the row across databases is the
# natural key its UNIQUE constraint already names. Same reasoning, and the same
# keep-the-local-uuid handling, as the Note remark block further down.
# ---------------------------------------------------------------------------

# tab -> the columns of that table's natural-key UNIQUE constraint.
DERIVED_IDENTITY_KEYS: dict[str, tuple[str, ...]] = {
    # The admin account is minted by app/main.py's lifespan on every machine,
    # so the same person holds a different uuid here and there. username is
    # UNIQUE and is what actually identifies them across databases. NOT in
    # DERIVED_IDENTITY_MINTED_PK: that set is for autoincrement integer keys,
    # where the sheet's id names an unrelated local row. A uuid that misses is
    # merely unknown, so trying it first is free and correctly follows a
    # username RENAMED in the sheet to the row that already holds it.
    "Users": ("username",),  # users.username is UNIQUE
    "System Options": ("category", "value"),  # uq_system_option_value
    "Person": ("name_en", "name_cn", "name_jp", "name_alt"),  # uq_person_name
    "Studio": ("name_en", "name_cn", "name_jp", "name_alt"),  # uq_studio_name
    "Publisher": (
        "name_en", "name_cn", "name_jp", "name_alt",
    ),  # uq_publisher_name
    "System Option Scope": ("option_id", "scope"),  # uq_system_option_scope
    "System Option Usage": ("option_id", "usage"),  # uq_system_option_usage
    "System Option Alias": (
        "option_id",
        "source",
        "value",
    ),  # uq_system_option_alias
    "Content Label": ("key",),  # content_label.key is UNIQUE
    "Person Role": ("person_id", "role", "scope"),  # uq_person_role
    # No `role` in the key: a publisher holds exactly one.
    "Publisher Scope": ("publisher_id", "scope"),  # uq_publisher_scope
    # These two mint their own uuid but cite entry ids, which the sheet does
    # carry and which are the same in every database - so only the row's own
    # identity needs reconciling, never what it points at.
    "Media Relation": (
        "from_type",
        "from_id",
        "relation_type",
        "to_type",
        "to_id",
    ),  # uq_media_relation_pair
    # user_id is part of the key: the same franchise may be queued by two
    # users, and the sheet's uuid belongs to whichever database last backed up.
    "Plan Next": (
        "kind",
        "media_type",
        "user_id",
        "media_id",
        "franchise_id",
        "series_id",
    ),  # uq_plan_next_target
    # Mints its own uuid but cites an entry id, which is the same in every
    # database. option_id IS part of the key (unlike the parent tabs above,
    # whose own uuid never appears in it): two "main" rows on the same entry
    # citing different platforms are two different rows even though both have
    # name=NULL, and only option_id tells them apart. It is resolved from the
    # sheet's option_category/option_value into a LOCAL option_id further
    # down, before this match runs, so by the time it is used here it is
    # already a same-database uuid, comparable the ordinary way.
    "Media Source": (
        "media_id",
        "kind",
        "bucket",
        "option_id",
        "name",
    ),  # uq_media_source_row
    # Same shape as Media Source: mints its own uuid, cites an entry id that is
    # the same everywhere, and a label_id that is NOT - but which the parent
    # translation below has already turned into a local uuid by the time this
    # match runs, so it compares the ordinary way.
    "Media Content Label": (
        "media_id",
        "label_id",
    ),  # uq_media_content_label_row
    # Its system_id is minted per database and the sheet carries a natural key
    # instead; resolve_user_media_list_key turns that into these two ids before
    # the match runs.
    "User Media List": ("user_id", "media_id"),  # uq_user_media
    # The Steam import mints these locally, so the same purchase carries a
    # different system_id on each machine while the natural key is identical.
    # game_id is a real entry uuid and is the same everywhere, so no parent
    # translation is needed - only the fallback match. user_id joined the key
    # in Task 19 and is resolved below, not read from the sheet.
    "Game Copy": (
        "user_id", "game_id", "storefront", "copy_format",
    ),  # uq_game_copy_row
}

# Tabs that cite one of the above by raw uuid. The sheet carries the OTHER
# database's uuid, so it has to be translated through the parent's own tab
# before it can be stored here.
DERIVED_IDENTITY_PARENTS: dict[str, tuple[str, str]] = {
    "System Option Scope": ("option_id", "System Options"),
    "System Option Usage": ("option_id", "System Options"),
    "System Option Alias": ("option_id", "System Options"),
    "Person Role": ("person_id", "Person"),
    "Publisher Scope": ("publisher_id", "Publisher"),
    "Media Content Label": ("label_id", "Content Label"),
}

# Tabs whose PRIMARY KEY is itself minted per database and must be ignored as
# an identity. The three parent tabs above key on a uuid: it is minted too, but
# a uuid that misses is simply unknown, so trying it first costs nothing and
# correctly follows a value RENAMED in the sheet to the row that already holds
# it. The tabs below key on an autoincrement integer instead, where the sheet's
# id=1 names a real but UNRELATED local row - a match that silently retargets
# the wrong row and then collides. Their natural key is the only identity
# they have.
DERIVED_IDENTITY_MINTED_PK: frozenset[str] = frozenset(
    {
        "System Option Scope",
        "System Option Usage",
        "System Option Alias",
        "Person Role",
        "Publisher Scope",
        # Its uuid is minted per database and the sheet carries no id at all -
        # only the natural key resolve_user_media_list_key turns into two.
        "User Media List",
    }
)



def resync_public_id_sequence(db: Session, model) -> None:
    """
    Move a table's public_id sequence past the ids the restore just wrote.

    Pull inserts rows carrying their own public_id from the sheet, which the
    sequence knows nothing about. Left alone it keeps handing out values the
    restore already used, and the failure surfaces later - on the next entry
    an admin adds - as a unique-constraint error that says nothing about Pull.

    A no-op for tables with no public_id, because Pull walks every tab, and a
    no-op for `media`, which has a public_id but owns no sequence: its value is
    a copy of the detail row's, minted by that table's own sequence. The name
    therefore comes from the column's declared Sequence, never from the table's
    name - deriving it made Pull All crash on "media_public_id_seq does not
    exist" before a single tab was restored.
    """
    from app.models.media import Media
    from app.models.media_sync import MEDIA_TYPE_FOR_MODEL, PUBLIC_ID_SEQUENCE

    if model in PUBLIC_ID_SEQUENCE:
        # A media type: its ids live on `media` now, but each type still draws
        # from its own historic sequence, so existing ids and the URLs built
        # from them are unchanged.
        db.execute(
            text(
                f"SELECT setval('\"{PUBLIC_ID_SEQUENCE[model]}\"', "
                "COALESCE((SELECT MAX(public_id) FROM media "
                "WHERE media_type = :t), 0) + 1, false)"
            ),
            {"t": MEDIA_TYPE_FOR_MODEL[model]},
        )
        return
    if model is Media:
        # The Media tab itself: every type's sequence is resynced by its own
        # entry tab, which restores after it.
        return

    column = model.__table__.columns.get("public_id")
    if column is None:
        return
    table = model.__table__.name
    if not isinstance(column.default, Sequence):
        return
    sequence = column.default.name
    # COALESCE covers an empty table: max() is NULL there and setval would
    # fail. is_called=false makes the next nextval return exactly this value.
    db.execute(
        text(
            f"SELECT setval('\"{sequence}\"', "
            f'COALESCE((SELECT MAX(public_id) FROM "{table}"), 0) + 1, false)'
        )
    )


def drop_non_columns(model, payload: dict) -> dict:
    """
    Keep only keys the model can actually be given.

    A tab may carry columns for a human reader that the model cannot take -
    display_name is derived and lives on `media`. Without this, Pull passes it
    to Model(**payload) and TypeErrors the whole tab.

    "Can be given" is wider than "is a column": cover_image_file, franchise_id
    and series_id are association proxies onto the entry's media row, and
    dropping them here would silently strip the franchise this very module
    just resolved by name a few hundred lines above. Relationships and
    read-only column_properties (media_row, remark) are NOT included - only
    columns and proxies.
    """
    allowed = {c.name for c in model.__table__.columns} | {
        name
        for name, descriptor in sa_inspect(model).all_orm_descriptors.items()
        if descriptor.extension_type
        is AssociationProxyExtensionType.ASSOCIATION_PROXY
    }
    return {k: v for k, v in payload.items() if k in allowed}


def unexpected_headers(tab_name: str, headers: list) -> list[str]:
    """
    The sheet headers this tab can neither store nor explain, in sheet order.

    drop_non_columns silently discards every header that is not a column, and
    silence is right for the ones the tab writes on purpose: the denormalised
    display_name, and the natural keys that stand in for a database-local id
    (username, media_type, public_id on the list tab; option_category and
    option_value on Media Source). It is wrong for a header that means "this
    sheet predates a migration" - step 1 moved watching_status, my_rating and
    the *_fin family onto user_media_list, and the sheet in Google Drive still
    carries them until the next Backup - or "this header is a typo that has
    been quietly discarding a real value". Those are named in the run's
    unresolved_refs so they reach the admin log.

    The legacy credit and tag headers (studio, director, genre_main, ...) are
    expected too: they back no column, but execute_pull_specific pops them out
    by name and applies them through replace_credits / replace_tags.
    """
    model = TAB_MODELS[tab_name]
    known = set(drop_non_columns(model, {h: None for h in headers if h}))
    known |= {name for name, _fn in TAB_BY_NAME[tab_name].extra_columns}
    media_type = _MEDIA_TYPE_FOR_TAB.get(tab_name)
    if media_type:
        for role in credit_roles_for(media_type):
            known.add(sheet_column_for(media_type, role.key))
        for field in tag_fields_for(media_type):
            known.add(sheet_column_for(media_type, field.key))

    seen: list[str] = []
    for header in headers:
        if header and header not in known and header not in seen:
            seen.append(header)
    return seen


def resolve_user_media_list_key(db: Session, payload: dict) -> Optional[str]:
    """
    Turn a User Media List row's natural key into real ids, in place.

    The sheet identifies the entry by (media_type, public_id) and the person by
    username, because a uuid in the sheet belongs to whichever database last
    ran a Backup while public_id is stable and already appears in the URLs.
    This resolves both, writes `media_id` and `user_id` onto the payload and
    removes the three key columns, which are not columns of the model.

    Returns None on success, or a one-line reason when either end cannot be
    resolved. The caller skips the row and puts the reason in the run's
    `unresolved_refs`: inserting it would put a NULL in a NOT NULL foreign key
    and take the whole restore down with it, and guessing which entry was
    meant is worse than saying so. A skipped row is LOST DATA on a restore, so
    the reason has to reach the admin log, not only the server log.
    """
    media_type = payload.pop("media_type", None)
    public_id = payload.pop("public_id", None)
    username = payload.pop("username", None)

    media = None
    if media_type and public_id is not None:
        media = (
            db.query(Media)
            .filter(Media.media_type == media_type, Media.public_id == public_id)
            .first()
        )
    if media is None:
        logger.warning(
            "User Media List: no %s entry with public_id %s; row skipped.",
            media_type, public_id,
        )
        return (
            f"User Media List: entry ({media_type}, {public_id}) is unknown "
            f"here, for user {username!r}"
        )

    user = db.query(User).filter(User.username == username).first() if username else None
    if user is None:
        logger.warning(
            "User Media List: no user named %r; row skipped.", username
        )
        return f"User Media List: user {username!r} is unknown here"

    payload["media_id"] = media.system_id
    payload["user_id"] = user.id
    return None


def _restore_owner_id(db: Session):
    """
    Which account a restored plan_next / seasonal row belongs to.

    Kept as a name local to Pull because that is where the rule is *argued*,
    but it is one line now: the installation owner, shared with Calculate and
    the Game Copy restore below. It used to be a second, private copy of the
    same query, which is how one question came to have two answers.

    Restore-time only. No request path calls this, and it is deliberately not a
    "whose rows does a visitor see" rule - a visitor sees neither table at all,
    and since the guest fallback was removed a visitor has no list either.
    """
    return installation_owner_id(db)


_NOTE_OWNER_COLUMNS = ("media_id", "collection_id", "franchise_id", "series_id")

_NOTE_TIER_COLUMNS = {
    "collection": "collection_id",
    "franchise": "franchise_id",
    "series": "series_id",
}


def _owner_column_filters(model, payload: dict) -> list:
    """The WHERE clauses naming one row's owner, from whichever column is set."""
    return [
        getattr(model, name) == payload[name]
        for name in _NOTE_OWNER_COLUMNS
        if payload.get(name) is not None
    ]


def _note_owner_filters(payload: dict) -> list:
    """The WHERE clauses naming one note's owner."""
    return _owner_column_filters(Note, payload)


def _resolve_owner_columns(db: Session, tab_name: str, payload: dict):
    """
    Turn a Note or Meme row's owner into exactly one of its four FK columns.

    A current sheet carries the columns themselves. One backed up before
    m5b1notefks / m5b2memefks carries the old (owner_type, owner_id) pair
    instead, which the parsers pass through as `_legacy_owner_type` /
    `_legacy_owner_id`; they are resolved here against `media` and the three
    tier tables and then dropped, because they are not columns.

    Returns None when the row is ready to apply, or a message when its owner
    cannot be resolved - the CHECK would reject such a row anyway, so it is
    skipped and reported rather than written.
    """
    owner_type = payload.pop("_legacy_owner_type", None)
    owner_id = payload.pop("_legacy_owner_id", None)

    if any(payload.get(name) is not None for name in _NOTE_OWNER_COLUMNS):
        return None

    if not owner_type or owner_id is None:
        return f"{tab_name}: a row names no owner; row skipped"

    if owner_type in _NOTE_TIER_COLUMNS:
        payload[_NOTE_TIER_COLUMNS[owner_type]] = owner_id
        return None

    media_row = (
        db.query(Media.system_id)
        .filter(Media.system_id == owner_id, Media.media_type == owner_type)
        .first()
    )
    if media_row is None:
        return (
            f"{tab_name}: no {owner_type} entry {owner_id} here to hang a row on; "
            "row skipped"
        )
    payload["media_id"] = owner_id
    return None


def _match_by_natural_key(db: Session, tab_name: str, payload: dict):
    """
    The local row a derived-identity sheet row denotes, or None.

    A key column the sheet header never carried makes the match impossible to
    state, so it returns None rather than matching on a partial key. A NULL
    part of the key compares as IS NULL, which is what the constraints mean:
    n1u2l3l4s5n6d made them NULLS NOT DISTINCT precisely so a person with no
    name_en still collides with themselves.
    """
    key_cols = DERIVED_IDENTITY_KEYS.get(tab_name)
    if not key_cols:
        return None
    if any(col not in payload for col in key_cols):
        return None

    Model = TAB_MODELS[tab_name]
    query = db.query(Model)
    for col in key_cols:
        query = query.filter(getattr(Model, col) == payload[col])
    return query.first()


def _foreign_uuid_map(db: Session, parent_tab: str) -> dict[str, object]:
    """
    {uuid as the sheet spells it: uuid as this database spells it}, for one
    derived-identity parent tab.

    Built by reading the parent's OWN tab and matching each of its rows to a
    local row by natural key. Deriving it from the sheet rather than from a
    map threaded through Pull All is what lets a single-tab Pull of a child
    work on its own - the parent tab need not have been pulled first.
    """
    mapping: dict[str, object] = {}
    try:
        matrix = get_all_raw_rows(parent_tab)
    except SheetsUnavailableError:
        logger.warning(
            "Could not read '%s' to translate its uuids; rows citing an "
            "unknown parent will be skipped.",
            parent_tab,
        )
        return mapping
    if not matrix or len(matrix) < 2:
        return mapping

    headers, parser = matrix[0], TAB_PARSERS[parent_tab]
    for row in matrix[1:]:
        if not row or not any(row):
            continue
        raw = parse_row_to_dict(headers, row)
        payload = {k: v for k, v in parser(raw).items() if k in raw}
        sheet_uuid = payload.get("system_id")
        if not sheet_uuid:
            continue
        local = _match_by_natural_key(db, parent_tab, payload)
        if local is not None:
            mapping[str(sheet_uuid)] = local.system_id
    return mapping


def execute_pull_specific(
    db: Session,
    tab_name: str,
    action_type: str = "Manual",
    log_action: bool = True,
    may_restore_authz: bool = False,
) -> dict:
    """
    Pulls data from a specific Google Sheet tab and gracefully Upserts it into PostgreSQL.
    Tracks exact rows added vs updated for logging.

    `may_restore_authz` says whether the caller holds `admin.authz`. Three tabs
    carry authorization rather than catalogue data - Users, Content Label and
    Media Content Label (AUTHZ_TABS) - and Pull writes the sheet INTO this
    database. Since the sheet is editable by anyone with Google access, a
    caller without that permission must not be able to restore them: otherwise
    typing `admin` into the Users tab's role column and running Pull is a
    promotion. Those tabs are skipped and reported rather than refused, so the
    rest of the restore still lands.

    It defaults to False - least access, not most, the same direction
    role_for_user takes when a role row has vanished. A caller that should be
    able to restore them says so explicitly; the permissive case is therefore
    visible at every call site instead of inherited by accident.
    """
    MODEL_MAP = TAB_MODELS
    PARSER_MAP = TAB_PARSERS

    if tab_name not in MODEL_MAP:
        return {"status": "error", "message": f"Unknown tab: {tab_name}"}

    if tab_name in AUTHZ_TABS and not may_restore_authz:
        message = (
            f"{tab_name}: skipped - restoring it needs admin.authz, because "
            "the sheet decides accounts, roles and content labels."
        )
        logger.warning(message)
        return {
            "status": "skipped",
            "message": message,
            "processed": 0,
            "rows_added": 0,
            "rows_updated": 0,
            "rows_skipped": 0,
            "credit_conflicts": [],
            "created_entities": [],
            # Deliberately NOT unresolved_refs. That list means "a row that
            # should have restored and did not", and it turns the audit row
            # red. This skip is policy working as intended, and for an account
            # without admin.authz it would happen on EVERY run - a permanently
            # red status is noise that teaches people to ignore red.
            "unresolved_refs": [],
            "skipped_tabs": [message],
        }

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
    # Rows whose natural key names an entry or a user this database does
    # not have. Reported rather than inserted with a null foreign key.
    rows_skipped = 0
    # Ambiguous link names, collected rather than raised. An admin resolves
    # these with the merge endpoint, and can only merge what the run reports -
    # so every row is attempted and every collision is kept.
    credit_conflicts: list[str] = []
    # Names that matched no stored entity, so find-or-create is about to mint
    # one. Not an error - a genuinely new studio typed into a sheet cell must
    # still be created - but a silent mint is how 45 duplicate studios grew
    # here unnoticed, so the run reports them.
    created_entities: list[str] = []
    # References the sheet names that this database cannot resolve - an
    # unknown role, an unknown username, an entry no media row matches, a
    # header that is not a column any more. The row is skipped rather than
    # allowed to fail the whole tab, but a skipped row is LOST DATA on a
    # restore, so it is reported rather than only logged. execute_pull_all
    # folds these into the Pull All audit row.
    unresolved_refs: list[str] = []
    # A header this tab cannot store and does not mean to carry. Decided once
    # from the header row rather than per row, because it is a property of the
    # sheet, not of any one entry: a tab with a thousand stale rows must not
    # write a thousand lines into the audit row.
    for stale in unexpected_headers(tab_name, headers):
        unresolved_refs.append(
            f"{tab_name}: column {stale!r} is not on this model any more"
        )

    # Built on first use, and only for the two tabs that need it: reading the
    # parent tab costs a Sheets round trip, so a tab that cites no derived
    # identity never pays for one.
    parent_ref = DERIVED_IDENTITY_PARENTS.get(tab_name)
    foreign_uuids: dict[str, object] | None = None

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
        parsed_all = clean_header_dict
        clean_header_dict = {
            key: value
            for key, value in clean_header_dict.items()
            if key in raw_header_dict
        }

        # The Plan Next tab's header carries the human-readable (scope,
        # target_id) pair, and parse_plan_next_from_sheet translates it into
        # the three owner columns. Those columns are not in the header, so the
        # filter above would drop exactly what the row is about - put them
        # back. All three are written, because "no owner at all" is what the
        # CHECK constraint rejects and what should reject the row.
        if tab_name == "Plan Next" and "target_id" in raw_header_dict:
            for column in ("media_id", "franchise_id", "series_id"):
                clean_header_dict[column] = parsed_all[column]

        # The same shape for Note and Meme. Their parsers rename a pre-
        # m5b1notefks sheet's (owner_type, owner_id) pair to `_legacy_*`, and
        # those names are not in the header either, so the filter above would
        # drop the row's only statement of its owner.
        if tab_name in ("Note", "Meme"):
            for key in ("_legacy_owner_type", "_legacy_owner_id"):
                if key in parsed_all:
                    clean_header_dict[key] = parsed_all[key]

        # The list tab carries a natural key and never the three ids, so this
        # has to run before ANYTHING tries to match the row: the natural-key
        # match itself is on (user_id, media_id), which do not exist in the
        # payload until this resolves them.
        if tab_name == "User Media List":
            unresolved = resolve_user_media_list_key(db, clean_header_dict)
            if unresolved is not None:
                unresolved_refs.append(unresolved)
                rows_skipped += 1
                continue

        # plan_next.user_id and seasonal.user_id are NOT NULL. Both tabs carry
        # `username` since Step 4, and it is resolved here - before the
        # natural-key match below, because user_id is part of both tables'
        # keys, and before the Seasonal upsert, whose primary key IS the pair.
        #
        # The fallback is for a sheet written before Step 4, which has no
        # username header at all: everything in it belonged to one account,
        # and _restore_owner_id names the one the Step 3 migrations backfilled
        # to. A header that IS present and names nobody is a different thing -
        # that row's owner is unknown, so it is skipped and reported rather
        # than quietly filed under the admin.
        if tab_name in ("Plan Next", "Seasonal"):
            username = parse_from_sheet(raw_header_dict.get("username"), str)
            if username:
                owner_row = (
                    db.query(User).filter(User.username == username).first()
                )
                if owner_row is None:
                    logger.warning(
                        "%s: no user named %r; row skipped.", tab_name, username
                    )
                    unresolved_refs.append(
                        f"{tab_name}: user {username!r} is unknown here"
                    )
                    rows_skipped += 1
                    continue
                owner = owner_row.id
            else:
                owner = _restore_owner_id(db)
            if owner is None:
                logger.warning(
                    "No user account exists; skipping the %s row.", tab_name
                )
                rows_skipped += 1
                continue
            clean_header_dict["user_id"] = owner

        # Note and Meme alone carry the pre-m5b1notefks (owner_type, owner_id)
        # pair their parsers rename to _legacy_*; Quote never had one.
        if tab_name in ("Note", "Meme"):
            unresolved = _resolve_owner_columns(db, tab_name, clean_header_dict)
            if unresolved is not None:
                unresolved_refs.append(unresolved)
                rows_skipped += 1
                continue

        # author_id is NOT NULL on all three of note, meme and quote, and it
        # travels as a raw uuid. A user the sheet INSERTS here keeps that uuid
        # (Users is not in DERIVED_IDENTITY_MINTED_PK), so most authors do
        # resolve - but the `admin` account does not: app/main.py mints one on
        # every machine, so the two never shared an id, and the username match
        # in DERIVED_IDENTITY_KEYS keeps the local one and discards the
        # sheet's. Every row the other machine's admin wrote therefore arrives
        # naming a user that does not exist here. That, a blank cell - an older
        # sheet, written before the column existed - or any other unknown id
        # falls back to the admin rather than skipping the row: a line whose
        # author is uncertain is still the line, and the sheet is its only
        # copy. Without this the FK raises at the tab's commit and rolls back
        # every row on it, which is how Pull All lost the whole Quote tab.
        if tab_name in ("Note", "Meme", "Quote"):
            author = clean_header_dict.get("author_id")
            known = (
                db.query(User).filter(User.id == author).first()
                if author is not None
                else None
            )
            if known is None:
                clean_header_dict["author_id"] = _restore_owner_id(db)

        # A copy row belongs to whoever bought it (Task 19). The sheet holds
        # one person's collection and carries no owner column, so the acting
        # user owns every row it restores - and a stale user_id that a Backup
        # did write is ignored rather than trusted, because it names a uuid
        # from whichever database wrote it. Runs before the natural-key match,
        # which now keys on user_id.
        if tab_name == "Game Copy":
            owner = installation_owner_id(db)
            if owner is None:
                rows_skipped += 1
                continue
            clean_header_dict["user_id"] = owner

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

        # A child of a derived-identity tab cites its parent by the uuid the
        # OTHER database minted. Translate it to the local one before anything
        # stores it; a reference that survives untranslated is dangling, and
        # the FK violation it raises at commit rolls back the whole tab.
        if parent_ref:
            fk_column, parent_tab = parent_ref
            sheet_ref = clean_header_dict.get(fk_column)
            if sheet_ref is not None:
                known_locally = (
                    db.query(TAB_MODELS[parent_tab])
                    .filter(TAB_MODELS[parent_tab].system_id == sheet_ref)
                    .first()
                )
                if known_locally is None:
                    if foreign_uuids is None:
                        foreign_uuids = _foreign_uuid_map(db, parent_tab)
                    local_ref = foreign_uuids.get(str(sheet_ref))
                    if local_ref is None:
                        logger.warning(
                            "Could not resolve %s %s for the %s tab. Skipping row.",
                            fk_column,
                            sheet_ref,
                            tab_name,
                        )
                        continue
                    clean_header_dict[fk_column] = local_ref

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
        # Game uses resolve_game_parent_hierarchy (auto-creates franchise with
        # type "Game", looks up series)
        elif tab_name == "Game" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("game_name_en"),
                "cn": clean_header_dict.get("game_name_cn"),
                "roman": clean_header_dict.get("game_name_roman"),
                "jp": clean_header_dict.get("game_name_jp"),
                "alt": clean_header_dict.get("game_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_game_parent_hierarchy(db, fid, sid, name_fields)
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

        # Media Source carries the option it targets as (category, value),
        # not as a raw option_id - system_option mints a different uuid in
        # every database (see DERIVED_IDENTITY_KEYS). Resolve it into a LOCAL
        # option_id here, before the natural-key match below runs, so that
        # match compares option_id the ordinary way. option_category/
        # option_value are not real columns on the model (they never reach
        # clean_header_dict, which parse_media_source_from_sheet never
        # emits them into), so they are read straight out of the raw sheet
        # row - the same source pending_credits/pending_tags read from above.
        if tab_name == "Media Source":
            if "option_category" in raw_header_dict or "option_value" in raw_header_dict:
                category = parse_from_sheet(raw_header_dict.get("option_category"), str)
                value = parse_from_sheet(raw_header_dict.get("option_value"), str)
                option = None
                if category and value:
                    option = (
                        db.query(SystemOption)
                        .filter(
                            SystemOption.category == category,
                            SystemOption.value == value,
                        )
                        .first()
                    )
                    if option is None:
                        # Skipping the row, not blanking option_id: a `main`
                        # row with neither option_id nor name violates
                        # ck_media_source_one_target and rolls the WHOLE tab
                        # back, so one value renamed on the other machine
                        # would lose every source. Same treatment as an
                        # unresolvable series FK above.
                        logger.warning(
                            "Could not resolve system_option (%s, %s) for the "
                            "Media Source tab. Skipping row.",
                            category,
                            value,
                        )
                        continue
                clean_header_dict["option_id"] = option.system_id if option else None

        # The Users tab carries the role NAME, not role_id: role.system_id is
        # minted per database by ensure_rbac_seed. Resolve it locally.
        # role_id is NOT NULL with ondelete="RESTRICT", so a row with no
        # resolvable role cannot be stored at all - skip it and report, the
        # way an unresolvable series FK above is handled.
        if tab_name == "Users":
            role_name = parse_from_sheet(raw_header_dict.get("role"), str)
            role = None
            if role_name:
                role = db.query(Role).filter(Role.name == role_name).first()
            if role is None:
                logger.warning(
                    "Could not resolve role %r for user %r on the Users tab. "
                    "Skipping row.",
                    role_name,
                    clean_header_dict.get("username"),
                )
                unresolved_refs.append(
                    f"Users: role {role_name!r} for user "
                    f"{clean_header_dict.get('username')!r} is unknown here"
                )
                rows_skipped += 1
                continue
            clean_header_dict["role_id"] = role.system_id

            # ix_one_installation_owner is a PARTIAL UNIQUE index over the
            # whole table, so restoring the sheet's owner while a different
            # local account still holds the flag raises at the tab's commit
            # and rolls back every user - the failure shape that killed the
            # whole Quote tab in 709f9f00. The sheet is the authority on whose
            # collection this is, so clear the flag locally first and let this
            # row set it. Flushed, not merely staged: the index is checked per
            # statement, not at commit.
            if clean_header_dict.get("is_installation_owner"):
                db.query(User).filter(User.is_installation_owner).update(
                    {"is_installation_owner": False}, synchronize_session=False
                )
                db.flush()

        # System Configs, Person Role, Publisher Scope, System Option Scope
        # and System Option Usage are autoincrement integer PKs and use 'id',
        # Seasonal uses 'seasonal', others use 'system_id'. System Options used
        # to have an 'id' PK too, but Task 4 reshaped it onto 'system_id' and
        # Task 10 dropped the 'id' column outright - it belongs with the
        # 'system_id' tabs now.
        if tab_name in (
            "System Configs",
            "Person Role",
            "Publisher Scope",
            "System Option Scope",
            "System Option Usage",
            # users.id is a UUID, but it is spelled `id`, not `system_id`.
            "Users",
        ):
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
                m_owner = _owner_column_filters(Meme, clean_header_dict)
                m_text = clean_header_dict.get("text")
                if m_owner and m_text:
                    existing_record = (
                        db.query(Meme)
                        .filter(*m_owner, Meme.text == m_text)
                        .first()
                    )
            elif tab_name == "Note":
                # An id-less row is matched on owner + section + content, so
                # re-importing the same sheet updates rather than duplicating.
                # Notes have no name of their own to match on.
                n_owner = _note_owner_filters(clean_header_dict)
                n_section = clean_header_dict.get("section")
                n_content = clean_header_dict.get("content")
                # Deliberately not guarded on n_content like the other three:
                # a blank cell parses to None (parse_note_from_sheet blanks
                # empty strings before typing), and SQLAlchemy renders
                # `Note.content == None` as IS NULL, so a content-less note
                # still matches its existing row instead of duplicating on
                # every pull. Guarding on it here would make every blank-
                # content row skip the match and insert fresh each time.
                if n_owner and n_section:
                    existing_record = (
                        db.query(Note)
                        .filter(
                            *n_owner,
                            Note.section == n_section,
                            Note.content == n_content,
                        )
                        .first()
                    )
            elif tab_name == "Quote":
                # An id-less row is matched on the entry it belongs to plus its
                # text, so re-importing the same sheet updates rather than
                # duplicating. Quotes have no name of their own to match on.
                q_media_id = clean_header_dict.get("media_id")
                q_text = clean_header_dict.get("text")
                if q_media_id and q_text:
                    existing_record = (
                        db.query(Quote)
                        .filter(
                            Quote.media_id == q_media_id,
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
            rk_owner = _note_owner_filters(clean_header_dict)
            if rk_owner:
                local_remark = (
                    db.query(Note)
                    .filter(*rk_owner, Note.section == "remark")
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

        # seasonal's primary key is (user_id, seasonal); matching on the season
        # string alone would update whichever user's row happened to be first.
        if tab_name == "Seasonal" and pk_value:
            existing = (
                db.query(Model)
                .filter(
                    Model.user_id == clean_header_dict["user_id"],
                    Model.seasonal == pk_value,
                )
                .first()
            )

        # A derived-identity row whose uuid is unknown here is almost never a
        # new row - it is this database's own copy under a locally minted uuid
        # (see DERIVED_IDENTITY_KEYS). Retarget it by natural key and keep the
        # LOCAL uuid: media_credit, media_tag, person_role and
        # system_option_scope all point at it, and the sheet's uuid belongs to
        # whichever database last ran a Backup. Popping the PK from the payload
        # is what stops the setattr loop below from overwriting it.
        if tab_name in DERIVED_IDENTITY_MINTED_PK:
            # The sheet's id is meaningless here, including when it "matches".
            clean_header_dict.pop(pk_field, None)
            existing = _match_by_natural_key(db, tab_name, clean_header_dict)
        elif existing is None and tab_name in DERIVED_IDENTITY_KEYS:
            local_row = _match_by_natural_key(db, tab_name, clean_header_dict)
            if local_row is not None:
                clean_header_dict.pop(pk_field, None)
                existing = local_row

        # Data Sanitization (Prevent Pydantic Schema 500 Validation Errors).
        # INSERT-only: an UPDATE keeps whatever the row already holds.
        if existing is None:
            # Blank airing_status / airing_type stay NULL: "" is in no
            # vocabulary and defeats every `airing_type in {...}` check.
            #
            # The watching/reading/playing status defaults that used to live
            # here are gone: status is on user_media_list now, and Pull
            # restoring a media tab must not touch anybody's list. The User
            # Media List tab carries them, and an entry with no list row reads
            # back as user_list.DEFAULT_STATUS anyway.
            #
            # The seven tabs are the ones that had a status default to lose,
            # unchanged. Novel and Comic were never in this branch and are not
            # added here - whether they need a timestamp stamp is a separate
            # question from confining the pipelines.
            if tab_name in (
                "Anime", "Movies", "Anime Movie", "TV Shows", "Cartoons",
                "Game", "Manga",
            ):
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()
            elif tab_name == "Users":
                # hashed_password does not travel (see tabs.py). A restored
                # account gets a hash nothing can verify against; an admin
                # sets a real password through PUT /api/users/{id} here.
                # INSERT-only by construction: an UPDATE that touched this
                # would lock the admin out of their own machine on every
                # Pull All.
                clean_header_dict["hashed_password"] = UNUSABLE_PASSWORD_HASH
            elif tab_name in ("Collection", "Franchise", "Series"):
                # created_at/updated_at are non-nullable on these models, so a
                # tier tab that never carried them still needs a stamp to
                # insert at all.
                if clean_header_dict.get("created_at") is None:
                    clean_header_dict["created_at"] = get_taipei_now()
                if clean_header_dict.get("updated_at") is None:
                    clean_header_dict["updated_at"] = get_taipei_now()

        # Drop any header the sheet carries that is not a column of this
        # model. Placed before the branch, not inside the insert arm: the
        # insert arm would raise TypeError, but the update arm setattr()s
        # silently onto the instance and the row appears to update while
        # nothing is persisted. Only a guard here catches both.
        #
        # The sheet outlives the schema: a Backup taken before a migration
        # keeps its old headers until the next Backup overwrites them. Step 0
        # added this for the denormalised display_name it writes on purpose;
        # step 1's move of the personal columns (watching_status, my_rating,
        # ep_fin, ...) off the nine detail models is the second wave. Which
        # of those headers are UNEXPECTED is decided once per tab, above -
        # see unexpected_headers.
        clean_header_dict = drop_non_columns(Model, clean_header_dict)

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
                # A duplicate entity is a data fault, not a reason to lose the
                # restore: skip this one link, leaving it unset rather than
                # guessing which row was meant, and keep the rest of the row.
                names = names_from_sheet_value(raw_value)
                try:
                    # Looked up before the write, because resolve_* creates on
                    # a miss and afterwards the two cases are indistinguishable.
                    # Held aside until the write succeeds: an ambiguous name
                    # later in the list skips the whole call, and nothing is
                    # created then.
                    finder = _FINDERS[CREDIT_ROLES[role_key].target]
                    minted = [n for n in names if finder(db, n) is None]
                    replace_credits(
                        db, media_type, entry.system_id, role_key,
                        names,
                    )
                except AmbiguousNameError as e:
                    credit_conflicts.append(f"{tab_name} [{role_key}]: {e}")
                    logger.warning(f"Ambiguous {role_key} on '{tab_name}' row: {e}")
                else:
                    for name in minted:
                        created_entities.append(
                            f"{tab_name} [{role_key}]: created {name!r}"
                        )
                        logger.warning(
                            f"Pull created a new {CREDIT_ROLES[role_key].target} "
                            f"for '{tab_name}' [{role_key}]: {name!r}"
                        )
            for field_key, raw_value in pending_tags:
                try:
                    replace_tags(
                        db, entry.system_id, field_key,
                        names_from_sheet_value(raw_value),
                    )
                except AmbiguousNameError as e:
                    credit_conflicts.append(f"{tab_name} [{field_key}]: {e}")
                    logger.warning(f"Ambiguous {field_key} on '{tab_name}' row: {e}")

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
        "Publisher Scope": ("publisher_scope_id_seq", "publisher_scope"),
        "System Option Scope": ("system_option_scope_id_seq", "system_option_scope"),
        "System Option Usage": ("system_option_usage_id_seq", "system_option_usage"),
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

    # The same hazard for public_id, which every entity tab restores from the
    # sheet. Runs after the commit above so MAX() reads the rows that landed.
    resync_public_id_sequence(db, Model)
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
        "rows_skipped": rows_skipped,
        "credit_conflicts": credit_conflicts,
        "created_entities": created_entities,
        "unresolved_refs": unresolved_refs,
    }


def execute_pull_all(
    db: Session, action_type: str = "Manual", may_restore_authz: bool = False
) -> dict:
    """
    Pulls ALL tabs from Google Sheets into the database.
    WARNING: The execution order is STRICT to satisfy Foreign Key constraints.

    `may_restore_authz` is passed straight through to every tab; see
    execute_pull_specific. A caller without it restores the whole catalogue and
    has the three authorization tabs skipped, each named in unresolved_refs so
    the audit row is red and the gap is visible rather than silent.
    """
    logger.info("Starting Full Pull Pipeline (All Tabs)...")

    tabs_in_order = TABS_IN_ORDER

    results = {}
    unread_tabs = {}
    total_added = 0
    total_updated = 0
    # Every ambiguous link seen across every tab. The admin page shows a
    # generic toast and reloads the log table, so the audit row below is the
    # only place these actually reach a human.
    credit_conflicts: list[str] = []
    created_entities: list[str] = []
    # References no local row matched - an unknown role, username or entry,
    # or a header that is not a column any more. Each one is a row that did
    # NOT restore, so it is reported the way an ambiguous credit is: the run
    # still succeeds (the other rows landed), and the audit row is red so the
    # gap is visible.
    unresolved_refs: list[str] = []
    # Tabs a policy gate declined to restore - see AUTHZ_TABS. Reported, but
    # kept out of unresolved_refs so an expected skip does not read as failure.
    skipped_tabs: list[str] = []

    try:
        for tab in tabs_in_order:
            res = execute_pull_specific(
                db,
                tab,
                action_type="Manual",
                log_action=True,
                may_restore_authz=may_restore_authz,
            )

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
            credit_conflicts.extend(res.get("credit_conflicts", []))
            created_entities.extend(res.get("created_entities", []))
            unresolved_refs.extend(res.get("unresolved_refs", []))
            skipped_tabs.extend(res.get("skipped_tabs", []))

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

    if unresolved_refs:
        # Every tab pulled, but some rows named a user, a role or an entry
        # this database does not have, so they did not restore. Not raised:
        # the caller needs the list to act on, and a raise would replace it
        # with a generic error.
        summary = (
            f"Full Pull Pipeline completed with {len(unresolved_refs)} "
            "unresolved reference(s); those rows did not restore. Fix the "
            "sheet or restore the missing parent, then pull again: "
            + "; ".join(unresolved_refs)
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
            details_json=json.dumps(
                {
                    "pulled": results,
                    "unresolved_refs": unresolved_refs,
                    "credit_conflicts": credit_conflicts,
                    "created_entities": created_entities,
                }
            ),
        )
        return {
            "status": "success",
            "details": results,
            "credit_conflicts": credit_conflicts,
            "created_entities": created_entities,
            "unresolved_refs": unresolved_refs,
            "skipped_tabs": skipped_tabs,
        }

    if credit_conflicts:
        # Every tab pulled, but some links were skipped - an incomplete
        # restore, audited the way an unread tab is. Not raised: the caller
        # needs the list to act on, and a raise would replace it with a
        # generic error.
        summary = (
            f"Full Pull Pipeline completed with {len(credit_conflicts)} "
            "ambiguous link(s) skipped. Merge the duplicate entities, then "
            "pull again: " + "; ".join(credit_conflicts)
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
            details_json=json.dumps(
                {
                    "pulled": results,
                    "credit_conflicts": credit_conflicts,
                    "created_entities": created_entities,
                }
            ),
        )
        return {
            "status": "success",
            "details": results,
            "credit_conflicts": credit_conflicts,
            "created_entities": created_entities,
            "unresolved_refs": unresolved_refs,
        }

    if skipped_tabs:
        # Same rule as created_entities below: a policy skip is the gate
        # working, not a failure, so the row stays green and the detail rides
        # in details_json. Without admin.authz this happens on every run.
        logger.warning(
            f"Full Pull Pipeline skipped {len(skipped_tabs)} tab(s) the "
            "caller may not restore: " + "; ".join(skipped_tabs)
        )
    if created_entities:
        # Deliberately still a Success: inventing a studio the sheet named is
        # correct behaviour, and colouring the row red would train the reader
        # to ignore red. The names ride in details_json instead.
        logger.warning(
            f"Full Pull Pipeline created {len(created_entities)} new "
            f"entit(ies) from names that matched nothing: "
            + "; ".join(created_entities)
        )
    elif not skipped_tabs:
        logger.info("Full Pull Pipeline completed successfully.")
    log_data_control(
        db,
        "Pull",
        "Pull All",
        action_type,
        "Success",
        rows_added=total_added,
        rows_updated=total_updated,
        details_json=json.dumps(
            {
                "pulled": results,
                "created_entities": created_entities,
                "skipped_tabs": skipped_tabs,
            }
        ),
    )
    return {
        "status": "success",
        "details": results,
        "credit_conflicts": [],
        "created_entities": created_entities,
        "unresolved_refs": [],
        "skipped_tabs": skipped_tabs,
    }
