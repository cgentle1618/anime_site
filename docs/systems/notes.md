# Notes

Last verified: 2026-09-12

## What this is for

Notes are the structured commentary you attach to anything in the library: a media entry (anime, comic, novel...) or one of the three grouping tiers (collection, franchise, series). Every bullet — an advantage, an episode comment, an OP you still need to find, a link to a resource — is one row in the single `note` table, and a backend registry decides which *sections* exist, which owners they apply to, and what each row may contain. The frontend notes page reads that registry and renders it; it does not know section names itself (with two narrow, documented exceptions). The old per-owner `remark` column is now just one more section, so the same table also feeds the "Remark" field on the Add/Modify forms and detail pages.

## Model

The table lives in `app/models/note.py` (class `Note`, `__tablename__ = "note"`). It is deliberately **one wide table**: every section stores into the same columns and leaves the ones its shape does not use as null. Adding a section is a registry entry, not a migration; adding a *shape* costs one nullable column.

| Column | Type | Notes |
| --- | --- | --- |
| `system_id` | UUID PK | Generated with `uuid.uuid4()`. |
| `media_id` | UUID, indexed | FK `media.system_id` ON DELETE CASCADE. Set when the owner is any of the nine media types. |
| `collection_id` / `franchise_id` / `series_id` | UUID, indexed | FK to the matching tier table, ON DELETE CASCADE. Set when the owner is a grouping tier. |
| `author_id` | UUID, indexed, **NOT NULL** | FK `users.id` ON DELETE CASCADE. Who wrote the row — always set, whatever the section's scope, because a catalogue note has an author too and that is the only provenance the catalogue has. Never read from the payload (`NoteBase` has no such field): the router stamps whoever is asking. |
| `section` | String, indexed | Key of an entry in `NOTE_SECTIONS` (`app/utils/note_sections.py`). |
| `locator` | String | "Where in the work": episode, chapter, scene, timestamp, or source. One free-text column; the section supplies the label and whether it is required. Renamed from `episode` by migration `alembic/versions/l1o2c3a4t5o6_note_episode_to_locator.py`. |
| `kind` | String | First dropdown, only where the section declares `kinds` (highlight type, OP/ED change type, music cut). |
| `status` | String | Second dropdown, only for music sections: Need / Pending / Done. Kept separate from `kind` because one row needs both (which cut it is vs. how far my tracking has got). |
| `title` | String | The name half of a `name_links` row, or the song name in music shapes. |
| `content` | Text | The body. |
| `links` | JSONB | A list of URL strings — always a list, even for shapes that allow one link, so multi-link support needs no migration. |
| `entries` | JSONB | The `name_entries` shape's ordered items: each `{"type": "text"｜"link", "value": str, "label": str｜null}`, in array order. Deliberately **not** folded into `links`, which stays a plain list of URL strings for the seven sections that use it — one column meaning two things is how subtle bugs start. Added by `alembic/versions/g1a2m3e4s5_add_games.py`. |
| `sort_index` | Float | Ordering within one `(owner, section)`. New rows append at `max + 1.0`. |
| `created_at` / `updated_at` | DateTime | Taipei time via `app/database.get_taipei_now`. Nullable — a Pull from a blank sheet cell leaves them None, so `NoteResponse` tolerates that. |

**`owner_type` and `owner_id` are not stored.** The four owner columns above replace the pair, because a pair cannot cascade — it leaves orphan rows behind that `media_resolver` can only flag as missing. Both survive as **read-only Python properties** derived from whichever column is set, so the API wire format, the SPA and the Google Sheets tab all speak the pair — and, being properties rather than columns, they stay out of the sheet row. The API still takes `?owner_type=&owner_id=` and translates them onto the columns (`_owner_filters`, `_owner_columns` in `app/routers/note.py`). `meme` has the identical shape; `quote` is entry-only and so takes one `media_id` alone.

Constraint and indexes (declared in `__table_args__`, so `create_all` test databases enforce them too):

