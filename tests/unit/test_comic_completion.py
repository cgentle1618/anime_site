"""Unit tests for mark_comic_completed."""

from app.models.comic import Comic
from app.services.domain.completion import mark_comic_completed


class TestMarkComicCompleted:
    def test_sets_reading_and_serialization_status(self):
        c = Comic(comic_name_en="ASM", issue_total=93, issue_fin=74)
        mark_comic_completed(c)
        assert c.reading_status == "Completed"
        assert c.serialization_status == "完結"

    def test_snaps_issue_fin_up_to_issue_total(self):
        c = Comic(comic_name_en="ASM", issue_total=93, issue_fin=74)
        mark_comic_completed(c)
        assert c.issue_fin == 93

    def test_raises_issue_total_when_fin_is_further_along(self):
        # Trusting the higher of the two matches how Novel handles vol counts.
        c = Comic(comic_name_en="ASM", issue_total=50, issue_fin=74)
        mark_comic_completed(c)
        assert c.issue_fin == 74
        assert c.issue_total == 74

    def test_leaves_unknown_total_alone(self):
        c = Comic(comic_name_en="ASM", issue_total=None, issue_fin=12)
        mark_comic_completed(c)
        assert c.issue_total is None
        assert c.issue_fin == 12

    def test_handles_both_counts_missing(self):
        c = Comic(comic_name_en="ASM")
        mark_comic_completed(c)
        assert c.reading_status == "Completed"
