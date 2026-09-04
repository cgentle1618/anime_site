"""novel_unit table, ch_fin_in_arc, and the JSONB name lists migrated to rows

Revision ID: nv1u2n3i4t5s
Revises: p7n8a9m10e11
Create Date: 2026-09-04

Downgrade is lossy and deliberately so: it rebuilds novel_name_each_cn and
novel_name_each_en from the volume rows, but per-unit remarks, arc rows and
their ch_count have nowhere to go in the old shape and are dropped. Run a
Sheets Backup before upgrading.
"""

import json
import uuid

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision = "nv1u2n3i4t5s"
down_revision = "p7n8a9m10e11"
branch_labels = None
depends_on = None


def _clean(val):
    """Empty and whitespace-only cells become NULL, not ''."""
    if val is None:
        return None
    text = str(val).strip()
    return text or None


def migrate_each_lists(each_cn, each_en):
    """
    Zip the two parallel per-volume lists into one row per position.

    They were aligned by list index and nothing else, so a length mismatch is
    expected in the wild: the longer list governs and the absent language is
    NULL. unit_key takes CN's key, falling back to EN's. A position where key
    and both names are all empty carried no information and is skipped, but
    the positions of the rows that remain still follow the original index, so
    surviving volumes keep their original numbering.
    """
    cn = each_cn or []
    en = each_en or []
    rows = []
    for i in range(max(len(cn), len(en))):
        cn_entry = cn[i] if i < len(cn) else {}
        en_entry = en[i] if i < len(en) else {}
        if not isinstance(cn_entry, dict):
            cn_entry = {}
        if not isinstance(en_entry, dict):
            en_entry = {}

        unit_key = _clean(cn_entry.get("key")) or _clean(en_entry.get("key"))
        name_cn = _clean(cn_entry.get("name"))
        name_en = _clean(en_entry.get("name"))
        if unit_key is None and name_cn is None and name_en is None:
            continue

        rows.append(
            {
                "position": i + 1,
                "unit_key": unit_key,
                "name_cn": name_cn,
                "name_en": name_en,
            }
        )
    return rows


def _as_list(val):
    """The column is JSONB, but a restored sheet can leave a JSON string."""
    if val is None:
        return []
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except (ValueError, TypeError):
            return []
    return val if isinstance(val, list) else []


def upgrade():
    op.create_table(
        "novel_unit",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "novel_id",
            UUID(as_uuid=True),
            sa.ForeignKey("novel.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit_kind", sa.String(), nullable=False),
        sa.Column("position", sa.Float(), nullable=False),
        sa.Column("unit_key", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("remark", sa.String(), nullable=True),
        sa.Column("ch_count", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "unit_kind IN ('volume','arc','story','chapter')",
            name="ck_novel_unit_kind",
        ),
        sa.CheckConstraint(
            "unit_kind = 'arc' OR ch_count IS NULL",
            name="ck_novel_unit_ch_count_arc_only",
        ),
    )
    op.create_index("ix_novel_unit_system_id", "novel_unit", ["system_id"])
    op.create_index("ix_novel_unit_novel_id", "novel_unit", ["novel_id"])
    op.create_index(
        "ix_novel_unit_novel_kind_position",
        "novel_unit",
        ["novel_id", "unit_kind", "position"],
    )

    op.add_column(
        "novel",
        sa.Column("ch_fin_in_arc", sa.Float(), nullable=False, server_default="0"),
    )

    conn = op.get_bind()
    existing = conn.execute(
        sa.text(
            "SELECT system_id, novel_name_each_cn, novel_name_each_en FROM novel"
        )
    ).fetchall()

    for novel_id, each_cn, each_en in existing:
        for row in migrate_each_lists(_as_list(each_cn), _as_list(each_en)):
            conn.execute(
                sa.text(
                    "INSERT INTO novel_unit "
                    "(system_id, novel_id, unit_kind, position, unit_key,"
                    " name_cn, name_en, created_at, updated_at) "
                    "VALUES (:sid, :nid, 'volume', :position, :unit_key,"
                    " :name_cn, :name_en, NOW(), NOW())"
                ),
                {"sid": uuid.uuid4(), "nid": novel_id, **row},
            )

    op.drop_column("novel", "novel_name_each_cn")
    op.drop_column("novel", "novel_name_each_en")


def downgrade():
    op.add_column("novel", sa.Column("novel_name_each_cn", JSONB(), nullable=True))
    op.add_column("novel", sa.Column("novel_name_each_en", JSONB(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT novel_id, unit_key, name_cn, name_en FROM novel_unit "
            "WHERE unit_kind = 'volume' ORDER BY novel_id, position"
        )
    ).fetchall()

    grouped = {}
    for novel_id, unit_key, name_cn, name_en in rows:
        cn, en = grouped.setdefault(novel_id, ([], []))
        cn.append({"key": unit_key or "", "name": name_cn or ""})
        en.append({"key": unit_key or "", "name": name_en or ""})

    for novel_id, (cn, en) in grouped.items():
        conn.execute(
            sa.text(
                "UPDATE novel SET novel_name_each_cn = CAST(:cn AS JSONB),"
                " novel_name_each_en = CAST(:en AS JSONB) WHERE system_id = :nid"
            ),
            {
                "cn": json.dumps(cn, ensure_ascii=False),
                "en": json.dumps(en, ensure_ascii=False),
                "nid": novel_id,
            },
        )

    op.drop_column("novel", "ch_fin_in_arc")
    op.drop_index("ix_novel_unit_novel_kind_position", table_name="novel_unit")
    op.drop_index("ix_novel_unit_novel_id", table_name="novel_unit")
    op.drop_index("ix_novel_unit_system_id", table_name="novel_unit")
    op.drop_table("novel_unit")
