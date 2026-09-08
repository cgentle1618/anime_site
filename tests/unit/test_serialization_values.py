"""app/utils/serialization_values.py: the shared serialization-platform
normalisation used by Task 10's seed migration and Task 11's backfill.

See .superpowers/sdd/2026-09-04-media-sources/task-10-decisions.md for the
algorithm and the real-data examples this covers.
"""

from app.utils.serialization_values import canonical_values, normalise, resolve


def test_normalise_splits_on_comma():
    assert normalise("Twitter, Pixiv") == [("Twitter", None), ("Pixiv", None)]


def test_normalise_trims_whitespace():
    assert normalise("  Twitter  ,  Pixiv  ") == [
        ("Twitter", None),
        ("Pixiv", None),
    ]


def test_normalise_drops_empty_parts():
    assert normalise("Twitter, , Pixiv") == [("Twitter", None), ("Pixiv", None)]


def test_normalise_extracts_parenthetical_as_remark():
    assert normalise("Naver Webtoon (LINE Webtoon)") == [
        ("Naver Webtoon", "LINE Webtoon")
    ]


def test_normalise_no_parenthetical_means_no_remark():
    assert normalise("Jump+") == [("Jump+", None)]


def test_normalise_single_value_no_comma():
    assert normalise("週刊少年Jump") == [("週刊少年Jump", None)]


def test_canonical_values_merges_case_insensitively_by_frequency():
    raws = ["週刊Young Jump"] * 3 + ["週刊YOUNG JUMP"]
    merged = canonical_values(raws)
    key = "週刊young jump".casefold()
    assert merged[key] == ("週刊Young Jump", None)


def test_canonical_values_tie_break_fewest_uppercase_ascii():
    # Equal counts: the spelling with fewer uppercase ASCII characters wins.
    raws = ["週刊Young Jump", "週刊YOUNG JUMP"]
    merged = canonical_values(raws)
    key = "週刊young jump".casefold()
    assert merged[key] == ("週刊Young Jump", None)


def test_canonical_values_tie_break_lexicographic_first():
    # Equal counts, equal uppercase-ASCII counts (1 each) -> lexicographically
    # first ('A' < 'a' in code point order).
    raws = ["Abc", "aBc"]
    merged = canonical_values(raws)
    key = "abc".casefold()
    assert merged[key] == ("Abc", None)


def test_canonical_values_attaches_single_remark():
    raws = ["週刊少年Magazine"] * 19 + ["週刊少年Magazine (Magazine Pocket)"] * 2
    merged = canonical_values(raws)
    key = "週刊少年magazine".casefold()
    assert merged[key] == ("週刊少年Magazine", "Magazine Pocket")


def test_canonical_values_joins_disagreeing_remarks():
    raws = ["Foo (Bar)", "Foo (Baz)"]
    merged = canonical_values(raws)
    key = "foo".casefold()
    value, remark = merged[key]
    assert value == "Foo"
    assert remark == "Bar; Baz"


def test_canonical_values_does_not_duplicate_identical_remarks():
    raws = ["Foo (Bar)", "Foo (Bar)"]
    merged = canonical_values(raws)
    key = "foo".casefold()
    assert merged[key] == ("Foo", "Bar")


def test_canonical_values_splits_compound_values_before_grouping():
    raws = ["週刊少年Jump, Jump+", "週刊少年Jump"]
    merged = canonical_values(raws)
    assert merged["週刊少年jump".casefold()] == ("週刊少年Jump", None)
    assert merged["jump+".casefold()] == ("Jump+", None)


def test_resolve_returns_ordered_canonical_values_for_a_compound_row():
    raws = ["Miracle Jump, 週刊Young Jump", "週刊YOUNG JUMP"] * 1
    merged = canonical_values(raws)
    assert resolve("Miracle Jump, 週刊Young Jump", merged) == [
        "Miracle Jump",
        "週刊Young Jump",
    ]


def test_resolve_single_value():
    merged = canonical_values(["Jump+"])
    assert resolve("Jump+", merged) == ["Jump+"]


# The real values from task-10-decisions.md's table.
def test_real_example_jump_and_jump_plus():
    merged = canonical_values(["週刊少年Jump, Jump+"])
    assert resolve("週刊少年Jump, Jump+", merged) == ["週刊少年Jump", "Jump+"]


def test_real_example_jump_and_jump_giga():
    merged = canonical_values(["週刊少年Jump, Jump GIGA"])
    assert resolve("週刊少年Jump, Jump GIGA", merged) == [
        "週刊少年Jump",
        "Jump GIGA",
    ]


def test_real_example_miracle_jump_and_young_jump():
    merged = canonical_values(["Miracle Jump, 週刊Young Jump"])
    assert resolve("Miracle Jump, 週刊Young Jump", merged) == [
        "Miracle Jump",
        "週刊Young Jump",
    ]


def test_real_example_twitter_and_pixiv():
    merged = canonical_values(["Twitter, Pixiv"])
    assert resolve("Twitter, Pixiv", merged) == ["Twitter", "Pixiv"]


def test_real_example_twitter_and_niconico():
    merged = canonical_values(["Twitter, Niconico靜畫"])
    assert resolve("Twitter, Niconico靜畫", merged) == ["Twitter", "Niconico靜畫"]


def test_real_example_sunday_webry_and_gene_x():
    merged = canonical_values(["Sunday Webry, 月刊Sunday Gene-X"])
    assert resolve("Sunday Webry, 月刊Sunday Gene-X", merged) == [
        "Sunday Webry",
        "月刊Sunday Gene-X",
    ]


def test_real_example_young_sunday_and_big_comic_spirits():
    merged = canonical_values(["週刊Young Sunday, Big Comic Spirits"])
    assert resolve("週刊Young Sunday, Big Comic Spirits", merged) == [
        "週刊Young Sunday",
        "Big Comic Spirits",
    ]


def test_real_example_champion_and_manga_cross():
    merged = canonical_values(["週刊少年Champion, Manga Cross"])
    assert resolve("週刊少年Champion, Manga Cross", merged) == [
        "週刊少年Champion",
        "Manga Cross",
    ]


def test_real_example_young_jump_case_merge():
    raws = ["週刊Young Jump"] * 3 + ["週刊YOUNG JUMP"]
    merged = canonical_values(raws)
    assert resolve("週刊YOUNG JUMP", merged) == ["週刊Young Jump"]
    assert resolve("週刊Young Jump", merged) == ["週刊Young Jump"]


def test_real_example_magazine_pocket_merge():
    raws = ["週刊少年Magazine"] * 19 + ["週刊少年Magazine (Magazine Pocket)"] * 2
    merged = canonical_values(raws)
    assert resolve("週刊少年Magazine (Magazine Pocket)", merged) == ["週刊少年Magazine"]
    assert merged["週刊少年magazine".casefold()][1] == "Magazine Pocket"


def test_real_example_naver_webtoon_remark():
    merged = canonical_values(["Naver Webtoon (LINE Webtoon)"] * 4)
    assert resolve("Naver Webtoon (LINE Webtoon)", merged) == ["Naver Webtoon"]
    assert merged["naver webtoon".casefold()] == ("Naver Webtoon", "LINE Webtoon")


def test_real_example_gene_x_appears_standalone_and_compound():
    # 月刊Sunday Gene-X appears both alone and inside a compound; after
    # splitting they must merge to one option.
    raws = ["Sunday Webry, 月刊Sunday Gene-X", "月刊Sunday Gene-X"]
    merged = canonical_values(raws)
    assert len(merged) == 2
    assert merged["月刊sunday gene-x".casefold()] == ("月刊Sunday Gene-X", None)
