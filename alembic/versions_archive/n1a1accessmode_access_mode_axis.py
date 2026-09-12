"""the access-mode axis

Revision ID: n1a1accessmode
Revises: m5b2memefks
Create Date: 2026-09-11 00:00:00.000000

Creates the five access-mode tables, seeds the four system modes, grants every
existing account all four (defaulting to `unrestricted`, so nothing changes
visibly on the day this lands), and only THEN removes the field_group.* and
label.* grants from role_permission.

THE ORDER IS LOAD-BEARING. The mode grants have to exist before the old grants
go, or there is a window in which an account holds neither. Alembic runs on
container start before uvicorn serves, so a half-applied state is never
exposed to a request - but the ordering still matters to whoever resumes a
failed migration by hand.

DOWNGRADE LOSES DENIALS. Dropping the tables cannot reconstruct per-account
adjustments, and the field_group.* grants restored on the way down are the
seeded defaults, not whatever an admin had edited them to. Downgrading is a
recovery action, not a round trip.

THE SEED BELOW IS A FROZEN SNAPSHOT. The mode rows and the field-group keys
are written out literally rather than imported from app.services.rbac. A
migration that imports app code emits SELECT over every column the model
declares TODAY, so it breaks the day a later revision adds one - which has
already happened twice in this repo (86982d71c2f1, and the instance that
blocked the home machine on 2026-09-07). The cost is one duplicated list on
brand-new tables with no history to preserve, which is the cheapest possible
moment to establish the pattern.
"""

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "n1a1accessmode"
down_revision: Union[str, Sequence[str], None] = "m5b2memefks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Frozen snapshot of FIELD_GROUP_KEYS as of 2026-09-11. NOT imported: a field
# group added later must not retroactively change what this revision seeded.
FIELD_GROUPS_AT_WRITE_TIME = (
    "sources_other",
    "sources_restricted",
    "personal_notes",
    "system_info",
    "credits",
)

# Field groups `safe` does not carry ON A FRESH DATABASE. On an existing one
# `safe` is DERIVED from what the guest role actually holds - see the seed
# block below. Assuming the two were the same cost a real defect: the design
# said guest withheld `sources_restricted` and nothing else, but this
# installation's guest held only `credits` and `system_info`, because
# `sources_other` and `personal_notes` were added to FIELD_GROUPS after the
# roles were first seeded and ensure_rbac_seed tops up only a role holding
# nothing. Seeding `safe` from this default would have published the
# other-sources list and other people's personal reviews to every logged-out
# visitor the moment this revision ran.
SAFE_WITHHELD = ("sources_restricted",)

# (key, label, description, sort_order, is_guest_default, all_labels, withheld)
MODES = (
    (
        "unrestricted",
        "Unrestricted",
        "Every entry and every field. The widest mode.",
        0,
        False,
        True,
        (),
    ),
    (
        "borderline",
        "Borderline",
        "Adult-labelled entries are visible; every field shows.",
        10,
        False,
        True,
        (),
    ),
    (
        "normal",
        "Normal",
        "No labelled entries; every field of a visible entry shows.",
        20,
        False,
        False,
        (),
    ),
    (
        "safe",
        "Safe",
        "No labelled entries, and the restricted source list is withheld. "
        "What a logged-out visitor sees.",
        30,
        True,
        False,
        SAFE_WITHHELD,
    ),
)

