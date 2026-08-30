"""
Group items into duplicate clusters with union-find.

Every duplicate finder (franchise, series, eight media types, people/studios)
needs the same thing: bucket rows by a key that must match exactly, compare
every pair inside a bucket with a looser test, and take the transitive closure
so A~B and B~C put A, B and C in one cluster. Ten hand-written copies of the
union-find lived in the finders; this is the one they share.
"""

from typing import Callable, Hashable, Iterable, Optional, TypeVar

T = TypeVar("T")


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[int, int] = {}

    def find(self, x: int) -> int:
        root = x
        while self.parent.get(root, root) != root:
            root = self.parent[root]
        while self.parent.get(x, x) != root:  # path compression
            nxt = self.parent.get(x, x)
            self.parent[x] = root
            x = nxt
        return root

    def union(self, x: int, y: int) -> None:
        px, py = self.find(x), self.find(y)
        if px != py:
            self.parent[px] = py


def cluster(
    items: Iterable[T],
    match: Callable[[T, T], bool],
    key: Optional[Callable[[T], Hashable]] = None,
) -> list[list[T]]:
    """
    Clusters of two or more items that are transitively `match`-related.

    `key` partitions the items first: only items with an equal key are ever
    compared (the exact-match half of a duplicate rule - same franchise, same
    season...). `match` is the looser pairwise test (a shared name). Items keep
    their input order inside a cluster; clusters come out in first-member order.
    """
    items = list(items)
    buckets: dict[Hashable, list[int]] = {}
    for index, item in enumerate(items):
        buckets.setdefault(key(item) if key else None, []).append(index)

    uf = _UnionFind()
    for members in buckets.values():
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if match(items[a], items[b]):
                    uf.union(a, b)

    groups: dict[int, list[T]] = {}
    for index, item in enumerate(items):
        groups.setdefault(uf.find(index), []).append(item)
    return [group for group in groups.values() if len(group) > 1]
