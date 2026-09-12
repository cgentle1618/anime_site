"""the installation owner is a flag, and the admin holds no user data

Revision ID: o1a1ownerflag
Revises: n1a2remarkauthor
Create Date: 2026-09-12 00:00:00.000000

Two halves of one decision (spec:
docs/superpowers/specs/2026-09-12-admin-holds-no-user-data.md).

1. `users.is_installation_owner` replaces the literal `'admin'` that
   `installation_owner_id()` used to query for. Whose rows a Sheets restore
   and the Calculate pipeline file under becomes data, so moving the
   collection to another account is a row edit rather than a commit, and so
   the answer travels between machines on the Sheets Users tab.

2. Every personal row held by a superuser account moves to that owner. An
   administrative account administers; it does not carry a library.

NEITHER HALF IS USEFUL ALONE. Moving the rows while the function still
answers `'admin'` means the next Pull All refills the admin account and the
next Calculate derives novel progress onto its empty list - the migration
would quietly come undone the first time the owner syncs between machines.

NO USERNAME IS HARDCODED. The owner is chosen as the alphabetically-first
account whose role is not superuser, which on the installation this was
written for selects `cg1618` and leaves `admin` holding nothing. A database
with no such account (a fresh install, where only the seeded admin exists)
gets no flag and nothing moves: `installation_owner_id()`'s fallback still
names somebody, so a restore always has an owner.

AUTHORSHIP MOVES TOO, AND THAT DOES NOT GENERALISE. `quote.author_id`,
`meme.author_id` and `note.author_id` record who WROTE a row, not who owns it
(models/note.py:87-89). Reassigning them edits a record of authorship, and is
only defensible because this installation's two accounts are the same person.
The owner asked for it explicitly so that the rule is verifiable by counting
rows. Anyone reusing this migration elsewhere should drop the three
author_id statements.

CONFLICTS ARE LEFT BEHIND, NOT RESOLVED. Six of these tables carry a unique
key over user_id (or author_id), so a row whose twin already exists on the
target cannot move. Those rows are skipped and stay where they are rather
than being deleted: discarding one of two versions is not a migration's
decision to make. On the database this was written for the target account
owns nothing at all, so nothing is skipped. If a future run does skip rows,
they are visible as the admin account still holding some - count them.

DOWNGRADE DOES NOT PUT THE ROWS BACK. It drops the index and the column,
which is all it can do: nothing records which rows moved, and the accounts
are indistinguishable afterwards. The data half is one-way by nature.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "o1a1ownerflag"
down_revision: Union[str, None] = "n1a2remarkauthor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The owned tables, with the unique key that decides whether a row can move.
# `nulls_not_distinct` marks the two whose key includes columns that are NULL
# on most rows: the twin test has to use IS NOT DISTINCT FROM there, because
# `NULL = NULL` is NULL and every row would look conflict-free.
_OWNED: tuple[tuple[str, str, tuple[str, ...], bool], ...] = (
    ("user_media_list", "user_id", ("media_id",), False),
    ("seasonal", "user_id", ("seasonal",), False),
    ("user_novel_unit_rating", "user_id", ("unit_id",), False),
    ("game_copy", "user_id", ("game_id", "storefront", "copy_format"), False),
    (
        "plan_next",
        "user_id",
        ("kind", "media_type", "media_id", "franchise_id", "series_id"),
        True,
    ),
)


def _move(
    conn,
    owner,
    table: str,
    column: str,
    rest: Sequence[str],
    nnd: bool,
    where: str = "",
) -> None:
    """Reassign `table`.`column` from any superuser account to the owner."""
    op_ = "IS NOT DISTINCT FROM" if nnd else "="
    twin = " AND ".join(f"t.{c} {op_} s.{c}" for c in rest)
    extra = f" AND {where}" if where else ""
    conn.execute(
        sa.text(
            f"""
            UPDATE {table} AS s
               SET {column} = :owner
             WHERE s.{column} IN (
                       SELECT u.id FROM users u
                         JOIN role r ON r.system_id = u.role_id
                        WHERE r.is_superuser
                   )
               {extra}
               AND NOT EXISTS (
                       SELECT 1 FROM {table} t
                        WHERE t.{column} = :owner
                          AND {twin}
                   )
            """
        ),
        {"owner": owner},
    )


def _owner_id(conn):
    return conn.execute(
        sa.text(
            """
            SELECT u.id FROM users u
              JOIN role r ON r.system_id = u.role_id
             WHERE NOT r.is_superuser
             ORDER BY u.username
             LIMIT 1
            """
        )
    ).scalar()


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_installation_owner",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    # Partial and keyed on a constant, the shape
    # ix_one_guest_default_access_mode uses: a SITE singleton, so there is no
    # column to key it on and any number of accounts may hold false.
    op.create_index(
        "ix_one_installation_owner",
        "users",
        [sa.text("(true)")],
        unique=True,
        postgresql_where=sa.text("is_installation_owner"),
    )

    conn = op.get_bind()
    owner = _owner_id(conn)
    if owner is None:
        # Only superuser accounts exist - a fresh install with the seeded
        # admin and nobody else. Nothing to flag and nothing to move; the
        # fallback in installation_owner_id() still names that admin.
        return

    conn.execute(
        sa.text("UPDATE users SET is_installation_owner = true WHERE id = :id"),
        {"id": owner},
    )

    for table, column, rest, nnd in _OWNED:
        _move(conn, owner, table, column, rest, nnd)

    # Authorship. quote and meme carry no unique key over author_id, so every
    # row moves; note's remark singleton does, and is keyed on the four owner
    # columns plus author_id with NULLS NOT DISTINCT.
    for table in ("quote", "meme"):
        conn.execute(
            sa.text(
                f"""
                UPDATE {table} SET author_id = :owner
                 WHERE author_id IN (
                           SELECT u.id FROM users u
                             JOIN role r ON r.system_id = u.role_id
                            WHERE r.is_superuser
                       )
                """
            ),
            {"owner": owner},
        )
    _move(
        conn,
        owner,
        "note",
        "author_id",
        ("media_id", "collection_id", "franchise_id", "series_id"),
        True,
        where="s.section = 'remark'",
    )
    # Every other section is free of the singleton, so it moves unconditionally.
    conn.execute(
        sa.text(
            """
            UPDATE note SET author_id = :owner
             WHERE section <> 'remark'
               AND author_id IN (
                       SELECT u.id FROM users u
                         JOIN role r ON r.system_id = u.role_id
                        WHERE r.is_superuser
                   )
            """
        ),
        {"owner": owner},
    )


def downgrade() -> None:
    op.drop_index("ix_one_installation_owner", table_name="users")
    op.drop_column("users", "is_installation_owner")