# Roles that held field_group.* before this revision, and get the SEEDED
# defaults back on the way down. `admin` is is_superuser and never held them
# explicitly.
#
# Counted on the live database 2026-09-11: EIGHT grants, not the twelve the
# design predicted, and three different subsets - guest and user held
# {credits, system_info}; super held those plus {personal_notes,
# sources_other}. ensure_rbac_seed tops up only a role holding nothing, so
# groups added after a role was first seeded never reached it. The real
# per-role sets cannot be reconstructed once deleted, so this restores the
# defaults and therefore WIDENS guest and user. Recovery action, not a round
# trip.
ROLES_THAT_HELD_FIELD_GROUPS = ("guest", "user", "super")
GUEST_WITHHELD_ON_DOWNGRADE = ("sources_restricted",)


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. The five tables
    # ------------------------------------------------------------------
    op.create_table(
        "access_mode",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "is_system", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column(
            "is_guest_default",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint("key"),
    )
    op.create_index("ix_access_mode_system_id", "access_mode", ["system_id"])
    op.create_index("ix_access_mode_key", "access_mode", ["key"])
    # At most one mode is the anonymous policy. A partial unique index over a
    # constant is how PostgreSQL says "at most one row with this flag".
    op.create_index(
        "ix_one_guest_default_access_mode",
        "access_mode",
        [sa.text("(true)")],
        unique=True,
        postgresql_where=sa.text("is_guest_default"),
    )

    op.create_table(
        "access_mode_label",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mode_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["mode_id"], ["access_mode.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["label_id"], ["content_label.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("mode_id", "label_id", name="uq_access_mode_label"),
    )
    op.create_index(
        "ix_access_mode_label_system_id", "access_mode_label", ["system_id"]
    )
    op.create_index("ix_access_mode_label_mode_id", "access_mode_label", ["mode_id"])
    op.create_index("ix_access_mode_label_label_id", "access_mode_label", ["label_id"])

    op.create_table(
        "access_mode_field_group",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mode_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_group_key", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["mode_id"], ["access_mode.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "mode_id", "field_group_key", name="uq_access_mode_field_group"
        ),
    )
    op.create_index(
        "ix_access_mode_field_group_system_id",
        "access_mode_field_group",
        ["system_id"],
    )
    op.create_index(
        "ix_access_mode_field_group_mode_id", "access_mode_field_group", ["mode_id"]
    )

    op.create_table(
        "user_access_mode",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mode_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "is_default", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["mode_id"], ["access_mode.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("user_id", "mode_id", name="uq_user_access_mode"),
    )
    op.create_index(
        "ix_user_access_mode_system_id", "user_access_mode", ["system_id"]
    )
    op.create_index("ix_user_access_mode_user_id", "user_access_mode", ["user_id"])
    op.create_index("ix_user_access_mode_mode_id", "user_access_mode", ["mode_id"])
    # An account's landing mode is necessarily one it holds, and there is at
    # most one of them.
    op.create_index(
        "ix_one_default_mode_per_user",
        "user_access_mode",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )

    op.create_table(
        "user_access_mode_denial",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "user_access_mode_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("label_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("field_group_key", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["user_access_mode_id"],
            ["user_access_mode.system_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["label_id"], ["content_label.system_id"], ondelete="CASCADE"
        ),
        # Mirrors the constraint already on note's four owner columns.
        sa.CheckConstraint(
            "(label_id IS NOT NULL)::int + (field_group_key IS NOT NULL)::int = 1",
            name="ck_denial_names_one_thing",
        ),
        sa.UniqueConstraint(
            "user_access_mode_id", "label_id", name="uq_denial_label"
        ),
        sa.UniqueConstraint(
            "user_access_mode_id", "field_group_key", name="uq_denial_field_group"
        ),
    )
    op.create_index(
        "ix_user_access_mode_denial_system_id",
        "user_access_mode_denial",
        ["system_id"],
    )
    op.create_index(
        "ix_user_access_mode_denial_grant",
        "user_access_mode_denial",
        ["user_access_mode_id"],
    )

    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 2. Seed the four modes and their items
    # ------------------------------------------------------------------
    label_ids = [
        row[0] for row in conn.execute(sa.text("SELECT system_id FROM content_label"))
    ]

    # `safe` means "today's guest exactly", so it is READ from the guest role
    # rather than assumed. None/empty means a fresh database where the roles
    # are not seeded yet, and the frozen default above is then correct.
    guest_groups = [
        row[0][len("field_group.") :]
        for row in conn.execute(
            sa.text(
                "SELECT p.permission FROM role_permission p "
                "JOIN role r ON r.system_id = p.role_id "
                "WHERE r.name = 'guest' AND p.permission LIKE 'field_group.%'"
            )
        )
    ]

    mode_ids: dict[str, uuid.UUID] = {}
    for key, label, description, sort_order, is_guest_default, _all, _w in MODES:
        mode_id = uuid.uuid4()
        mode_ids[key] = mode_id
        conn.execute(
            sa.text(
                "INSERT INTO access_mode (system_id, key, label, description, "
                "sort_order, is_system, is_guest_default, created_at, updated_at) "
                "VALUES (:system_id, :key, :label, :description, :sort_order, "
                "true, :is_guest_default, now(), now())"
            ),
            {
                "system_id": mode_id,
                "key": key,
                "label": label,
                "description": description,
                "sort_order": sort_order,
                "is_guest_default": is_guest_default,
            },
        )

    for key, _label, _description, _sort, _guest, all_labels, withheld in MODES:
        if key == "safe" and guest_groups:
            groups_for_mode = tuple(guest_groups)
        else:
            groups_for_mode = tuple(
                g for g in FIELD_GROUPS_AT_WRITE_TIME if g not in withheld
            )
        for group_key in groups_for_mode:
            conn.execute(
                sa.text(
                    "INSERT INTO access_mode_field_group "
                    "(system_id, mode_id, field_group_key, created_at) "
                    "VALUES (:system_id, :mode_id, :key, now())"
                ),
                {
                    "system_id": uuid.uuid4(),
                    "mode_id": mode_ids[key],
                    "key": group_key,
                },
            )
        if all_labels:
            for label_id in label_ids:
                conn.execute(
                    sa.text(
                        "INSERT INTO access_mode_label "
                        "(system_id, mode_id, label_id, created_at) "
                        "VALUES (:system_id, :mode_id, :label_id, now())"
                    ),
                    {
                        "system_id": uuid.uuid4(),
                        "mode_id": mode_ids[key],
                        "label_id": label_id,
                    },
                )

    # ------------------------------------------------------------------
    # 3. Every existing account holds all four, defaulting to `unrestricted`
    # ------------------------------------------------------------------
    # This is what makes the revision behaviour-neutral. For the owner's admin
    # account `unrestricted` is the faithful mapping of today's is_superuser,
    # which sees everything. New accounts get `safe` only, and that is runtime
    # code, not this.
    user_ids = [row[0] for row in conn.execute(sa.text("SELECT id FROM users"))]
    for user_id in user_ids:
        for key, mode_id in mode_ids.items():
            conn.execute(
                sa.text(
                    "INSERT INTO user_access_mode "
                    "(system_id, user_id, mode_id, is_default, created_at) "
                    "VALUES (:system_id, :user_id, :mode_id, :is_default, now())"
                ),
                {
                    "system_id": uuid.uuid4(),
                    "user_id": user_id,
                    "mode_id": mode_id,
                    "is_default": key == "unrestricted",
                },
            )

    # ------------------------------------------------------------------
    # 4. ONLY NOW: the two families leave the role axis
    # ------------------------------------------------------------------
    # Not before step 3. Removing these first would leave a window in which an
    # account held neither the old grant nor the new mode.
    conn.execute(
        sa.text(
            "DELETE FROM role_permission "
            "WHERE permission LIKE 'field_group.%' OR permission LIKE 'label.%'"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()

    # Restore the SEEDED field_group.* grants. Not what an admin may have
    # edited them to - that information is gone, and the docstring says so.
    for role_name in ROLES_THAT_HELD_FIELD_GROUPS:
        role = conn.execute(
            sa.text("SELECT system_id FROM role WHERE name = :name"),
            {"name": role_name},
        ).first()
        if role is None:
            continue
        # Restored from the SEEDED defaults. What each role actually held is
        # gone - on this installation guest, user and super held three
        # DIFFERENT subsets, none of them the default - so a downgrade widens
        # guest and user and narrows nothing. Recovery action, not a round
        # trip; the module docstring says so.
        withheld = (
            GUEST_WITHHELD_ON_DOWNGRADE if role_name == "guest" else ()
        )
        for group_key in FIELD_GROUPS_AT_WRITE_TIME:
            if group_key in withheld:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO role_permission (role_id, permission, created_at) "
                    "VALUES (:role_id, :permission, now()) "
                    "ON CONFLICT (role_id, permission) DO NOTHING"
                ),
                {"role_id": role[0], "permission": f"field_group.{group_key}"},
            )

    # label.* is NOT restored: there were zero such grants when this revision
    # was written, on zero labelled entries, so there is nothing to put back.
    op.drop_table("user_access_mode_denial")
    op.drop_table("user_access_mode")
    op.drop_table("access_mode_field_group")
    op.drop_table("access_mode_label")
    op.drop_table("access_mode")
