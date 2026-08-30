"""app.services.pipelines package — admin-triggered data pipelines.

Re-exports every pipeline entry point so callers can import from the
package root regardless of module.
"""

from app.services.pipelines.backup import (
    execute_backup,
)
from app.services.pipelines.fill import (
    execute_fill_all,
    execute_fill_anime,
    execute_fill_anime_movie,
    execute_fill_cartoon,
    execute_fill_comic,
    execute_fill_manga,
    execute_fill_movie,
    execute_fill_novel,
    execute_fill_tv_show,
)
from app.services.pipelines.pull import (
    execute_pull_all,
    execute_pull_specific,
)
from app.services.pipelines.replace import (
    execute_replace_all,
    execute_replace_anime,
    execute_replace_anime_movie,
    execute_replace_cartoon,
    execute_replace_manga,
    execute_replace_movie,
    execute_replace_novel,
    execute_replace_single_anime,
    execute_replace_single_anime_movie,
    execute_replace_single_cartoon,
    execute_replace_single_comic,
    execute_replace_single_manga,
    execute_replace_single_movie,
    execute_replace_single_novel,
    execute_replace_single_tv_show,
    execute_replace_tv_show,
)

__all__ = [
    "execute_backup",
    "execute_fill_anime",
    "execute_fill_anime_movie",
    "execute_fill_movie",
    "execute_fill_tv_show",
    "execute_fill_cartoon",
    "execute_fill_manga",
    "execute_fill_novel",
    "execute_fill_comic",
    "execute_fill_all",
    "execute_replace_single_anime",
    "execute_replace_single_anime_movie",
    "execute_replace_single_movie",
    "execute_replace_single_tv_show",
    "execute_replace_single_cartoon",
    "execute_replace_single_manga",
    "execute_replace_single_novel",
    "execute_replace_single_comic",
    "execute_replace_anime",
    "execute_replace_anime_movie",
    "execute_replace_movie",
    "execute_replace_tv_show",
    "execute_replace_cartoon",
    "execute_replace_manga",
    "execute_replace_novel",
    "execute_replace_all",
    "execute_pull_specific",
    "execute_pull_all",
]
