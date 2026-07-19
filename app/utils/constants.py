from enum import Enum


class WatchStatus(str, Enum):
    PLAN_TO_WATCH = "Plan to Watch"
    WATCH_WHEN_AIRS = "Watch When Airs"
    ACTIVE_WATCHING = "Active Watching"
    PASSIVE_WATCHING = "Passive Watching"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    TEMP_DROPPED = "Temp Dropped"
    DROPPED = "Dropped"


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
    ACG = "ACG"
    NOVEL = "Novel"
