# Documentation index

Last verified: 2026-09-02

These docs describe the CG1618 Media Tracker as it is in the code. Every file
opens with a short "what this is for", then reference sections. Each file
carries a `Last verified` line; if the code and a doc disagree, the code is
right and the doc needs the fix.

## Start here

| Read this | When you want to |
|---|---|
| [setup-local.md](setup-local.md) | get the app running on a new machine (Windows or Linux) |
| [architecture.md](architecture.md) | know how a request flows and where code lives |
| [entry-types.md](entry-types.md) | understand what a collection / franchise / series / entry is and what each media type supports |

## Reference

| File | Scope |
|---|---|
| [data-model.md](data-model.md) | every table, every column, links between tables, computed fields |
| [options.md](options.md) | every vocabulary: code enums (Tier 1), system options (Tier 2), people/studios (Tier 3), fixed constants |
| [api.md](api.md) | every endpoint by router — method, path, auth, params, body, response |
| [business-rules.md](business-rules.md) | derivations and checks (release dates, ep_previous, completion, size groups, duplicates…), including retired/unused rules |
| [data-actions.md](data-actions.md) | Backup, Pull, Fill, Replace, Calculate All — end to end |
| [external-apis.md](external-apis.md) | Tenrai (MAL), TMDB, OMDb, Comic Vine, Google Sheets, Google Cloud Storage |

## Systems

| File | Scope |
|---|---|
| [systems/watch-orders.md](systems/watch-orders.md) | lists, sections, items, release orders, the editor and the guide |
| [systems/relations.md](systems/relations.md) | relation kinds, write/read rules, the relations canvas |
| [systems/plan-next.md](systems/plan-next.md) | watch-next / read-next / rewatch, size buckets, the Plan page |
| [systems/notes.md](systems/notes.md) | the note registry, sections, validation, the Notes card, remark-as-note |
| [systems/quotes-memes.md](systems/quotes-memes.md) | quotes and memes, pickers, pages |
| [systems/credits-and-tags.md](systems/credits-and-tags.md) | people, studios, credits, tags (Tier 3 entities) |

## Access

| File | Scope |
|---|---|
| [authentication.md](authentication.md) | login, JWT cookie, admin seeding, the frontend auth context |
| [authorization.md](authorization.md) | RBAC: roles, permissions, content labels, visibility enforcement, field gating |

## Frontend

| File | Scope |
|---|---|
| [frontend/pages.md](frontend/pages.md) | every public route: what it loads and shows |
| [frontend/admin-pages.md](frontend/admin-pages.md) | every admin route incl. Add / Modify / Delete behaviour |
| [frontend/design-system.md](frontend/design-system.md) | the "archive" visual language: tokens, rules, primitives, page anatomy |
| [frontend/components.md](frontend/components.md) | data layer, theming (light/dark tokens), config catalog, shared components, lib utilities |

## Ops and process

| File | Scope |
|---|---|
| [deployment-gcp.md](deployment-gcp.md) | Docker, CI (tests gate deploy), Cloud Run, Cloud SQL, GCS, Sheets service account — **the GCP deployment is down as of 2026-09-02 and is not expected back soon; see the status banner there** |
| [testing.md](testing.md) | test layout, fixtures, how to run, what CI runs, known gaps |
| [dependencies.md](dependencies.md) | every Python and npm package and why it is there |
| [roadmap.md](roadmap.md) | done / next / deferred — the working plan (see the rule in CLAUDE.md) |

## History

`notes/` holds material that explains the past rather than the present:
[decisions.md](notes/decisions.md) (design rationales), [migrations-history.md](notes/migrations-history.md)
(what each notable Alembic revision did), [notes/comicvine-link-conflicts.md](notes/comicvine-link-conflicts.md)
(a one-off data reconciliation), and worked examples.

## Conventions

- One topic per file; a vocabulary or table lives in exactly one place and is linked from elsewhere.
- Keys and values are quoted verbatim from code (`"Might Watch"`, `anime-movie`, `SPR 2025`).
- When you change behaviour, update the doc in the same change and bump its `Last verified` line.
