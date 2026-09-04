"""Collapse the two role vocabularies into one, scoped by media type.

Revision ID: r0l1c2o3l4p5
Revises: s1t2u3d4i5o6

Not p1e2r3s4o5n6, the id the plan proposed: that one already belongs to
p1e2r3s4o5n6_add_person_and_studio, the revision that CREATED these tables.
Reusing it made alembic report a cycle rather than a duplicate, which is a
confusing way to learn the id was taken.
Create Date: 2026-09-04

media_credit.role and person_role.role become the same five person keys plus
studio. person_role.scope becomes NOT NULL and holds a hyphenated media-type
key; the anime/non_anime vocabulary is gone.

manga_author is the only row that cannot simply be renamed, because it backed
BOTH the 原作 and 作畫 dropdowns. It is split from each person's actual credits
rather than guessed: verified against the live database on 2026-09-04, all 121
holders have at least one manga credit, so the derivation is total and needs no
fallback. 109 hold a plot credit, 110 a draw credit, 98 both.

Expected result on the live data: 555 person_role rows -> 791, and 372
media_credit rows rewritten.

The downgrade is deliberately LOSSY. Collapsing (author, manga) and
(illustrator, manga) back onto one manga_author row discards the split, and
(director, anime) + (director, anime-movie) back onto one `anime` row cannot
tell an expanded row from a hand-added one. It exists to unblock a bad deploy,
not to round-trip data.
"""

import sqlalchemy as sa
from alembic import op

revision = "r0l1c2o3l4p5"
down_revision = "s1t2u3d4i5o6"
branch_labels = None
depends_on = None


# media_credit.role: a straight value rewrite. The six source keys and the two
# target keys are disjoint sets, so the order of application does not matter.
CREDIT_ROLE_RENAMES: dict[str, str] = {
    "manga_author_plot": "author",
    "manga_author_draw": "illustrator",
    "novel_author": "author",
    "novel_illustrator": "illustrator",
    "comic_writer": "author",
    "comic_artist": "illustrator",
}

# Which media type each retired credit key belonged to. Needed only by the
# downgrade, where one target key maps back to three source keys and the media
# type is what disambiguates them.
CREDIT_ROLE_MEDIA_TYPE: dict[str, str] = {
    "manga_author_plot": "manga",
    "manga_author_draw": "manga",
    "novel_author": "novel",
    "novel_illustrator": "novel",
    "comic_writer": "comic",
    "comic_artist": "comic",
}

