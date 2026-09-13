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

# Field groups the `safe` mode does NOT carry on a FRESH install. A group
# lands here when its whole purpose is to withhold something from ordinary
# viewers, so granting it by default would defeat it. Moved from seed.py,
# where it was GUEST_WITHHELD_FIELD_GROUPS: the role axis no longer carries
# field groups.
#
# This is the FALLBACK, not the rule. On an existing installation `safe` is
# derived from what the guest role actually holds - see
# guest_field_groups() - because the two are not the same thing and assuming
# they were would have silently widened the public site. See the note there.
SAFE_WITHHELD_FIELD_GROUPS: frozenset[str] = frozenset({"sources_restricted"})

FIELD_GROUP_PREFIX = "field_group."


def guest_field_groups(db: Session) -> frozenset[str] | None:
    """
    The field groups the guest ROLE holds right now, or None if it holds none.

    `safe` is meant to be "today's guest exactly", and the only way to make
    that true is to read it rather than assume it. Assuming it cost a real
    defect: the design said guest withheld `sources_restricted` and nothing
    else, but on this installation guest held only `credits` and
    `system_info`. `sources_other` and `personal_notes` were added to
    FIELD_GROUPS after the roles were first seeded, and ensure_rbac_seed tops
    up only a role holding NOTHING - deliberately, so an admin's removal
    survives a restart - so those two groups never reached guest or user.
    Seeding `safe` from the default set would therefore have published the
    other-sources list and other people's personal reviews to every logged-out
    visitor on the day Phase B landed.

    None means the guest role holds no field groups at all, which on a fresh
    database means ensure_rbac_seed has not run yet rather than that an admin
    withheld everything. The caller falls back to the seeded default.
    """
    guest = db.query(models.Role).filter(models.Role.name == "guest").first()
    if guest is None:
        return None
    held = frozenset(
        row.permission[len(FIELD_GROUP_PREFIX) :]
        for row in db.query(models.RolePermission.permission).filter(
            models.RolePermission.role_id == guest.system_id,
            models.RolePermission.permission.like(f"{FIELD_GROUP_PREFIX}%"),
        )
    )
    return held or None

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
            "all_labels": False,
            "field_groups": every_group,
        },
        {
            "key": MODE_SAFE,
            "label": "Safe",
            "description": (
                "No labelled entries, and the restricted source list is "
                "withheld. Always what a logged-out visitor sees - the "
                "anonymous policy is this mode and cannot be moved to "
                "another."
            ),
            "sort_order": 30,
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
    # `safe` means "today's guest exactly", and that is read from the guest
    # role rather than assumed. See guest_field_groups().
    safe_groups = guest_field_groups(db)

    for spec in seeded_modes():
        if spec["key"] == MODE_SAFE and safe_groups is not None:
            spec = {**spec, "field_groups": tuple(sorted(safe_groups))}
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
