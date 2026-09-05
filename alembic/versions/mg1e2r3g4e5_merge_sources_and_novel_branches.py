"""Merge two branches that were developed concurrently.

This revision does nothing on its own: it exists only to rejoin the alembic
history into a single head after two Claude Code sessions worked in parallel
off the same starting point (`ms1o2u3r4c5e`).

- `st1a2g3s4 -> sv1o2c3a4b -> bf1i2l3l4` added the media_source feature: the
  source tag-field vocabulary, seeded source vocabulary, and the migration
  that backfills `media_source`/`media_tag` rows from the old source columns.
- `ol1b2k3s4 -> c1h2a3r4a5c6 -> v1o2l3o4n5l6` added openlibrary support to
  novel, reshaped character data, and cleared the chapter/arc counters on
  volume-only novels.

Revision ID: mg1e2r3g4e5
Revises: bf1i2l3l4, v1o2l3o4n5l6
Create Date: 2026-09-05
"""

revision = "mg1e2r3g4e5"
down_revision = ("bf1i2l3l4", "v1o2l3o4n5l6")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
