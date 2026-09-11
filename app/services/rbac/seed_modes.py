"""
The four access modes the app ships with.

Called from the lifespan AND named by the Phase B migration, for the reason
seed.py already gives: tests/api/conftest.py resets the schema with
Base.metadata.create_all and never runs Alembic, so a seed living only in a
migration body would leave every API test mode-less. The migration does NOT
import this module - it carries its own frozen copy of the same rows, because
a migration that imports app code breaks the day a later revision adds a
column. See the spec's section 5, "The seed is a frozen snapshot".

`safe` is today's guest exactly - GUEST_WITHHELD_FIELD_GROUPS was
{"sources_restricted"} and nothing else - so nothing a visitor sees changes on
the day this lands.
"""

from sqlalchemy.orm import Session

from app import models

MODE_UNRESTRICTED = "unrestricted"
MODE_BORDERLINE = "borderline"
MODE_NORMAL = "normal"
MODE_SAFE = "safe"

# Field groups the `safe` mode does NOT carry. A group lands here when its
# whole purpose is to withhold something from ordinary viewers, so granting it
# by default would defeat it. Moved from seed.py, where it was
# GUEST_WITHHELD_FIELD_GROUPS: the role axis no longer carries field groups.
SAFE_WITHHELD_FIELD_GROUPS: frozenset[str] = frozenset({"sources_restricted"})

def seeded_modes() -> tuple[dict, ...]:
    """
    The four system modes, as data.

    A FUNCTION rather than a module constant, and not for style. Importing
    FIELD_GROUP_KEYS at module scope makes this module the head of a
    pre-existing import cycle - field_groups imports domain.credits, which
    reaches routers.constants, which imports the rbac resolver, which imports
    permissions, which imports field_groups. The cycle is latent: it only
    raises when field_groups is the FIRST of those modules to be imported, so
    seed.py has always got away with the same import. Deferring the import to
    call time sidesteps it without restructuring four other files. See the
    note in docs/PROGRESS.md.
    """
    from app.services.rbac.field_groups import FIELD_GROUP_KEYS

    every_group = tuple(FIELD_GROUP_KEYS)
    return (
        {
            "key": MODE_UNRESTRICTED,
            "label": "Unrestricted",
            "description": "Every entry and every field. The widest mode.",
            "sort_order": 0,
            "is_guest_default": False,
            "all_labels": True,
            "field_groups": every_group,
        },
        {
            "key": MODE_BORDERLINE,
            "label": "Borderline",
            "description": (
                "Adult-labelled entries are visible; every field shows."
            ),
            "sort_order": 10,
            "is_guest_default": False,
            "all_labels": True,
            "field_groups": every_group,
        },
        {
            "key": MODE_NORMAL,
            "label": "Normal",
            "description": (
                "No labelled entries; every field of a visible entry shows."
            ),
            "sort_order": 20,
            "is_guest_default": False,
            "all_labels": False,
            "field_groups": every_group,
        },
        {
            "key": MODE_SAFE,
            "label": "Safe",
            "description": (
                "No labelled entries, and the restricted source list is "
                "withheld. What a logged-out visitor sees."
            ),
            "sort_order": 30,
            "is_guest_default": True,
            "all_labels": False,
            "field_groups": tuple(
                key
                for key in every_group
                if key not in SAFE_WITHHELD_FIELD_GROUPS
            ),
        },
    )


def ensure_access_mode_seed(db: Session) -> None:
    """
    Create the four modes and top up their items. Idempotent.

    Tops up only a mode holding NOTHING of a given kind, exactly as
    ensure_rbac_seed does for guest: an item an admin deliberately removed
    must not be handed back on the next restart.

    The label side is defined over the content_label rows that exist WHEN THIS
    RUNS. A label minted later is not retro-granted to `unrestricted` - same
    rule, and the reason the access-mode admin page exists.
    """
    label_ids = [row.system_id for row in db.query(models.ContentLabel.system_id)]

    for spec in seeded_modes():
        mode = (
            db.query(models.AccessMode)
            .filter(models.AccessMode.key == spec["key"])
            .first()
        )
        if mode is None:
            mode = models.AccessMode(
                key=spec["key"],
                label=spec["label"],
                description=spec["description"],
                sort_order=spec["sort_order"],
                is_system=True,
                is_guest_default=spec["is_guest_default"],
            )
            db.add(mode)
            db.flush()

        held_groups = db.query(models.AccessModeFieldGroup).filter(
            models.AccessModeFieldGroup.mode_id == mode.system_id
        )
        if held_groups.first() is None:
            for key in spec["field_groups"]:
                db.add(
                    models.AccessModeFieldGroup(
                        mode_id=mode.system_id, field_group_key=key
                    )
                )

        if spec["all_labels"] and label_ids:
            held_labels = db.query(models.AccessModeLabel).filter(
                models.AccessModeLabel.mode_id == mode.system_id
            )
            if held_labels.first() is None:
                for label_id in label_ids:
                    db.add(
                        models.AccessModeLabel(
                            mode_id=mode.system_id, label_id=label_id
                        )
                    )

    db.flush()
