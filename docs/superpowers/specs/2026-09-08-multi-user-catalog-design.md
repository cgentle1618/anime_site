# Multi-user catalogue — design

Status: draft, awaiting review
Date: 2026-09-08
Branch: dev

## Why

The app stores one person's collection. It cannot store two, and the reason is
structural rather than incidental: **every media table mixes facts about the
work with facts about the owner.** `anime` holds `anime_name_en`, `ep_total`,
`mal_rating` and `release_season` in the same row as `watching_status`,
`my_rating`, `ep_fin`, `my_watch_day` and `completed_at`. There is nowhere for a
second person's opinion to go except a second copy of the work.

The target is the shape MyAnimeList, AniList, Letterboxd and IMDb all share:
**one catalogue every user reads, and one list row per user per work.** Getting
there means separating the two kinds of fact that currently share a row, and
giving every "points at some entry" table a real foreign key to point with.

That second half is not scope creep. The codebase already carries the cost of
having no such key, and says so — `tests/api/test_entry_delete_links.py` opens:

> *"media_credit / media_tag address their entry by a FK-less (media_type,
> entry_id) pair - no single foreign key can span the eight media tables - so
> nothing cascades on its own. Without an explicit cleanup the rows outlive the
> entry forever."*

Six tables address entries that way today. Adding a seventh — the highest-write,
highest-row-count table in the system, holding every user's list — without
fixing it would mean a deleted entry silently strands every user's record of it.

## Decisions

| Question | Decision |
|---|---|
| Catalogue shape | **Shared.** One `anime` row for Frieren; per-user list rows beside it |
| Entry identity | New `media` supertable, one row per entry across the nine types |
| What `media` holds | Identity **plus shared catalogue fields** — `display_name`, `cover_image_file`, `franchise_id`, `series_id`, `public_id`, timestamps |
| Detail tables | Keep every type-specific column; PK becomes an FK to `media` |
| List data | One `user_media_list` table, real FK `media_id`, superset of progress columns |
| Grouping tiers | Collection / franchise / series stay **shared and admin-curated** |
| Watch orders | Stay **shared** — one canonical order per series |
| Accounts | **Invite-only.** Admin creates users; no public registration |
| Catalogue writes | **Admin only.** A normal user writes their list and their personal notes |
| List visibility | **Private by default**, per-user public toggle |
| Notes | Scoped **per section** in the registry: catalogue or personal |
| Quotes and memes | **Universal.** Shared, unfiltered, no per-user copies |
| `plan_next`, `seasonal` | **Per user** |
| Sheets transfer | New `Media`, `Users`, `User Media List` tabs carrying a username |
| Rollout | Step 0 (identity) first, then phased **by media type** |

## Non-goals and deferred work