# person_role: every (old role, old scope) that maps statically onto one or
# more (new role, new scope) pairs. manga_author is absent on purpose - see
# the module docstring and _split_manga_authors below.
ROLE_SCOPE_EXPANSION: dict[tuple, tuple] = {
    # The old `anime` scope served both anime and anime movies, through the
    # now-deleted DIRECTOR_ANIME_MEDIA_TYPES. Expanding to one would silently
    # empty the other dropdown.
    ("director", "anime"): (("director", "anime"), ("director", "anime-movie")),
    ("director", "non_anime"): (("director", "movie"),),
    ("producer", None): (("producer", "anime"),),
    ("composer", None): (("composer", "anime"),),
    ("novel_author", None): (("author", "novel"),),
    ("novel_illustrator", None): (("illustrator", "novel"),),
    ("comic_writer", None): (("author", "comic"),),
    ("comic_artist", None): (("illustrator", "comic"),),
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. media_credit.role.
    for old, new in CREDIT_ROLE_RENAMES.items():
        conn.execute(
            sa.text("UPDATE media_credit SET role = :new WHERE role = :old"),
            {"new": new, "old": old},
        )

    # 2. Build the new person_role set in a temp table before touching the old
    #    one, so a partial failure leaves the existing rows untouched.
    conn.execute(
        sa.text(
            "CREATE TEMP TABLE person_role_new "
            "(person_id uuid NOT NULL, role text NOT NULL, scope text NOT NULL)"
        )
    )

    for (old_role, old_scope), pairs in ROLE_SCOPE_EXPANSION.items():
        for new_role, new_scope in pairs:
            conn.execute(
                sa.text(
                    "INSERT INTO person_role_new (person_id, role, scope) "
                    "SELECT person_id, :new_role, :new_scope FROM person_role "
                    "WHERE role = :old_role "
                    "  AND scope IS NOT DISTINCT FROM :old_scope"
                ),
                {
                    "new_role": new_role,
                    "new_scope": new_scope,
                    "old_role": old_role,
                    "old_scope": old_scope,
                },
            )

    # 3. Split manga_author from the credits each holder actually has. Step 1
    #    has already rewritten media_credit.role, so the keys to match on are
    #    the NEW ones.
    for role in ("author", "illustrator"):
        conn.execute(
            sa.text(
                "INSERT INTO person_role_new (person_id, role, scope) "
                "SELECT DISTINCT pr.person_id, :role, 'manga' "
                "FROM person_role pr "
                "JOIN media_credit mc ON mc.person_id = pr.person_id "
                "WHERE pr.role = 'manga_author' "
                "  AND mc.media_type = 'manga' AND mc.role = :role"
            ),
            {"role": role},
        )

    # 4. Swap, de-duplicating: once director holds two anime scopes, a person
    #    can reach the same (role, scope) by more than one route.
    conn.execute(sa.text("DELETE FROM person_role"))
    conn.execute(
        sa.text(
            "INSERT INTO person_role (person_id, role, scope) "
            "SELECT DISTINCT person_id, role, scope FROM person_role_new"
        )
    )
    conn.execute(sa.text("DROP TABLE person_role_new"))

    # 5. Tighten. NULLS NOT DISTINCT is no longer needed - there is no nullable
    #    column left in the key, which is the whole point of Decision B.
    op.alter_column("person_role", "scope", nullable=False)
    op.drop_constraint("uq_person_role", "person_role", type_="unique")
    op.create_unique_constraint(
        "uq_person_role", "person_role", ["person_id", "role", "scope"]
    )


def downgrade() -> None:
    conn = op.get_bind()

    op.drop_constraint("uq_person_role", "person_role", type_="unique")
    op.alter_column("person_role", "scope", nullable=True)

    # Roles first: the scope rewrites below key off the collapsed role names.
    conn.execute(
        sa.text(
            "UPDATE person_role SET role = 'manga_author', scope = NULL "
            "WHERE role IN ('author', 'illustrator') AND scope = 'manga'"
        )
    )
    for new_role, scope, old_role in (
        ("author", "novel", "novel_author"),
        ("illustrator", "novel", "novel_illustrator"),
        ("author", "comic", "comic_writer"),
        ("illustrator", "comic", "comic_artist"),
    ):
        conn.execute(
            sa.text(
                "UPDATE person_role SET role = :old_role, scope = NULL "
                "WHERE role = :new_role AND scope = :scope"
            ),
            {"old_role": old_role, "new_role": new_role, "scope": scope},
        )
    conn.execute(
        sa.text(
            "UPDATE person_role SET scope = 'anime' "
            "WHERE role = 'director' AND scope IN ('anime', 'anime-movie')"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET scope = 'non_anime' "
            "WHERE role = 'director' AND scope = 'movie'"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE person_role SET scope = NULL "
            "WHERE role IN ('producer', 'composer')"
        )
    )
    # The expansions and the manga split both produce duplicates on the way
    # back; keep the lowest id of each.
    conn.execute(
        sa.text(
            "DELETE FROM person_role a USING person_role b "
            "WHERE a.id > b.id AND a.person_id = b.person_id "
            "AND a.role = b.role AND a.scope IS NOT DISTINCT FROM b.scope"
        )
    )

    op.create_unique_constraint(
        "uq_person_role",
        "person_role",
        ["person_id", "role", "scope"],
        postgresql_nulls_not_distinct=True,
    )

    for old, new in CREDIT_ROLE_RENAMES.items():
        conn.execute(
            sa.text(
                "UPDATE media_credit SET role = :old "
                "WHERE role = :new AND media_type = :media_type"
            ),
            {"old": old, "new": new, "media_type": CREDIT_ROLE_MEDIA_TYPE[old]},
        )
