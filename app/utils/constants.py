from enum import Enum


class WatchStatus(str, Enum):
    MIGHT_WATCH = "Might Watch"
    PLAN_TO_WATCH = "Plan to Watch"
    WATCH_WHEN_AIRS = "Watch When Airs"
    ACTIVE_WATCHING = "Active Watching"
    PASSIVE_WATCHING = "Passive Watching"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    COMPLETED_EXPLAINED = "Completed (解說)"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"
    WONT_WATCH = "Won't Watch"


class ReadStatus(str, Enum):
    MIGHT_READ = "Might Read"
    PLAN_TO_READ = "Plan to Read"
    ACTIVE_READING = "Active Reading"
    PASSIVE_READING = "Passive Reading"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    COMPLETED_EXPLAINED = "Completed (解說)"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"
    WONT_READ = "Won't Read"


# "Completed (解說)" means the entry was finished through a summary/commentary
# video rather than the work itself. It still counts as completed everywhere the
# plain "Completed" status does, so both live behind these sets.
COMPLETED_WATCH_STATUSES = frozenset(
    {WatchStatus.COMPLETED, WatchStatus.COMPLETED_EXPLAINED}
)
COMPLETED_READ_STATUSES = frozenset(
    {ReadStatus.COMPLETED, ReadStatus.COMPLETED_EXPLAINED}
)


class AiringStatus(str, Enum):
    NOT_YET_AIRED = "Not Yet Aired"
    AIRING = "Airing"
    FINISHED_AIRING = "Finished Airing"
    CANCELED = "Canceled"
    RUMORED = "Rumored"


class AnimeAiringType(str, Enum):
    TV = "TV"
    ONA = "ONA"
    OVA = "OVA"
    OAD = "OAD"
    SPECIAL = "Special"
    MOVIE = "Movie"


class FranchiseType(str, Enum):
    ANIME = "Anime"
    MOVIE = "Movie"
    TV = "TV"
    CARTOON = "Cartoon"
    COMIC = "Comic"
    ACG = "ACG"
    NOVEL = "Novel"
