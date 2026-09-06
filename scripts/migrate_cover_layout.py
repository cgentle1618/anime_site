# -*- coding: utf-8 -*-
"""
One-off migration: flat cover storage -> owner-typed folders.

Covers used to live at `static/covers/<system_id>.jpg` (and at the same flat
key in the bucket). They now live at `static/covers/<owner_type>/<system_id>.jpg`
- see app/services/integrations/image_manager.py, which owns the layout. This
script moves the files and rewrites the filename columns
(`cover_image_file` / `photo_file` / `logo_file`) to the full key.

Idempotent. A row already pointing at the folder key, with the file already
there, counts as "already done"; running twice is a no-op. That matters
because the second dev machine pulls the migrated column values from the
backup sheet and then only needs the files moved.

What it deliberately does NOT do:
  * Files with no row are left exactly where they are and only listed. They are
    what the admin "check unused cover images" action reports as orphans;
    moving them into an owner folder would hide them from that check.
  * Rows whose file is missing are reported and left alone - inventing a key
    for a file that does not exist would only make the dangling reference
    harder to see.

Usage (dry run is the default; nothing changes without --apply):

    venv/Scripts/python.exe -m scripts.migrate_cover_layout
    venv/Scripts/python.exe -m scripts.migrate_cover_layout --apply
    venv/Scripts/python.exe -m scripts.migrate_cover_layout --gcs --apply

WARNING: the --gcs branch is UNTESTED against a live bucket. The GCP
deployment was down when this was written, so that path has only been reviewed,
never exercised. Run it with --dry-run first and read the plan line by line.
"""

import argparse
import os
import sys
from collections import Counter
from dataclasses import dataclass, field

from app import models
from app.database import SessionLocal
from app.services.integrations import image_manager
from app.services.integrations.image_manager import cover_key
from app.utils.gcp_utils import get_active_bucket_name, get_gcs_client


@dataclass(frozen=True)
class OwnerSource:
    """One table that stores image filenames, and the column that holds them."""

    owner_type: str
    model: type
    column: str


# Every table with a filename column. Two character tables share the
# "character" folder: the canonical portrait and the per-casting override.
OWNER_SOURCES: tuple[OwnerSource, ...] = (
    OwnerSource("anime", models.Anime, "cover_image_file"),
    OwnerSource("anime-movie", models.AnimeMovies, "cover_image_file"),
    OwnerSource("movie", models.Movies, "cover_image_file"),
    OwnerSource("tv-show", models.TVShows, "cover_image_file"),
    OwnerSource("cartoon", models.Cartoon, "cover_image_file"),
    OwnerSource("manga", models.Manga, "cover_image_file"),
    OwnerSource("novel", models.Novel, "cover_image_file"),
    OwnerSource("comic", models.Comic, "cover_image_file"),
    OwnerSource("game", models.Game, "cover_image_file"),
    OwnerSource("staff", models.Person, "photo_file"),
    OwnerSource("character", models.Character, "photo_file"),
    OwnerSource("character", models.CharacterCasting, "photo_file"),
    OwnerSource("publisher", models.Publisher, "logo_file"),
    OwnerSource("studio", models.Studio, "logo_file"),
)


def owner_types() -> list[str]:
    """The owner types this script migrates, deduplicated and sorted."""
    return sorted({s.owner_type for s in OWNER_SOURCES})


# ---------------------------------------------------------------------------
# Storage backends
# ---------------------------------------------------------------------------


class LocalStore:
    """`static/covers` on disk. COVER_DIR is read per call, never cached."""

    label = "local disk"

    @property
    def root(self) -> str:
        return image_manager.COVER_DIR

    def _flat_path(self, filename: str) -> str:
        return os.path.join(self.root, filename)

    def _key_path(self, key: str) -> str:
        return os.path.join(self.root, *key.split("/"))

    def exists_key(self, key: str) -> bool:
        return os.path.exists(self._key_path(key))

    def exists_flat(self, filename: str) -> bool:
        return os.path.exists(self._flat_path(filename))

    def move(self, filename: str, key: str) -> None:
        target = self._key_path(key)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        os.replace(self._flat_path(filename), target)

    def list_flat(self) -> list[str]:
        if not os.path.isdir(self.root):
            return []
        return sorted(
            f
            for f in os.listdir(self.root)
            if f.lower().endswith(".jpg") and os.path.isfile(self._flat_path(f))
        )