- **Authentication and authorization are deliberately deferred.** This design
  assumes the existing JWT-cookie login and the existing RBAC machinery keep
  working as they do, with one new `user` role. The cookie's `secure=False`, the
  absent fail-fast on a default `JWT_SECRET_KEY`, session lifetime, password
  reset, and the redesign of the `personal_notes` field group are a separate
  piece of work to be designed later. Nothing here should be read as settling
  them. See [What this forces auth to decide later](#what-this-forces-auth-to-decide-later).
- **No public registration**, no user-contributed catalogue entries, no
  moderation queue, no edit history.
- **No social features** — no follows, no comments on other users, no activity
  feed.
- **`public_id` namespace is not unified.** Per-type numbering stays. See
  [Interaction with the public-id/slug design](#interaction-with-the-public-idslug-design).

---

## Architecture

### The `media` supertable

```python
# app/models/media.py
class Media(Base):
    """
    One row per media entry, whatever its type.

    Exists so that anything pointing at "some entry" - a user's list row, a
    credit, a source, a quote - can use a real foreign key instead of a
    (media_type, entry_id) pair, and so that the fields every type shares can
    be queried across types in one place.
    """
    __tablename__ = "media"

    system_id  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Hyphenated, matching MEDIA_TABLES keys: "anime", "anime-movie", "tv-show".
    media_type = Column(String, nullable=False, index=True)
    public_id  = Column(Integer, nullable=False)   # still per-type; see below

    # --- Shared catalogue fields ---
    display_name     = Column(String, nullable=False, index=True)
    cover_image_file = Column(String, nullable=True)
    franchise_id = Column(UUID(as_uuid=True),
                          ForeignKey("franchise.system_id", ondelete="SET NULL"))
    series_id    = Column(UUID(as_uuid=True),
                          ForeignKey("series.system_id", ondelete="SET NULL"))

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        # Lets a detail table FK on (system_id, media_type) and so pin its own
        # type in the database: an anime row can never point at a manga.
        UniqueConstraint("system_id", "media_type", name="uq_media_id_type"),
        UniqueConstraint("media_type", "public_id", name="uq_media_type_public_id"),
    )
```

#### The promotion rule

A field belongs on `media` only when **all nine types have it** *and*
**something queries across types by it**. Both halves are required. `media` is
not a place to put a field because it is convenient; without the rule it becomes
a junk drawer and the detail tables hollow out. The rule goes in the module
docstring, and any addition must name the cross-type query that justifies it.

By that rule the promoted fields qualify:

| Field | All nine? | Cross-type query |
|---|---|---|
| `display_name` | yes, via `NameFallbackMixin` | global search; any list showing mixed types |
| `cover_image_file` | yes | `calculation.py`'s orphan-image scan |
| `franchise_id` | yes | "everything in this franchise", the franchise hub page |
| `series_id` | eight of nine — null for anime movies | "everything in this series"; a watch order's members |
| `public_id` | yes | URL resolution without knowing the type first |

`series_id` is the one imperfect fit — anime movies have no series, so the
column is permanently null for them. Accepted: a null column on the supertable
is cheaper than a franchise page that unions nine tables.

**Rejected promotions**, recorded so they are not relitigated: `my_rating` and
`watching_status` (per-user, not catalogue); `mal_rating` and `mal_id` (only the
MAL-sourced types have them); `airing_status` (spelled `serialization_status` /
`release_status` elsewhere and not the same concept).

#### `display_name` is denormalized, on purpose

`display_name` is derived by `NameFallbackMixin` from the five `*_name_*`
columns on the detail table, CN-first. Editing `anime_name_cn` must recompute
it. This is a real write-path invariant and the only new class of bug the design
introduces.

It is not, however, a new *pattern*: `person`, `studio`, `publisher` and
`character` already each carry a stored `display_name_field` derived the same
way. `media.display_name` follows whatever keeps those current, and gains a
drift test that walks every entry asserting the stored value equals the
recomputed one.

### Detail tables

Every detail table keeps every type-specific column. Only the identity changes.

```python
class Anime(Base, NameFallbackMixin):
    __tablename__ = "anime"

    system_id = Column(
        UUID(as_uuid=True),
        ForeignKey("media.system_id", ondelete="CASCADE"),
        primary_key=True,
    )
    media_type = Column(String, nullable=False, server_default="anime")

    # Type-specific, unchanged: the five anime_name_* columns, season_part,
    # airing_type, airing_status, ep_previous, ep_total, ep_special,
    # mal_rating, mal_rank, anilist_rating, release_season, release_date,
    # broadcast_day, broadcast_time, mal_id, mal_link, seiyuu.

    __table_args__ = (
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            ondelete="CASCADE",
        ),
        CheckConstraint("media_type = 'anime'", name="ck_anime_media_type"),
    )

    media = relationship("Media", backref=backref("anime", uselist=False))
```

**The per-type `public_id` sequences stay where they are.** `public_id` moves to
`media` as a *column*, but each type keeps its own
`Sequence("anime_public_id_seq")` and its own numbering, so existing ids and
existing URLs are unchanged. The sequence is read on insert into `media`, and
the `uq_media_type_public_id` constraint replaces the per-table unique
constraint — including its `DEFERRABLE INITIALLY DEFERRED` setting, which the
Sheets restore depends on (a restore can hand row A an id row B still holds
until the restore reaches B; only the end state has to be unique).

Columns that move **off** the detail tables: `public_id`, `franchise_id`,
`series_id`, `cover_image_file` (to `media`), and the personal five
(`watching_status` / `reading_status` / `playing_status`, `my_rating`, the
`*_fin` progress family, `my_watch_day`, `completed_at`) to `user_media_list`.

### `user_media_list`

```python
class UserMediaList(Base):
    __tablename__ = "user_media_list"

    system_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id   = Column(UUID(as_uuid=True),
                       ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    media_id  = Column(UUID(as_uuid=True),
                       ForeignKey("media.system_id", ondelete="CASCADE"),
                       nullable=False)

    # One status column behind watching_status / reading_status /
    # playing_status. Vocabulary still comes from system_option, scoped by the
    # media's type, so "Might Watch" stays invalid for a game.
    status       = Column(String, nullable=False)
    my_rating    = Column(String, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    my_watch_day = Column(String, nullable=True)   # anime only

    ep_fin           = Column(Integer, nullable=True)  # anime, tv_show, cartoon
    vol_fin          = Column(Float,   nullable=True)  # manga, novel
    vol_fin_page     = Column(Integer, nullable=True)  # manga
    ch_fin           = Column(Float,   nullable=True)  # manga, novel
    arc_fin          = Column(Float,   nullable=True)  # novel
    ch_fin_in_arc    = Column(Float,   nullable=True)  # novel
    progress_display = Column(String,  nullable=True)  # novel
    issue_fin        = Column(Integer, nullable=True)  # comic

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    __table_args__ = (
        UniqueConstraint("user_id", "media_id", name="uq_user_media"),
        Index("ix_user_media_list_user_status", "user_id", "status"),
        Index("ix_user_media_list_media", "media_id"),
    )
```

**The wide, null-heavy shape is the accepted cost.** A manga row leaves `ep_fin`
and `issue_fin` null; a game row leaves almost everything null. The alternative
— nine per-type list tables — makes the central query of the whole feature
("this user's list, all types, sorted by rating") a nine-way `UNION ALL` that
grows with every media type. One wide table with real foreign keys is the better
finished system.

Two child tables stay per-type and gain `user_id` in step 1: `game_copy` (owned
copies are personal) and `novel_unit.my_rating` (a per-unit personal rating,
which becomes `user_novel_unit_rating`).

### Link tables: two groups

**Entry-only — collapse to one `media_id` FK:**

| Table | Before | After |
|---|---|---|
| `media_source` | `media_type`, `entry_id` | `media_id` → `media` |
| `media_credit` | `media_type`, `entry_id` | `media_id` → `media` |
| `media_tag` | `media_type`, `entry_id` | `media_id` → `media` |
| `media_content_label` | `media_type`, `entry_id` | `media_id` → `media` |
| `quote` | `media_type`, `entry_id` | `media_id` → `media` |
| `watch_order_item` | `media_type`, `entry_id` | `media_id` → `media` |

**Owner may be a grouping tier — disjoint FK set.** `note`, `meme` and
`plan_next` resolve through `OWNER_TABLES` (nine media *plus* collection,
franchise, series), so no single `media_id` can hold their owner:

```python
media_id      = Column(UUID, ForeignKey("media.system_id",      ondelete="CASCADE"), nullable=True)
collection_id = Column(UUID, ForeignKey("collection.system_id", ondelete="CASCADE"), nullable=True)
franchise_id  = Column(UUID, ForeignKey("franchise.system_id",  ondelete="CASCADE"), nullable=True)
series_id     = Column(UUID, ForeignKey("series.system_id",     ondelete="CASCADE"), nullable=True)

__table_args__ = (
    CheckConstraint(
        "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
        name="ck_note_one_owner",
    ),
)
```

`owner_type` stops being stored and becomes a read-time derivation from
whichever column is non-null. Every owner now cascades.

**Rejected:** widening the supertable to an `entity` table spanning media *and*
tiers, so `owner_id` could stay a single FK. The three sets that want a
supertable are different — note owners are 9 media + 3 tiers,
`COVER_OWNER_TABLES` is 9 media + staff/character/studio/publisher, and
`public_id` spans all 17 — and the tiers own no image of their own
(`collection.cover_franchise_id` and `franchise.cover_entry_id` borrow a
member's). An `entity` table could therefore hold only `public_id`,
`display_name` and `type`: a thin supertable, which is exactly the shape this
design rejected for `media`. It would resolve `note` elegantly and buy nothing
else, at the price of eighteen more composite-FK-plus-CHECK pairs.

### Notes: scope lives in the registry

`app/utils/note_sections.py` states its own design rule — *"Adding a section is
one entry and no migration"* — so the catalogue/personal distinction goes in the
registry, not the schema:

```python
SCOPE_CATALOG  = "catalog"    # one shared set of rows, admin-authored
SCOPE_PERSONAL = "personal"   # one set per user

@dataclass(frozen=True)
class NoteSection:
    ...
    scope: str  # required; a test forbids every section defaulting
```

On the table, one always-set column:

```python
author_id = Column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
```

`author_id`, not a nullable `user_id`. Every note has an author regardless of
scope; what differs is who it is *filtered* for. This gives provenance on
catalogue notes (nothing records who wrote the OP entry today), and if
user-contributed catalogue notes are ever wanted, only the write permission
changes.

| Scope | Write | Read |
|---|---|---|
| `catalog` | admin only | everyone, unfiltered |
| `personal` | any user, own rows | `WHERE author_id = viewer` — or the profile owner, if their list is public |

**Personal (7):** `remark`, `advantages`, `disadvantages`, `double_edged`,
`episode_comments`, `questions`, `personal_reviews`

**Catalogue (20):** `op`, `ed`, `insert_songs`, `ost`, `op_ed_changes`,
`extended_episodes`, `adaptation`, `resources`, `public_reviews`, `highlights`,
`highlight_episodes`, `highlight_passages`, `highlight_moments`, `analysis`,
`cinematography`, `craft`, `foreshadowing`, `symmetry`, `guides`,
`builds_and_mods`

That is all 29 registry sections: 7 personal, 20 catalogue, plus `quotes` and
`memes`, which are `SHAPE_EXTERNAL` and backed by their own tables rather than
by `note` rows.

**Quotes and memes are universal** — shared, unfiltered, no scope field and no
per-user copies. Both gain `author_id` for provenance and consistency. `quote`
is entry-only and takes the single `media_id` FK; `meme` uses `OWNER_TABLES` and
takes the disjoint FK set.

Changing a section's scope later is a registry edit plus a data reassignment —
no schema change. That is the point of putting it there.

### `plan_next` and `seasonal`

Both become per-user. `plan_next` gains `user_id` alongside its disjoint owner
FKs. `seasonal`'s primary key becomes `(user_id, seasonal)`; its counters are
per-user aggregates today only because there is one user.

---

## Worked example

**Before** — one `anime` row mixing both kinds of fact:

| system_id | public_id | anime_name_en | ep_total | mal_rating | watching_status | my_rating | ep_fin | completed_at |
|---|---|---|---|---|---|---|---|---|
| `a1b2…c3d4` | 412 | Frieren | 28 | 9.31 | Completed | 9.5 | 28 | 2024-03-22 |

**After** — `media`:

| system_id | media_type | public_id | display_name | cover_image_file | franchise_id |
|---|---|---|---|---|---|
| `a1b2…c3d4` | anime | 412 | 葬送的芙莉蓮 | `covers/a1b2.jpg` | `f7…91` |
| `e5f6…a7b8` | manga | 118 | 鏈鋸人 | `covers/e5f6.jpg` | `f8…22` |
| `c9d0…e1f2` | game | 77 | Hollow Knight | `covers/c9d0.jpg` | `f9…03` |

`anime` — catalogue only:

| system_id | anime_name_en | anime_name_cn | ep_total | mal_rating | release_season | airing_status |
|---|---|---|---|---|---|---|
| `a1b2…c3d4` | Frieren | 葬送的芙莉蓮 | 28 | 9.31 | 2023 Fall | Finished |

`user_media_list`:

| user_id | media_id | status | my_rating | ep_fin | completed_at | vol_fin | ch_fin |
|---|---|---|---|---|---|---|---|
| cg1618 | Frieren | Completed | 9.5 | 28 | 2024-03-22 | — | — |
| kana | Frieren | Watching | — | 11 | — | — | — |
| cg1618 | Chainsaw Man | Reading | 8.0 | — | — | 14 | 152 |
| kana | Hollow Knight | Might Play | — | — | — | — | — |

### The queries this makes possible

**Frieren's detail page** — one left join, three different correct answers:

```sql
SELECT m.display_name, a.ep_total, l.status, l.my_rating, l.ep_fin
FROM media m
JOIN anime a ON a.system_id = m.system_id
LEFT JOIN user_media_list l
  ON l.media_id = m.system_id AND l.user_id = :viewer
WHERE m.system_id = :id;
```

cg1618 gets `Completed / 9.5 / 28`; kana gets `Watching / — / 11`; a logged-out
visitor gets the catalogue columns and three nulls. Today the schema cannot
express this at all.

**A user's whole list, all types** — the query that decided the design:

```sql
SELECT m.media_type, m.display_name, l.status, l.my_rating
FROM user_media_list l
JOIN media m ON m.system_id = l.media_id
WHERE l.user_id = :user
ORDER BY l.my_rating DESC NULLS LAST;
```

**Community aggregate** for a detail page, restricted to public lists:

```sql
SELECT l.status, COUNT(*), ROUND(AVG(l.my_rating::numeric), 2)
FROM user_media_list l JOIN users u ON u.id = l.user_id
WHERE l.media_id = :id AND u.list_is_public
GROUP BY l.status;
```

**Global search across all nine types** — one indexed table:

```sql
SELECT media_type, public_id, display_name
FROM media WHERE display_name ILIKE :q;
```

**Deleting an entry.** `DELETE FROM media WHERE system_id = :id` cascades to the
detail row, every user's list row, sources, credits, tags, notes, quotes,
content labels and watch-order items. The hand-written cleanup in `_factory.py`'s
`delete`, in `delete_plans_for`, in `credits.py` and in `sources.py` is deleted,
and `test_entry_delete_links.py` stops testing cleanup code and starts testing
that Postgres cascaded.

---

## Migration

### Step 0 backfill

Entries already have `system_id UUID` primary keys, so `media` is backfilled
with those exact UUIDs and every existing foreign key elsewhere keeps its value
unchanged.

```python
for table, key, name_expr, series_expr in NINE_TYPES:
    op.execute(f"""
        INSERT INTO media (system_id, media_type, public_id, display_name,
                           cover_image_file, franchise_id, series_id,
                           created_at, updated_at)
        SELECT system_id, '{key}', public_id, {name_expr},
               cover_image_file, franchise_id, {series_expr},
               COALESCE(created_at, now()), COALESCE(updated_at, now())
        FROM {table}
    """)
```

`name_expr` is the CN-first `COALESCE` chain matching `NameFallbackMixin`;
`series_expr` is `NULL` for `anime_movies`. A post-migration check asserts
`COUNT(media)` equals the sum of the nine detail-table counts, and that no
`display_name` is empty.

### Step 1 backfill

```python
admin_id = conn.execute(
    sa.text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
).scalar_one()

op.execute(sa.text("""
    INSERT INTO user_media_list (system_id, user_id, media_id, status,
                                 my_rating, completed_at, my_watch_day, ep_fin)
    SELECT gen_random_uuid(), :uid, system_id, watching_status,
           my_rating, completed_at, my_watch_day, ep_fin
    FROM anime
""").bindparams(uid=admin_id))
```

One statement per type, mapping `reading_status` / `playing_status` into
`status`. Then the personal columns are dropped. Existing notes get
`author_id = admin_id`; catalogue-scope sections are already correct, and
personal-scope sections become the admin's, which they already were.

**Rollback:** each step's `downgrade()` is written and exercised in CI against a
seeded database. Steps land as separate migrations so a failure rolls back one
step, not the set.

---

## What else has to change

### Pipelines

Fill, Replace, Pull and the autofill hooks currently write catalogue *and*
personal columns in the same statement. After step 1 they must write catalogue
columns only — a pipeline that can silently change a user's `watching_status` is
a data-loss bug once there is more than one user. Enforced by a test asserting
no pipeline write path names a `user_media_list` column.

`Calculate`'s `COVER_OWNER_TABLES` loop over nine media tables collapses to one
`media` query; the four people/organisation tables keep their own branch.

The completion services (`mark_tv_completed`, `mark_novel_completed`, …) and
`derive_novel_progress` become per-user: they take a `user_id` and write a list
row.

### Google Sheets

Three new tabs in `app/services/pipelines/tabs.py`: `Media`, `Users`,
`User Media List`. The nine media tabs lose their personal columns and their
`public_id` / `franchise` / `cover` columns to `Media`.

Because the tabs are read by a human during an environment switch, each media
tab keeps a **read-only denormalized `display_name` column** so it stays
browsable; Pull ignores it. `User Media List` identifies its entry by
`media_type` + `public_id` and its user by `username`.

Restore ordering becomes strict — `users` and `media` must land before anything
referencing them. A mis-ordered restore now fails loudly on a foreign key
instead of quietly producing orphans. `docs/data-actions.md` gains the ordering
as a documented contract.

### Frontend

- Every detail page reads its own list row from a new `/api/me/list/{media_id}`
  and renders the status / rating / progress controls from it.
- List pages filter and sort on the joined list row; a logged-out viewer sees
  catalogue columns only.
- New `/user/<username>` profile page: their list, all types, subject to their
  visibility setting.
- Detail pages gain a community-aggregate block.
- A settings toggle for list visibility.

### Testing

- Every step lands with tests written first, per the project rule.
- A drift test asserting `media.display_name` matches the recomputed fallback
  for every row.
- A test asserting every `NOTE_SECTIONS` entry declares a `scope`.
- A test walking `MEDIA_TABLES` asserting each detail table has both its
  composite FK and its `media_type` CHECK.
- Cascade tests replacing the manual-cleanup tests, one per link table.
- Two-user fixtures throughout the API suite: the same request as two viewers
  must return two different personal answers and one identical catalogue answer.
- A test asserting no pipeline writes a `user_media_list` column.

---

## Sub-projects

Each is its own spec-to-plan cycle. Step 0 is worth landing even if the rest waits.

| # | Sub-project | Ships |
|---|---|---|
| **0** | `media` supertable backfilled; nine detail tables FK up; six link tables convert | No behaviour change; real cascades; global search possible |
| **1** | `user_media_list`; personal columns migrate to the admin user; pipelines confined to catalogue | The multi-user data model |
| **2** | Invite-only accounts, `user` role, visibility toggle, `/user/<name>` | Actual multi-user |
| **3** | `plan_next` + `seasonal` per user | Personal planning |
| **4** | Sheets tabs with a username column | Two-machine workflow restored |
| **5** | Notes scoped per section; `author_id`; quotes/memes universal + disjoint FKs | Per-user annotation |

Within steps 0 and 1, roll out **one media type at a time** — land the machinery
on `anime` with both paths tested, then port the remaining eight. A single
migration across nine types with the pipelines attached is where this goes
wrong.

---

## Known sharp edges

**Deleting from a detail table orphans the `media` row.**
`DELETE FROM anime WHERE …` cascades downward to nothing and leaves the parent
behind; the cascade only works when deleting from `media`. This inverts the
natural habit, and no constraint catches it. Mitigate with an `AFTER DELETE`
trigger on each detail table that removes its `media` row, plus a test. Fat
`media` helps ergonomically — the fields you queried live on `media`, so
reaching for it first becomes natural — but that is a nudge, not a guarantee.

**Eighteen constraints must stay in sync.** Nine composite
`(system_id, media_type)` FKs and nine `CHECK (media_type = '…')`. They are what
stops a detail row attaching to a `media` row of the wrong type, and Alembic's
autogenerate will not write them. Adding a tenth media type means getting them
right again — hence the drift test above.

**`display_name` can go stale.** The single new bug class. Mitigated by the
drift test and by following the existing `display_name_field` precedent.

**`media` will attract fields it should not have.** Mitigated only by the
promotion rule and by reviewers applying it.

**`user_media_list` is wide and null-heavy.** Accepted, with the reasoning
recorded above so it is not relitigated.

**`media_resolver.py` does not dissolve.** `TIER_TABLES` survives to render
"this note belongs to franchise X", and the four people/organisation tables keep
their own identity. What dies is `(media_type, entry_id)` as a *storage*
pattern.

---

## Interaction with the public-id/slug design

`docs/superpowers/specs/2026-09-07-public-id-slug-urls-design.md` is approved and
unplanned. The two are compatible and the ordering does not matter:

- Its URL shape `/<type>/<public_id>/<slug>` is unchanged. `public_id` moving
  onto `media` for the nine media types changes neither its value nor its
  per-type numbering; the other eight entities keep theirs where they are.
- Its slug is Latin-first and independent of the CN-first display name — exactly
  the split this design keeps, with `media.display_name` CN-first for display
  and the slug derived separately.
- Its scope is 17 tables; this design's supertable is 9. Neither creates what
  the other creates.

If the slug work lands first, step 0's backfill copies `public_id` as-is. If step 0
lands first, the slug work reads `public_id` from `media` for media types and
from the entity table otherwise.

---

## What this forces auth to decide later

Recorded here so the deferred auth work has its inputs, not to settle them:

- **The `personal_notes` field group changes meaning.** Today it gates
  `personal_reviews` from viewers, because there is one author and it is the
  admin. Once personal sections filter by `author_id`, a viewer never sees
  another user's personal notes by construction, so the field group protects
  nothing on the entry page. It becomes the permission governing *profile*
  reads: "may see another user's personal notes when their list is public."
  Coherent, but a different job — `docs/authorization.md` needs rewriting rather
  than amending.
- **The `user` role is three permissions**, not a new system: guest reads, plus
  write-own-list, plus write-own-personal-notes. Catalogue writes stay
  `admin`-only, so no new admin surface appears.
- **`entry_visible` and the content-label checks** now run against a shared
  catalogue rather than one person's collection. The logic is unchanged; what
  changes is that "hidden" means hidden from a role, not from the owner.
- **Real accounts make the deferred hardening urgent.** The cookie's
  unconditional `secure=False` and the absent fail-fast on a default
  `JWT_SECRET_KEY` / `ADMIN_PASSWORD` are tolerable for a single local user and
  are not tolerable once other people have passwords in this database. Step 2
  should not ship before that work does.

---

## Open questions

None blocking. Two to answer before step 2 is planned:

1. Does a user's public profile expose their personal notes, or only their list?
   (Assumed: only the list, with notes behind the reworked `personal_notes`
   permission.)
2. Do community aggregates count private lists? (Assumed: no — public lists
   only, which means a small site shows small numbers.)