| Name | Definition | Why |
| --- | --- | --- |
| `ck_note_one_owner` | CHECK `num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1` | Exactly one owner, enforced by the database rather than by convention. |
| `ix_note_owner_section` | `(media_id, collection_id, franchise_id, series_id, section)` | The only read path the notes page uses. |
| `ix_note_one_remark_per_owner` | unique `(media_id, collection_id, franchise_id, series_id)` **NULLS NOT DISTINCT**, **WHERE `section = 'remark'`** | Load-bearing: the `remark` read side is a scalar subquery, so a second remark row would make *every read of that owner* raise "more than one row returned by a subquery". `NULLS NOT DISTINCT` is required — three of the four owner columns are always NULL, and Postgres would otherwise treat every row as unique and silently disable the index. Created by `alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py`; name and predicate must stay identical. It is keyed per **owner**, not per owner-per-author, even though `remark` is a personal-scope section — see [Scope](#scope). |

Column declaration order is also the Google Sheets column order, because `format_model_for_sheet` in `app/utils/formatter.py` walks `__table__.columns`.

### Shapes

A shape names which columns a section uses. Declared as constants at the top of `app/utils/note_sections.py`; the eight stored ones are collected in `STORED_SHAPES`.

| Shape | Columns used | Rule of thumb |
| --- | --- | --- |
| `text` | `content` | A plain bullet. |
| `text_links` | `content`, `links`, optional `locator` | A body *and* its sources. |
| `text_or_link` | `content` **xor** `links[0]` | Either what someone said or where they said it, never both. |
| `episode_text` | `locator`, `content`, `kind` where declared | Anchored to an episode/chapter. |
| `name_links` | `title`, `links` | A named resource. |
| `name_entries` | `title`, `entries` | A named list whose items are each a line of text **or** a labelled link, in one ordered array. `name_links` can only hold URLs and `text_links` has no title, so neither could say "here is my Malenia plan: two notes and a video". |
| `episode_name_links` | `locator`, `title`, `content`, `links`, `status` | The widest shape — used only by `insert_songs`. |
| `music_track` | `title`, `kind`, `status`, `links`, `content` | One theme song; the only shape with two dropdowns. |
| `external` | *(none — its own table)* | `quotes` → `quote` table, `memes` → `meme` table. Never a `note` row; `validate_note_payload` rejects writes to it. |

### Groups

Display-only. A grouped section is still an ordinary registry entry; `group` only decides which card it renders inside. Defined in `NOTE_GROUPS` (`app/utils/note_sections.py`).

| Key | Label | Icon |
| --- | --- | --- |
| `reviews` | 評論 Reviews and Comments | `fa-comments` |
| `analysis_group` | 解析 Analysis and Cinematography | `fa-clapperboard` (keyed `analysis_group` because a section already owns `analysis`) |
| `guides` | 攻略 Guides | `fa-map` — game-only, 15 sections |
| `story` | 劇情 Story | `fa-book-open` — game-only, 7 sections |
| `todo` | 待辦 Todo | `fa-list-check` — game-only, 4 personal-scope buckets |
| `music` | 音樂 Music | `fa-music` |
| `quotes_memes` | 名言/梗 Quotes and Memes | `fa-quote-right` |

**`guides` names a group and no section**, so unlike `analysis_group` it needs no suffix. **`todo` is not called `progress`**: the game detail page already renders a `<Slip title="Progress">` (playtime and achievements) beside the notes, and two cards with one name is unreadable.

**Card order is registry position.** `splitBlocks` walks `NOTE_SECTIONS` and emits one card per group in first-appearance order, so where a group's *first* section sits is the only thing deciding where its card lands. Today that reads: Notes → 評論 → 解析 → 攻略 → 劇情 → 待辦 → 音樂 → 名言/梗 → Resources → Questions.

### Section registry

`NOTE_SECTIONS` in `app/utils/note_sections.py`, in display order. "All" = all twelve owners (`ALL_OWNERS`); "Entries" = the nine media types (`ENTRY_OWNERS`). Both derive from `media_resolver`, so a new media type joins them automatically — `game` reached `remark`, `resources`, `questions`, `memes` and the rest of the shared sections on the day it was registered, with no registry edit.

| Key | Label | Shape | Group / standalone | Owners | Kinds (`kind`) | Statuses | Locator placeholder | Locator req. | Singleton | Content req. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `remark` | 備註 Remark | text | flat | All | — | — | — | no | **yes** | no |
| `advantages` | 優點 Advantages | text | reviews | All | — | — | — | no | no | no |
| `disadvantages` | 缺點 Disadvantages | text | reviews | All | — | — | — | no | no | no |
| `double_edged` | 優缺點 | text | reviews | All | — | — | — | no | no | no |
| `public_reviews` | 大眾評價 Public Reviews | text_or_link | reviews | All | — | — | — | no | no | no |
| `personal_reviews` | 我的評價 Personal Reviews | text | reviews | All | — | — | — | no | no | no |
| `episode_comments` | 各集評論 Episode Comments (game: 各章評論 Part Reviews) | text_links | reviews | anime, tv-show, cartoon, game | — | — | "Episode, e.g. ep 1" (game: "Chapter / Part, e.g. Ch 3") | **yes** | no | no |
| `highlights` | 神回/神片段 Highlights | episode_text | flat | anime | 神回, 神片段, 神篇章 | — | "Episode(s), e.g. ep 6" | **yes** | no | no |
| `highlight_episodes` | 神回/神片段 (manga: 神回) | episode_text | flat | tv-show, cartoon, manga | tv-show & cartoon: 神回, 神片段, 神篇章; manga: none | — | "Episode(s), e.g. ep 3" (manga: "Chapter(s), e.g. ch 6") | **yes** | no | no |
| `highlight_passages` | 神片段 | text | flat | novel | — | — | — | no | no | no |
| `highlight_moments` | 神場景 Highlights | episode_text | flat | game | — | — | "Chapter / Boss, e.g. Ch 3" | **yes** | no | no |
| `analysis` | 解析 Analysis | text_links | analysis_group | All | — | — | — | no | no | no |
| `cinematography` | 分鏡/演出/巧思 | text_links | analysis_group | anime, anime-movie, tv-show, cartoon, manga, series | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `craft` | 巧思 | text_links | analysis_group | novel | — | — | — | no | no | no |
| `foreshadowing` | Foreshadowing | text_links | analysis_group | anime, anime-movie, tv-show, cartoon, manga, novel, series, franchise | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `symmetry` | 對稱 Symmetry | text_links | analysis_group | same as foreshadowing | — | — | "Episode(s), e.g. ep 3" | no | no | no |
| `beginner` | 新手 Beginner | text_links | guides | game | — | — | — | no | no | no |
| `controls` | 操作 Controls | text_links | guides | game | — | — | — | no | no | no |
| `trivia` | 小知識 Trivia | text_links | guides | game | — | — | — | no | no | no |
| `side_quests` | 支線任務列表 Side Quests | name_entries | guides | game | — | — | — | no | no | no |
| `builds_and_styles` | 配裝&流派 Builds & Styles | name_entries | guides | game | — | — | — | no | no | no |
| `stats_and_points` | 屬性&配點 Stats & Points | text_links | guides | game | — | — | — | no | no | no |
| `skills` | 技能 Skills | name_entries | guides | game | — | — | — | no | no | no |
| `collectibles` | 收集物 Collectibles | name_entries | guides | game | — | — | — | no | no | no |
| `items` | 道具 Items | name_entries | guides | game | — | — | — | no | no | no |
| `weapons_and_gear` | 武器&裝備 Weapons & Gear | name_entries | guides | game | — | — | — | no | no | no |
| `characters_guide` | 角色 Characters | name_entries | guides | game | — | — | — | no | no | no |
| `enemies` | 敵人 Enemies | name_entries | guides | game | — | — | — | no | no | no |
| `endings` | 結局 Endings | name_entries | guides | game | — | — | — | no | no | no |
| `mods_and_tools` | 模組&工具 Mods & Tools | name_entries | guides | game | Mod, Tool | — | — | no | no | no |
| `guide_resources` | 攻略資源 Guide Resources | name_entries | guides | game | — | — | — | no | no | no |
| `main_plot` | 主線劇情 Main Plot | episode_text | story | game | — | — | "Chapter / Part, e.g. Ch 3" | no | no | no |
| `side_plot` | 支線劇情 Side Stories | episode_text | story | game | — | — | "Chapter / Part, e.g. Ch 3" | no | no | no |
| `character_arcs` | 角色劇情 Character Arcs | text_links | story | game | — | — | — | no | no | no |
| `lore` | 世界觀&設定 Lore | text_links | story | game | — | — | — | no | no | no |
| `timeline` | 時間線 Timeline | text | story | game | — | — | — | no | no | no |
| `mysteries` | 未解之謎 Mysteries | text_links | story | game | — | — | — | no | no | no |
| `story_other` | 其他 Other | text_links | story | game | — | — | — | no | no | no |
| `todo_now` | 現在進行 Doing now | text_links | todo | game | — | — | — | no | no | no |
| `todo_next` | 接下來 To do next | text_links | todo | game | — | — | — | no | no | no |
| `todo_later` | 未來 To do in the future | text_links | todo | game | — | — | — | no | no | no |
| `todo_maybe` | 可能 Might do | text_links | todo | game | — | — | — | no | no | no |
| `op` | OP | music_track | music | anime | normal, different version, all inclusive version (default `normal`) | Need, Pending, Done | — | no | no | no |
| `ed` | ED | music_track | music | anime | same as `op` | Need, Pending, Done | — | no | no | no |
| `insert_songs` | 插入曲 Insert Song | episode_name_links | music | anime | — | Need, Pending, Done | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `ost` | OST | music_track | music | anime | same as `op` | Need, Pending, Done | — | no | no | no |
| `op_ed_changes` | OP/ED 變動 | episode_text | music | anime, tv-show, cartoon | 變化OP, 變化ED, 無OP, 無ED, 特殊OP, 特殊ED | — | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `extended_episodes` | 加長 | episode_text | flat | anime, tv-show, cartoon | — | — | "Episode(s), e.g. ep 3" | **yes** | no | no |
| `adaptation` | 改編 Adaptation | text_links | flat | anime, anime-movie, tv-show, cartoon, novel, series, franchise | — | — | — | no | no | anime, anime-movie, novel |
| `resources` | Resources | name_links | **standalone** | All | — | — | — | no | no | no |
| `questions` | Questions | episode_text | **standalone** | All | — | — | "Source, e.g. ep 3" | no | no | **All** |
| `quotes` | 名言 Quotes | external | quotes_memes | Entries only | — | — | — | — | — | — |
| `memes` | 梗/迷因 Memes | external | quotes_memes | All | — | — | — | — | — | — |

Per-owner overrides (`labels`, `kinds_by_owner`, `locator_placeholders`, `desc_required`) are resolved for one owner by `section_out()` in `app/schemas/note.py` before they reach the frontend, so the page only ever sees a flat `NoteSectionOut`.

Registry helpers (`app/utils/note_sections.py`): `section_by_key`, `sections_for(owner_type)`, `label_for`, `kinds_for`, `locator_for`, `group_by_key`, `sections_by_scope`, plus the two derived key sets `PERSONAL_SECTIONS` and `CATALOG_SECTIONS`.

### Scope

Every section declares a **`scope`**, and the field has **no default** — a section that forgets it fails a test rather than inheriting one, because the wrong inheritance publishes one person's private notes or buries a shared one. Two values plus a null:

| Scope | Sections | Meaning |
| --- | --- | --- |
| `catalog` | 40 | One shared set of rows, read by everyone unfiltered |
| `personal` | 11 — `remark`, `advantages`, `disadvantages`, `double_edged`, `episode_comments`, `personal_reviews`, `questions`, and the four 待辦 buckets `todo_now`, `todo_next`, `todo_later`, `todo_maybe` | One set per user; a viewer sees their own rows and nobody else's |
| `None` | `quotes`, `memes` | The two `external` sections, backed by their own tables. Quotes and memes are **universal** — shared, unfiltered, no per-user copies — so scope does not apply |

The distinction lives in the registry rather than in the schema, so reclassifying a section is a registry edit plus a data reassignment, never an `ALTER TABLE`. `/api/notes/sections` serves `scope` on every entry (`NoteSectionOut.scope`); the frontend does not act on it yet.

Who may write, and whose rows a read returns, follow from it — the router reads `section.scope` rather than carrying its own list:

| Scope | Write (`_authorize_write` / `_authorize_edit`) | Read |
| --- | --- | --- |
| `catalog` | admin only | everyone, unfiltered |
| `personal` | any signed-in account holding `self.personal_notes`, own rows only (a superuser may also edit another's) | `WHERE author_id = viewer`; a logged-out visitor has no id and sees none |

A profile owner's personal rows can be read through `GET /api/notes?author=<username>`, but only when their `list_is_public` **and** the viewer holds `field_group.personal_notes`; an unknown user, a private list and a viewer without the group all answer the same **404**, so the reply cannot be read as "this account exists". The full rules live in [../authorization.md](../authorization.md#note-scope).

**`remark` is per author, like any other personal-scope section.** It is read by `app.services.domain.remark_field.attach_remark`, filtered on `note.author_id`, and `ix_note_one_remark_per_owner` carries `author_id` — so two accounts each hold one on the same entry and each reads back their own. The index and the read path are one mechanism: a class-level `column_property` cannot know who is asking, and pairing one with a per-author index would turn a loud database refusal into an accepted-then-invisible write.

## Rules

Design rules baked into the registry:

| Rule | Where it shows |
| --- | --- |
| **Episode-anchored sections stop at entry level.** Anything whose point is a locator (`episode_comments`, `highlights`, `highlight_episodes`, `op_ed_changes`, `extended_episodes`, `insert_songs`) is limited to episodic entries — never series/franchise/collection. `cinematography`, `foreshadowing`, `symmetry` and `adaptation` reach series (and franchise for the last three) because their locator is optional. | `owners` on each entry in `NOTE_SECTIONS`. |
| **`quotes` is entry-only.** A quote is said in a specific work (`ENTRY_OWNERS`; see the docstring in `app/models/quote.py`). | `NOTE_SECTIONS["quotes"]`. |
| **`memes` is allowed on all owners**, because a running gag often spans a franchise; `meme` carries the same four owner columns `note` does, so every one of the twelve owners is reachable. | `NOTE_SECTIONS["memes"]`. |
| **Similar sections are deliberately distinct** (`highlights` vs `highlight_episodes` vs `highlight_passages` vs `highlight_moments`; `cinematography` vs `craft`) so they can drift on purpose. | Module docstring of `app/utils/note_sections.py`. |
| **A game's guide vocabulary is the 攻略 group, not one section.** Fifteen sections rather than one with a `kind`, because each is a list kept separately: which build to run is not the same question as where the collectibles are. `guide_resources` holds pointers to somebody else's walkthrough; the site-wide `resources` section (name_links, all owners, standalone) is a separate section games also inherit, and a second card labelled "Resources" would be unreadable — hence distinct keys *and* distinct labels. | The 攻略 run in `NOTE_SECTIONS` and its banner comment. |
| **The 待辦 buckets are four sections, not one section with a `kind`.** `sort_index` orders rows within one `(owner, section)` pair and `/api/notes/reorder` renumbers the whole section, so a kind-tagged single section could not order items *within* a bucket. Moving an item between buckets is a PATCH of `section`, which the API already accepts. | The 待辦 run in `NOTE_SECTIONS` and its banner comment. |
| **劇情 records what happens; 解析 records what it means.** The two are separate cards, and `story_other` exists so a stray story observation lands there rather than drifting into Analysis. The 劇情 plot sections take an *optional* locator, unlike `episode_comments` and `highlight_moments`, which require one — a beat remembered without its chapter is still a beat. | `main_plot` / `side_plot`, and `NOTE_GROUPS`. |
| **`episode_comments` was widened, not duplicated.** A game is cut into chapters or parts rather than episodes, but a comment on one segment of the work is the same section, so game gets a `labels` override (各章評論 Part Reviews) and a `locator_placeholders` override rather than a section of its own. | `NOTE_SECTIONS["episode_comments"]`. |
| **Music sections stay separate** (`op`, `ed`, `insert_songs`, `ost`, `op_ed_changes`) rather than one section with a dropdown, so "which OPs do I still need?" stays a section, not a filter. | Comment above `op` in the registry. |
| `group` and `standalone` are mutually exclusive; a test forbids setting both. | `NoteSection` docstring. |
| `locator_required` is section-wide; `desc_required` is per owner. | `NoteSection` fields. |

### Validation (`validate_note_payload`, `app/schemas/note.py`)

Runs on every POST and on the *merged* row of every PATCH. Raises `ValueError`, which the router turns into **422**. In order:

| # | Check | Message |
| --- | --- | --- |
| 1 | `owner_type` in `OWNER_TABLES` | Unknown owner_type '…'. |
| 2 | `section` is a registry key | Unknown note section '…'. |
| 3 | Section's shape is a stored shape (not `external`) | Section '…' has its own table and is not stored as a note. |
| 4 | Owner type is in the section's `owners` | Section '…' does not apply to owner type '…'. |
| 5 | If `kind` given: section has kinds for this owner, and the value is one of them | Section '…' takes no kind for owner type '…'. / '…' is not a valid kind for section '…'. |
| 6 | If `status` given: section has statuses, and the value is one of them | Section '…' takes no status. / '…' is not a valid status for section '…'. |
| 7 | `desc_required` for this owner ⇒ stripped `content` non-empty | Section '…' requires content. |
| 8 | `locator_required` ⇒ stripped `locator` non-empty | Section '…' requires a locator. |
| 9 | Emptiness, by shape: `name_links` needs content or title or links; `name_entries` needs a title or at least one entry ("Section '…' needs a name or an entry." — a named bookmark with neither a name nor a single entry is nothing); `text_or_link` needs content or a non-blank link, forbids both ("takes text or a link, not both"), and allows at most one link ("takes one link per note"); `episode_text` needs content or locator; `episode_name_links` needs any of content/locator/title/status/links; `music_track` allows at most one link and needs any of content/title/status/links (kind alone never counts, since it defaults to `normal`); every other shape needs content or links | Section '…' note is empty. |

Singleton uniqueness is **not** here — it needs a query, so `_reject_second_singleton` in `app/routers/note.py` does it (422 "This owner already has a 'remark' note.").

### Viewer visibility

`GET /api/notes` applies the RBAC layer:

- If the owner is a media entry and `entry_visible()` (`app/services/rbac/enforcement.py`) says the viewer may not see it, the endpoint answers **404 "Owner not found."** rather than an empty list. Grouping tiers carry no labels, so they skip this check.
- **Personal sections filter by author.** Rows in a `personal`-scope section are returned only when `author_id` matches the viewer (or the profile owner named by `?author=`); a logged-out visitor, having no id, gets none of them. Catalogue sections fall through untouched. See [Scope](#scope).
- `gated_note_sections(viewer)` (`app/services/rbac/field_gate.py`) returns section keys the viewer is not entitled to; those rows are simply **absent** from the response (an empty card would advertise that there is something to not-see). The only field group naming a note section is `personal_notes` → `personal_reviews` (`app/services/rbac/field_groups.py`), and it withholds **only rows the viewer did not write** — hiding someone's own notes from them is not a permission, it is a bug.
- `GET /api/notes/sections` is *not* filtered: withheld sections still appear in the registry, they just never have rows.

## API

Router: `app/routers/note.py`, prefix `/api/notes`. Thin fetch wrappers on the frontend: `frontend/src/pages/notes/api.js`.

| Method | Path | Auth | Params / body | Response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notes/sections` | public | `?owner_type=` | `List[NoteSectionOut]` — registry resolved for that owner, display order | 400 unknown owner_type |
| GET | `/api/notes` | public (viewer-aware) | `?owner_type=&owner_id=`, optional `?author=<username>` | `List[NoteResponse]`, sorted by registry position then `sort_index` (`_ordered`) | 400 unknown owner_type; 404 owner not visible |
| POST | `/api/notes` | by scope | body `NoteCreate` (`owner_type`, `owner_id`, `section`, `locator`, `kind`, `status`, `title`, `content`, `links`, `sort_index`) | 201 `NoteResponse`; `sort_index` defaults to last-in-section + 1 | 422 validation / second singleton |
| PATCH | `/api/notes/reorder` | by scope | body `NoteReorder` `{owner_type, owner_id, section, ordered_ids}` | `{"status":"success","reordered":n}`; rewrites `sort_index` as 0,1,2… | 400 unknown owner_type / unknown section / `ordered_ids` not exactly the section's rows |
| PATCH | `/api/notes/{note_id}` | by scope | body `NoteUpdate` (partial; `exclude_unset`) | `NoteResponse` | 404; 422 — the merged row (current values + patch, built from `NoteUpdate.model_fields`) is validated **before** mutation so autoflush never writes a bad row. A PATCH may move a note to another owner. |
| DELETE | `/api/notes/{note_id}` | by scope | — | 204 | 404. Audited via `log_deleted_record(db, note, "Note")` (`app/utils/data_control_utils.py`). |

"By scope" means the section decides: a **catalogue** section needs `manage.catalog`, a **personal** one needs an account holding `self.personal_notes` and reaches only that account's own rows. Somebody else's personal note answers **404**, worded exactly as a missing one — there is no 403 anywhere in this router, because a 403 confirms the row exists as surely as a 200 does. A reorder over a personal section renumbers the caller's rows alone. See [Scope](#scope). `?author=` answers **404** for an unknown user, a private list, or a viewer without `field_group.personal_notes` — the same reply for all three.

`/reorder` is declared before `/{note_id}` on purpose (FastAPI matches in order). No frontend calls it yet; it is intentional surface kept for a future reorder UI and covered by tests — do not delete as unused.

## UI

### NotesTemplate

`frontend/src/pages/notes/NotesTemplate.jsx` is the notes page for every owner type. It takes `ownerType`, `ownerId`, `isAdmin`, `hideSections`. Eleven thin wrappers under `frontend/src/pages/detail/*Notes.jsx` (e.g. `AnimeNotes.jsx`, `ComicNotes.jsx`, `FranchiseNotes.jsx`) fix the owner type and forward the rest.

| Behaviour | How |
| --- | --- |
| Loads registry + rows in parallel (`fetchSections`, `fetchNotes`), then refetches only rows after a mutation; the registry is static for the session. | `useEffect` / `reloadNotes`. |
| Dispatches on `section.shape` via the `SHAPES` map — all 8 stored shapes have a component, `name_entries` → `NameEntriesSection` among them. `external` shapes dispatch on **section key** via `EXTERNAL_SHAPES` (`quotes` → `QuoteSection`, `memes` → `MemeSection`) — the first of two scoped exceptions to "the frontend never names sections". An external key with no component renders null. | `renderSection`. |
| `splitBlocks()` splits the registry into `flat` (ungrouped, non-standalone), `groups` (one card per group key, registry order), `standalone`. | `splitBlocks`. |
| The **Notes card** holds the flat sections and **renders only when ≥1 flat section is visible** (`flat.length > 0`). A comic with `remark` hidden has no flat section, so no empty headed card. | JSX near the bottom. |
| Each group renders as its own `GroupCard` *beside* Notes (Music is a peer of Notes, not inside it). Standalone sections (`resources`, `questions`) render lifted out with no wrapper — every shape component already draws its own `SectionCard`. | Same. |
| **Collapse-when-empty**: `GroupCard` starts collapsed when `count === 0` (`useCollapsed` in `sections/ui.jsx`); the user can toggle it. Notes card wears the same chrome but `showCount={false}`. External sections report their row count via `onCount`; while any is still `null` the card counts as unknown and stays open. | `blockCount`, `reporterFor`. |
| `hideSections` — the second scoped exception — lets an embedding page suppress sections it renders itself. Detail pages pass `hideSections={entry.remark ? ["remark"] : []}` (e.g. `frontend/src/pages/detail/Comic.jsx`, `Cartoon.jsx`, `AnimeMovie.jsx`) because they keep a dedicated remark editor writing the *same* singleton row; two editors on one row means the form's stale state would revert or delete what was typed in the notes box. | `visibleSections` memo. |
| Errors from any card show in one banner above all cards (a group card is a sibling of Notes, so an error must not report inside the wrong one). | `error` state. |

### Section components (`frontend/src/pages/notes/sections/`)

| Component | Shape | Fields it shows |
| --- | --- | --- |
| `TextSection.jsx` | text | content |
| `TextLinksSection.jsx` | text_links | locator (only if the section has a `locator_placeholder`), content, links; enforces `desc_required` / `locator_required` client-side |
| `TextOrLinkSection.jsx` (+ `textOrLink.js`) | text_or_link | content xor one link |
| `EpisodeTextSection.jsx` | episode_text | locator, kind dropdown when `kinds` non-empty, content |
| `NameLinksSection.jsx` | name_links | title, links |
| *(none yet)* | name_entries | title, `entries` — no component exists; the backend accepts and stores the rows, the notes page does not draw them |
| `EpisodeNameLinksSection.jsx` | episode_name_links | locator, title, content, links, status |
| `MusicTrackSection.jsx` | music_track | title, kind (starts on `default_kind`), status, link, content |
| `QuoteSection.jsx` / `MemeSection.jsx` | external | adapt the long-lived quote/meme components; report counts |
| `ui.jsx` | — | `GroupCard`, `SectionCard`, `ItemActions`, `useCollapsed`, shared classes |

### Remark as a note

| Piece | Where |
| --- | --- |
| The `remark` column is **dropped** from all eleven owner tables (`alembic/versions/r1e2m3a4r5k6_remark_column_to_note.py`). | migration |
| Read side: each owner model gets a read-only `column_property` — a correlated scalar subquery selecting `note.content` where `section = 'remark'` for that owner — attached at the bottom of `app/models/__init__.py` (`_REMARK_OWNERS` loop). It reads like a plain column in response schemas, detail pages, `Delete.jsx` previews and `find_all_remarks`; assigning to it raises. | `app/models/__init__.py` |
| `remark` stays on every owner's Pydantic Base schema, so the Add form, Modify form and hub `RemarkModal` still send a plain string to the owner's own endpoint. | `app/schemas/*` |
| Write side: `pop_remark(data)` splits `remark` out of the payload and returns `(rest, value, was_present)`; `upsert_remark(db, owner_type, owner_id, text)` creates/updates the singleton row, or **deletes it when the text is empty or whitespace**. Absent ≠ None: a PATCH that never mentions `remark` leaves the row alone; a PUT/PATCH that sends null clears it. Called from the create/update/patch handlers in `app/routers/_factory.py` and from `collection.py`, `franchise.py`, `series.py`. | `app/services/domain/remark_field.py` |
| Because the form and the Notes page write the same row, **last write wins** between them; `hideSections` on the detail pages is the mitigation. | see UI |

## Sheets

The Google Sheets backup has a **"Note" tab** (`SheetTab("Note", models.Note, f.parse_note_from_sheet)` in `app/services/pipelines/tabs.py`).

| Aspect | Detail |
| --- | --- |
| Columns | `note` column declaration order: `system_id, owner_type, owner_id, section, locator, kind, status, title, content, links, entries, sort_index, created_at, updated_at` (`format_model_for_sheet`, `app/utils/formatter.py`). `links` and `entries` are serialised as JSON text. |
| Restore order | Near the end of `SHEET_TABS`: after every owner tab, Quote and Meme, before Seasonal — owners must exist first. |
| Parser | `parse_note_from_sheet` (`app/utils/formatter.py`): `owner_id` becomes None rather than failing if unparseable (no name-resolution step exists for it); the pre-rename `episode` header is still accepted as `locator` so old backups Pull. **`entries` is parsed exactly like `links` beside it** — without that key Backup would still write the column (the formatter walks real columns) and Pull would drop it, losing every item of every `name_entries` row on a round trip. |
| Id-less row matching | Pull (`app/services/pipelines/pull.py`, "Note" branch) matches on `owner_type + owner_id + section + content` — not guarded on content, so a blank-content row matches `IS NULL` instead of duplicating every pull. |
| Remark rows | A sheet `remark` row whose `system_id` is unknown locally is retargeted at the owner's existing remark row and updated in place, keeping the local id — otherwise the partial unique index would fail the whole tab at commit. |
| Round-trip | Because owner tables no longer have a `remark` column (and `format_model_for_sheet` walks real columns, so the column_property is not exported), **remark round-trips only via the Note tab**. The `remark` still parsed on Watch Order tabs is those tables' own column, unrelated. |

## Related

- History: the original spec's `unread` section is gone. `op`, `ed`, `insert_songs`, `ost` (migration `m1u2s3i4c5t6_music_notes.py`, seeded from the old `anime.op/ed/insert_ost` columns) and the four groups (`reviews`, `analysis_group`, `music`, `quotes_memes`) were added; a `music_track`-shaped `insert` section was folded into `insert_songs` by `i1n2s3e4r5t6_drop_insert_music_section.py`. The table itself came from `note_add_table.py`; `episode` → `locator` by `l1o2c3a4t5o6`.
- `../data-model.md` (Note section) — column-level remarks, partly overlapping this page.
- `docs/api.md`, `../frontend/pages.md`, `../frontend/components.md` — older, partly stale; this page wins where they differ.
- RBAC: `app/services/rbac/field_groups.py`, `field_gate.py`, `enforcement.py`.
- Quotes and memes: `app/models/quote.py`, `app/models/meme.py`, their routers, and `app/utils/media_resolver.py` for owner resolution.
- Tests: `frontend/src/pages/notes/NotesTemplate.test.jsx`, `sections/*.test.jsx`, and the backend note tests under `tests/`.
