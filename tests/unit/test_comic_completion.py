"""The comic /complete halves.

Ported from mark_comic_completed, which step 1 retires: the serialization and
issue_total are the work's and belong to mark_comic_catalog; reading_status and
issue_fin are one reader's and belong to mark_comic_list. Every assertion below
is the one the single helper carried, re-aimed at whichever half now owns it.
"""

from types import SimpleNamespace

from app.models.comic import Comic
from app.services.domain.completion import mark_comic_catalog, mark_comic_list


def row(**kw):
    base = dict(status="Active Reading", issue_fin=0)
    base.update(kw)
    return SimpleNamespace(**base)


class TestMarkComicCompleted:
    def test_sets_reading_and_serialization_status(self):
        c = Comic(comic_name_en="ASM", issue_total=93)
        r = row(issue_fin=74)
        mark_comic_catalog(c)
        mark_comic_list(r, c)
        assert r.status == "Completed"
        assert c.serialization_status == "完結"

    def test_snaps_issue_fin_up_to_issue_total(self):
        c = Comic(comic_name_en="ASM", issue_total=93)
        r = row(issue_fin=74)
        mark_comic_catalog(c)
        mark_comic_list(r, c)
        assert r.issue_fin == 93

    def test_raises_issue_fin_when_it_is_further_along(self):
        """The reader's own position wins when it is ahead of the total.

        The original also raised issue_total to match, taking the higher of
        the two the way Novel handles vol counts. It cannot any more: one
        reader being ahead of the recorded issue count is not evidence about
        how many issues were published, and mark_comic_catalog may not learn
        the work's length from somebody's progress.
        """
        c = Comic(comic_name_en="ASM", issue_total=50)
        r = row(issue_fin=74)
        mark_comic_catalog(c)
        mark_comic_list(r, c)
        assert r.issue_fin == 74

    def test_leaves_unknown_total_alone(self):
        c = Comic(comic_name_en="ASM", issue_total=None)
        r = row(issue_fin=12)
        mark_comic_catalog(c)
        mark_comic_list(r, c)
        assert c.issue_total is None
        assert r.issue_fin == 12

    def test_handles_both_counts_missing(self):
        c = Comic(comic_name_en="ASM")
        r = row()
        mark_comic_catalog(c)
        mark_comic_list(r, c)
        assert r.status == "Completed"