class GcsStore:
    """
    The active bucket, where the key IS the blob name.

    UNTESTED against a live bucket - see the module docstring.
    """

    label = "GCS bucket"

    def __init__(self):
        self.bucket_name = get_active_bucket_name()
        if not self.bucket_name:
            raise SystemExit(
                "--gcs was given but no bucket is configured; check GCS_BUCKET_NAME."
            )
        self._bucket = get_gcs_client().bucket(self.bucket_name)

    @property
    def root(self) -> str:
        return f"gs://{self.bucket_name}"

    def exists_key(self, key: str) -> bool:
        return self._bucket.blob(key).exists()

    def exists_flat(self, filename: str) -> bool:
        return self._bucket.blob(filename).exists()

    def move(self, filename: str, key: str) -> None:
        # rename_blob is a server-side copy followed by a delete; there is no
        # atomic rename in GCS.
        self._bucket.rename_blob(self._bucket.blob(filename), key)

    def list_flat(self) -> list[str]:
        return sorted(
            b.name
            for b in self._bucket.list_blobs()
            if "/" not in b.name and b.name.lower().endswith(".jpg")
        )


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------


@dataclass
class Report:
    owners: dict[str, Counter] = field(default_factory=dict)
    # (owner_type, filename) for every row whose file is nowhere to be found.
    missing: list[tuple[str, str]] = field(default_factory=list)
    # Flat files no row points at. Left in place on purpose.
    orphans: list[str] = field(default_factory=list)

    def counts(self, owner_type: str) -> Counter:
        return self.owners.setdefault(owner_type, Counter())

    @property
    def total(self) -> Counter:
        out = Counter()
        for c in self.owners.values():
            out.update(c)
        return out


def _stem(value: str) -> str:
    """The bare id in a column value, whether or not it carries a folder."""
    return os.path.splitext(os.path.basename(value.replace("\\", "/")))[0]


def migrate(db, store, apply: bool = False) -> Report:
    """
    Move every referenced file into its owner folder and rewrite the column.

    With apply=False nothing is written: the returned Report is the plan.
    """
    report = Report()
    for owner_type in owner_types():
        report.counts(owner_type)

    flat_at_start = set(store.list_flat())
    referenced: set[str] = set()

    for source in OWNER_SOURCES:
        counts = report.counts(source.owner_type)
        for row in db.query(source.model).all():
            value = getattr(row, source.column, None)
            if not value:
                continue

            filename = f"{_stem(value)}.jpg"
            referenced.add(filename)
            key = cover_key(source.owner_type, _stem(value))

            moved = False
            if store.exists_key(key):
                pass
            elif store.exists_flat(filename):
                print(f"  move   {filename} -> {key}")
                if apply:
                    store.move(filename, key)
                counts["moved"] += 1
                moved = True
            else:
                print(f"  MISSING {source.owner_type} {filename} (no file anywhere)")
                counts["missing"] += 1
                report.missing.append((source.owner_type, filename))
                # The column stays as it is: see the module docstring.
                continue

            if value != key:
                print(f"  column {source.model.__name__}.{source.column}: {value} -> {key}")
                if apply:
                    setattr(row, source.column, key)
                counts["column_updated"] += 1
            elif not moved:
                counts["already"] += 1

    if apply:
        db.commit()

    report.orphans = sorted(flat_at_start - referenced)
    return report


def format_report(report: Report, store, apply: bool) -> str:
    lines = []
    mode = "APPLIED" if apply else "DRY RUN (nothing changed)"
    lines.append("")
    lines.append(f"=== Cover layout migration - {mode} - {store.root} ===")
    lines.append(
        f"{'owner':<14}{'moved':>8}{'already':>9}{'col.upd':>9}{'missing':>9}"
    )
    for owner_type in owner_types():
        c = report.counts(owner_type)
        lines.append(
            f"{owner_type:<14}{c['moved']:>8}{c['already']:>9}"
            f"{c['column_updated']:>9}{c['missing']:>9}"
        )
    t = report.total
    lines.append(
        f"{'TOTAL':<14}{t['moved']:>8}{t['already']:>9}"
        f"{t['column_updated']:>9}{t['missing']:>9}"
    )

    if report.missing:
        lines.append("")
        lines.append(f"Rows whose file is missing ({len(report.missing)}) - not touched:")
        for owner_type, filename in report.missing:
            lines.append(f"  {owner_type:<14}{filename}")

    lines.append("")
    if report.orphans:
        lines.append(
            f"Files with no row ({len(report.orphans)}) - left where they are, "
            "so 'check unused cover images' still reports them:"
        )
        for filename in report.orphans:
            lines.append(f"  {filename}")
    else:
        lines.append("Files with no row: none.")
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="perform the migration (without this it is a dry run)",
    )
    parser.add_argument(
        "--gcs",
        action="store_true",
        help="target the GCS bucket instead of local disk (UNTESTED - see docstring)",
    )
    args = parser.parse_args(argv)

    store = GcsStore() if args.gcs else LocalStore()
    print(f"Cover storage: {store.root} ({store.label})")
    print("Mode: APPLY" if args.apply else "Mode: DRY RUN - pass --apply to perform it")

    db = SessionLocal()
    try:
        report = migrate(db, store, apply=args.apply)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(format_report(report, store, args.apply))
    return 0


if __name__ == "__main__":
    sys.exit(main())
