"""
What a character is to the work.

Lives here rather than in routers/constants.py, where it used to, because
services/domain/casting.py validates against it and a service importing a
router is an inversion - and in this case a load-bearing one. It closed an
import cycle: rbac/field_groups imports domain.credits, initialising
services.domain, whose __init__ imports casting, which imported
routers.constants, which imports the rbac resolver, which imports
rbac/permissions, which imports field_groups. The cycle only raised when
field_groups happened to be the FIRST of those modules imported, so it stayed
latent for a year and surfaced when a new test file sorted alphabetically
ahead of everything that used to load the chain first.

routers/constants.py still re-exports the name, so its /api/constants payload
is unchanged.
"""

# From MAL's own two-way split. Nullable on character_casting: an admin
# entering a cast by hand need not classify.
CHARACTER_ROLES: tuple[str, ...] = ("Main", "Supporting")
