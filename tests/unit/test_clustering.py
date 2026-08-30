"""The one union-find used by every duplicate finder."""

from app.utils.clustering import cluster


def names_overlap(a, b):
    return bool(a["names"] & b["names"])


def rows(*specs):
    return [{"id": i, "bucket": bucket, "names": set(names)} for i, (bucket, names) in enumerate(specs)]


def ids(clusters):
    return sorted(sorted(r["id"] for r in c) for c in clusters)


def test_returns_only_groups_with_more_than_one_member():
    items = rows(("x", "a"), ("x", "a"), ("x", "z"))
    assert ids(cluster(items, key=lambda r: r["bucket"], match=names_overlap)) == [[0, 1]]


def test_only_compares_within_a_bucket():
    items = rows(("x", "a"), ("y", "a"))
    assert cluster(items, key=lambda r: r["bucket"], match=names_overlap) == []


def test_transitive_matches_collapse_into_one_cluster():
    # 0~1 share "a", 1~2 share "b": all three are one cluster although 0 and 2
    # share nothing directly.
    items = rows(("x", "a"), ("x", "ab"), ("x", "b"))
    assert ids(cluster(items, key=lambda r: r["bucket"], match=names_overlap)) == [[0, 1, 2]]


def test_no_key_means_one_bucket():
    items = rows(("x", "a"), ("y", "a"))
    assert ids(cluster(items, match=names_overlap)) == [[0, 1]]


def test_preserves_input_order_inside_a_cluster():
    items = rows(("x", "a"), ("x", "q"), ("x", "a"))
    [group] = cluster(items, key=lambda r: r["bucket"], match=names_overlap)
    assert [r["id"] for r in group] == [0, 2]
