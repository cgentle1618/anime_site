"""convert novel_name_each fields from object to array

Revision ID: a3b4c5d6e7f8
Revises: 5236445b7c91
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = '5236445b7c91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE novel
        SET novel_name_each_cn = (
            SELECT jsonb_agg(jsonb_build_object('key', kv.key, 'name', kv.value))
            FROM jsonb_each_text(novel_name_each_cn) AS kv
        )
        WHERE novel_name_each_cn IS NOT NULL
          AND jsonb_typeof(novel_name_each_cn) = 'object'
    """)
    op.execute("""
        UPDATE novel
        SET novel_name_each_en = (
            SELECT jsonb_agg(jsonb_build_object('key', kv.key, 'name', kv.value))
            FROM jsonb_each_text(novel_name_each_en) AS kv
        )
        WHERE novel_name_each_en IS NOT NULL
          AND jsonb_typeof(novel_name_each_en) = 'object'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE novel
        SET novel_name_each_cn = (
            SELECT jsonb_object_agg(item->>'key', item->>'name')
            FROM jsonb_array_elements(novel_name_each_cn) AS item
        )
        WHERE novel_name_each_cn IS NOT NULL
          AND jsonb_typeof(novel_name_each_cn) = 'array'
    """)
    op.execute("""
        UPDATE novel
        SET novel_name_each_en = (
            SELECT jsonb_object_agg(item->>'key', item->>'name')
            FROM jsonb_array_elements(novel_name_each_en) AS item
        )
        WHERE novel_name_each_en IS NOT NULL
          AND jsonb_typeof(novel_name_each_en) = 'array'
    """)
