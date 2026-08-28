# -*- coding: utf-8 -*-
"""
Seeds the two reading orders from UltimateKrakoanAXEReadingOrder.pdf.

Idempotent: a list of the same name on the same franchise is deleted and
rebuilt, so re-running never doubles up.

Entry key is (comic_name_en, release_year) — unique across all 99 comic rows,
and exactly the PDF's own "Series Title (Year) #Issue" format.
"""

import sys
import uuid

from app.database import SessionLocal, get_taipei_now
from app.models import Comic, WatchOrderList, WatchOrderItem, WatchOrderSection

FRANCHISE_ID = uuid.UUID("502071de-e004-460d-8e9e-ea223a179fe2")

E, R, N, O = "Essential", "Recommended", "Normal", "Optional"


def one(name, year, issue, imp=N, note=None):
    """A single issue."""
    return (name, year, issue, issue, imp, note)


def run(name, year, start, end, imp=N, note=None):
    """A range of issues."""
    return (name, year, start, end, imp, note)


def whole(name, year, imp=N, note=None):
    """The entry entire — no range."""
    return (name, year, None, None, imp, note)


def chain(pairs, imp=N, note_first=None):
    """An ordered per-issue chain: [(name, year, issue), ...]."""
    out = []
    for i, (nm, yr, iss) in enumerate(pairs):
        out.append(one(nm, yr, iss, imp, note_first if i == 0 else None))
    return out


# =========================================================================
# LIST 1 — the full integrated order
# =========================================================================

MESSIAH_COMPLEX = [
    ("X-Men: Messiah Complex", 2007, 1),
    ("Uncanny X-Men", 1981, 492),
    ("X-Factor", 2005, 25),
    ("New X-Men", 2004, 44),
    ("X-Men", 2004, 205),
    ("Uncanny X-Men", 1981, 493),
    ("X-Factor", 2005, 26),
    ("New X-Men", 2004, 45),
    ("X-Men", 2004, 206),
    ("Uncanny X-Men", 1981, 494),
    ("X-Factor", 2005, 27),
    ("New X-Men", 2004, 46),
    ("X-Men", 2004, 207),
]

MESSIAH_WAR = [
    ("X-Force/Cable: Messiah War", 2009, 1),
    ("Cable", 2008, 13),
    ("X-Force", 2008, 14),
    ("Cable", 2008, 14),
    ("X-Force", 2008, 15),
    ("Cable", 2008, 15),
    ("X-Force", 2008, 16),
]

HOX_POX = [
    ("House of X", 2019, 1),
    ("Powers of X", 2019, 1),
    ("House of X", 2019, 2),
    ("Powers of X", 2019, 2),
    ("House of X", 2019, 3),
    ("Powers of X", 2019, 3),
    ("Powers of X", 2019, 4),
    ("House of X", 2019, 4),
    ("House of X", 2019, 5),
    ("Powers of X", 2019, 5),
    ("House of X", 2019, 6),
    ("Powers of X", 2019, 6),
]

X_OF_SWORDS = [
    ("X of Swords: Creation", 2020, 1),
    ("X-Men", 2019, 12),
    ("Marauders", 2019, 13),
    ("Excalibur", 2019, 13),
    ("X-Force", 2019, 13),
    ("Hellions", 2020, 5),
    ("New Mutants", 2019, 13),
    ("Cable", 2020, 5),
    ("X-Men", 2019, 13),
    ("X-Factor", 2020, 4),
    ("Wolverine", 2020, 6),
    ("X-Force", 2019, 14),
    ("Hellions", 2020, 6),
    ("Cable", 2020, 6),
    ("X-Men", 2019, 14),
    ("X of Swords: Stasis", 2020, 1),
    ("Excalibur", 2019, 14),
    ("Wolverine", 2020, 7),
    ("X-Men", 2019, 15),
    ("Marauders", 2019, 14),
    ("Excalibur", 2019, 15),
    ("Hellions", 2020, 7),
    ("New Mutants", 2019, 14),
    ("Cable", 2020, 7),
    ("X-Force", 2019, 15),
    ("X-Men", 2019, 16),
    ("X of Swords: Destruction", 2020, 1),
]

GALA_2021 = [
    ("Marauders", 2019, 21),
    ("X-Men", 2019, 21),
    ("Hellions", 2020, 12),
    ("New Mutants", 2019, 19),
    ("X-Force", 2019, 20),
    ("Excalibur", 2019, 21),
    ("Way of X", 2021, 3),
    ("S.W.O.R.D.", 2020, 6),
    ("Planet-Size X-Men", 2021, 1),
    ("X-Factor", 2020, 10),
    ("X-Men", 2021, 1),
]

GALA_2022 = [
    ("Immortal X-Men", 2022, 4),
    ("X-Men", 2021, 12),
    ("Marauders", 2022, 4),
    ("X-Force", 2019, 29),
    ("New Mutants", 2019, 26),
    ("Knights of X", 2022, 3),
    ("Legion of X", 2022, 4),
]

# X Lives / X Deaths of Wolverine, strictly alternating.
X_LIVES_DEATHS = []
for n in range(1, 6):
    X_LIVES_DEATHS.append(("X Lives of Wolverine", 2022, n))
    X_LIVES_DEATHS.append(("X Deaths of Wolverine", 2022, n))

JUDGMENT_DAY = [
    ("A.X.E.: Judgment Day", 2022, 1),
    ("Immortal X-Men", 2022, 5),
    ("X-Men Red", 2022, 5),
    ("A.X.E.: Judgment Day", 2022, 2),
    ("A.X.E.: Death to the Mutants", 2022, 1),
    ("X-Men", 2021, 13),
    ("A.X.E.: Judgment Day", 2022, 3),
    ("A.X.E.: Death to the Mutants", 2022, 2),
    ("X-Men", 2021, 14),
    ("Immortal X-Men", 2022, 6),
    ("X-Men Red", 2022, 6),
    ("A.X.E.: Judgment Day", 2022, 4),
    ("X-Men Red", 2022, 7),
    ("A.X.E.: Judgment Day", 2022, 5),
    ("Immortal X-Men", 2022, 7),
    ("A.X.E.: Death to the Mutants", 2022, 3),
    ("A.X.E.: Avengers", 2022, 1),
    ("A.X.E.: X-Men", 2022, 1),
    ("A.X.E.: Eternals", 2022, 1),
    ("A.X.E.: Judgment Day", 2022, 6),
    ("A.X.E.: Judgment Day Omega", 2023, 1),
]

SINS_OF_SINISTER = [
    ("Sins of Sinister", 2023, 1),
    ("Immortal X-Men", 2022, 10),
    ("Nightcrawlers", 2023, 1),
    ("Storm & the Brotherhood of Mutants", 2023, 1),
    ("Immortal X-Men", 2022, 11),
    ("Nightcrawlers", 2023, 2),
    ("Storm & the Brotherhood of Mutants", 2023, 2),
    ("Immortal X-Men", 2022, 12),
    ("Nightcrawlers", 2023, 3),
    ("Storm & the Brotherhood of Mutants", 2023, 3),
    ("Sins of Sinister: Dominion", 2023, 1),
]

FINALE = []
for n in range(1, 6):
    FINALE.append(("Fall of the House of X", 2024, n))
    FINALE.append(("Rise of the Powers of X", 2024, n))


FULL_ORDER = [
    (
        "Part 0 — Prerequisites 前置閱讀 · 1975‒2019",
        "The classics, the Messiah trilogy, the road to Krakoa — plus the Avengers thread.",
        [
            run("Giant-Size X-Men", 1975, 1, 1, E,
                "《巨型X戰警》 — Krakoa's first appearance as a living island. The whole era is a 45-year callback to this one issue."),
            run("Uncanny X-Men", 1963, 129, 138, R,
                "The Dark Phoenix Saga 《黑鳳凰傳奇》 — introduces the Hellfire Club and its Inner Circle. Also the origin of the death/resurrection cycle the Resurrection Protocols formalize."),
            run("Uncanny X-Men", 1963, 141, 142, R,
                "Days of Future Past 《未來昔日》 — the Sentinel-dominated dystopia template. Powers of X is in direct conversation with this."),
            run("X-Men: God Loves, Man Kills", 1982, 1, 1, R,
                "《神愛世人，人殺世人》 — Reverend Stryker; the theological argument against mutant existence. Read before Way of X and the Orchis material."),
            run("New X-Men", 2001, 114, 154, E,
                "《新X戰警》 — Morrison's run. The \"mutants as culture, not just species\" thesis Hickman builds directly on."),
            run("House of M", 2005, 1, 8, E,
                "《M之家》 — \"No More Mutants\"; the decimation that makes mutant scarcity the era's central anxiety."),
            whole("X-Men: Endangered Species", 2007, R,
                  "《瀕危物種》 — the origin of the \"Beast will cross any ethical line for mutantkind\" thread that culminates in Krakoan X-Force."),
        ]
        + chain(MESSIAH_COMPLEX, R,
                "《彌賽亞情結》 — 13 chapters, read in this order. Hope Summers is born here; Mystique's hunt establishes Destiny's diaries, the object that drives Inferno and Immortal X-Men.")
        + [
            run("Cable", 2008, 1, 12, O,
                "《電索》 — Cable and Hope fleeing through the timestream. Mandatory if you read Messiah War."),
            run("X-Force", 2008, 1, 13, O,
                "《X特攻隊》 — Cyclops's black-ops kill team. Krakoa's X-Force is a direct descendant."),
        ]
        + chain(MESSIAH_WAR, O,
                "《彌賽亞戰爭》 — 7 chapters. The weakest leg and the least Krakoa-relevant; skipping to Second Coming loses nothing structural.")
        + [
            whole("X-Men: Second Coming", 2010, R,
                  "《二次降臨》 — the conclusion. Hope returns; the mutant-messiah thread resurfaces in Fall of the House of X."),
            run("New X-Men", 2004, 1, 43, O,
                "《新X戰警：學院X》 — the Academy X kids. Messiah Complex reads fine without them."),
            run("X-Factor", 2005, 1, 24, O,
                "The Madrox/Layla cast. Optional, but their Messiah Complex chapters land harder if you know them."),
            run("Avengers", 2018, 1, 6, R,
                "《復仇者》 — the Avengers take up residence inside a dead Celestial. That Celestial is the Progenitor, and it wakes up in Judgment Day."),
            one("Avengers", 2018, 8, R,
                "Completes the Celestial thread. Only load-bearing for Part 6 — readable immediately before the Eternals run instead."),
            run("Death of X", 2016, 1, 4, R,
                "《X之死》 — Cyclops's death and Emma's grief. Pays off across Marauders, Inferno and Immortal X-Men."),
            run("IvX", 2016, 0, 6, R, "《異人族大戰X戰警》 — reads straight on from Death of X."),
            run("Return of Wolverine", 2018, 1, 5, R, "《金鋼狼歸來》 — why Logan is alive."),
            one("Age of X-Man Alpha", 2019, 1, R, "《X人時代》 — Nate Grey's exit, referenced in Sins of Sinister."),
            one("Age of X-Man Omega", 2019, 1, R, "Closes the Age of X-Man thread."),
            run("Uncanny X-Men", 2018, 1, 10, E, "《非凡X戰警：解體》 — \"X-Men Disassembled.\""),
            run("Uncanny X-Men", 2019, 11, 22, E, "\"This Is Forever.\" Ends days before House of X."),
            whole("Excalibur", 1988, O,
                  "《王者之劍》 — classic Moira MacTaggert. Powers of X recontextualizes all of it, so reading it first makes the reveal land harder."),
        ],
    ),
    (
        "Part 1 — The Foundation 基石 · 2019",
        "House of X / Powers of X, read strictly interlaced by publication order, not by title. Do not skip the data pages — roughly 40% of the worldbuilding lives there.",
        chain(HOX_POX, E, "《X之家》 — the interlace starts here."),
    ),
    (
        "Part 2 — Dawn of X X之黎明 · 2019‒2020",
        "The launch line, read in loose parallel by issue number.",
        [
            run("X-Men", 2019, 1, 11, E, "《X戰警》"),
            run("Marauders", 2019, 1, 12, E, "《掠奪者》 — Kate Pryde; the best character arc of the era."),
            run("Excalibur", 2019, 1, 12, E, "《王者之劍》 — Otherworld setup, mandatory for X of Swords."),
            run("New Mutants", 2019, 1, 12, E, "《新變種人》"),
            run("X-Force", 2019, 1, 12, E, "《X特攻隊》 — Beast's descent."),
            run("Fallen Angels", 2019, 1, 6, O, "《墮落天使》 — skippable."),
            run("Cable", 2020, 1, 4, R, "《電索》"),
            run("Hellions", 2020, 1, 4, E, "《地獄之子》"),
            run("X-Factor", 2020, 1, 3, E, "《X因子》 — Resurrection Protocols in practice."),
            run("Wolverine", 2020, 1, 5, R, "《金鋼狼》"),
            one("Giant-Size X-Men: Jean Grey and Emma Frost", 2020, 1, R, "Read between X-Men #5-10."),
            one("Giant-Size X-Men: Nightcrawler", 2020, 1, R, "Read between X-Men #5-10."),
            one("Giant-Size X-Men: Fantomex", 2020, 1, R, "Read between X-Men #5-10."),
            one("Giant-Size X-Men: Magneto", 2020, 1, R, "Read between X-Men #5-10."),
        ],
    ),
    (
        "Part 3 — X of Swords 劍之X · 2020",
        "The first full crossover — Arakko arrives. Everything from this point on is partly about its status, including, two years later, Judgment Day.",
        chain(X_OF_SWORDS, E, "《劍之X》 — 27 chapters, strictly in this order."),
    ),
    (
        "Part 4 — Reign of X X之治 · 2021",
        "Hellfire Gala 2021, the Trial of Magneto, and Inferno.",
        [
            run("S.W.O.R.D.", 2020, 1, 11, E, "《神劍局》 — Abigail Brand's long con."),
            run("X-Men", 2019, 17, 21, E),
            run("Way of X", 2021, 1, 5, E, "《X之道》 — the era's thematic keystone."),
            run("Children of the Atom", 2021, 1, 6, O, "《原子之子》"),
            run("Hellions", 2020, 8, 18, R),
            run("X-Force", 2019, 16, 24, R),
            run("Marauders", 2019, 15, 27, R),
            run("New Mutants", 2019, 15, 23, R),
            run("X-Factor", 2020, 5, 10, R),
            run("Excalibur", 2019, 16, 26, R),
            run("Cable", 2020, 8, 12, R),
            run("Wolverine", 2020, 8, 19, R),
        ]
        + chain(GALA_2021, E,
                "HELLFIRE GALA 2021 — read as a block, in this order. These issues also appear in the runs above; this is the interleave.")
        + [
            run("X-Men", 2021, 1, 6, E),
            run("X-Corp", 2021, 1, 5, O),
            run("X-Men: The Trial of Magneto", 2021, 1, 5, E,
                "《萬磁王的審判》 — triggered by the murder at the end of X-Factor #10."),
            run("Inferno", 2021, 1, 4, E,
                "《煉獄》 — Hickman's exit. Read after X-Men (2021) #6 and The Trial of Magneto. Also the A.X.E. guide's Krakoan prerequisite; read once, here."),
        ],
    ),
    (
        "Part 5 — Destiny of X, First Half X之命運（上） · 2022",
        "The 2022 line opens. Every entry stops at a hard boundary — the Hellfire Gala — and nothing continues past it until the event is done.",
        chain(X_LIVES_DEATHS, R,
              "《金鋼狼的X次生命》/《金鋼狼的X次死亡》 — alternating: Lives #1, Deaths #1, Lives #2, Deaths #2…")
        + [
            run("Immortal X-Men", 2022, 1, 4, E,
                "《不朽X戰警》 — the spine of the back half. STOP AT #4. #5-7 are chapters of Judgment Day, not tie-ins."),
            run("X-Men Red", 2022, 1, 4, E,
                "《赤色X戰警》 — the era's best-reviewed book. STOP AT #4. Arakko on terraformed Mars is the provocation the Eternals judge."),
            run("X-Men", 2021, 7, 12, E, "#13-14 are event chapters; they appear in Part 6."),
            run("Invincible Iron Man", 2022, 1, 9, E,
                "《無敵鋼鐵人》 — Feilong's rise. Runs alongside; unaffected by the event. Genuinely load-bearing for the 2023 Gala."),
            run("Knights of X", 2022, 1, 5, R, "《X騎士》"),
            run("Legion of X", 2022, 1, 5, R, "《X軍團》 — #6 is a tie-in; resumes at #7 in Part 7."),
            run("Marauders", 2022, 1, 5, R, "#6 is a tie-in; resumes at #7 in Part 7."),
            run("X-Force", 2019, 25, 29, R, "#30-33 are tie-ins; resumes at #34 in Part 7."),
            run("Wolverine", 2020, 20, 23, R, "#24-25 are tie-ins; resumes at #26 in Part 7."),
            run("New Mutants", 2019, 24, 26, R),
            run("Sabretooth", 2022, 1, 5, R, "《劍齒虎》"),
            run("Sabretooth & the Exiles", 2022, 1, 5, R, "Reads straight on from Sabretooth."),
        ]
        + chain(GALA_2022, E,
                "HELLFIRE GALA 2022 地獄火盛宴 — read as a block, in this order. Full stop after this: Judgment Day opens days later. Do NOT start Immortal X-Men #5, X-Men Red #5 or X-Men (2021) #13 here."),
    ),
    (
        "Part 6 — A.X.E.: Judgment Day 審判日 · 2021‒2023",
        "The Eternals run staged first, then all 21 chapters interleaved. The one thing you cannot defer: the conclusion permanently changes the mutant resurrection status quo.",
        [
            run("Eternals", 2021, 1, 6, E,
                "《永恆族》 — \"Only Death Is Eternal.\" The single most important prerequisite, and the one thing the Krakoan list has no equivalent for."),
            one("Eternals: Celestia", 2021, 1, R, "Reads after Eternals #6; sits alongside the Thanos Rises special."),
            run("Eternals", 2021, 7, 12, E,
                "\"Hail Thanos.\" Druig takes the throne. This is the arc the event grows directly out of."),
            one("Eternals: The Heretic", 2022, 1, R,
                "《異端》 — sets up Uranos, who matters a great deal once the fighting starts. Self-contained."),
            one("A.X.E.: Eve of Judgment", 2022, 1, E,
                "《審判前夕》 — the official prologue. Read immediately before Judgment Day #1."),
            one("Free Comic Book Day 2022: Avengers/X-Men", 2022, 1, O,
                "A.X.E. story only. A teaser rather than a chapter — pleasant, not required."),
        ]
        + chain(JUDGMENT_DAY, E,
                "《審判日》 — 21 chapters, strictly in this order. Immortal X-Men always before X-Men Red at the same beat; the three one-shots go before #6; do not stop at #6 — Omega is where the consequences land.")
        + [
            run("Wolverine", 2020, 24, 25, O, "Tie-in. The mutant side of the judgments."),
            run("X-Force", 2019, 30, 32, O,
                "Tie-in. #33 is held back — see the spoiler trap at the head of Part 7."),
            one("Legion of X", 2022, 6, O, "Tie-in. Resume Legion of X at #7 in Part 7."),
            one("Marauders", 2022, 6, O, "Tie-in. Resume Marauders at #7 in Part 7."),
            one("Avengers", 2018, 60, O, "The wider Marvel Universe getting judged."),
            run("Fantastic Four", 2018, 47, 48, O, "《驚奇四超人》"),
            one("Amazing Spider-Man", 2022, 10, O, "《蜘蛛人》"),
            one("Captain Marvel", 2019, 42, O, "《驚奇隊長》"),
            one("A.X.E.: Iron Fist", 2022, 1, O, "《鐵拳俠》"),
            one("A.X.E.: Starfox", 2022, 1, O, "The better of the two remaining one-shots."),
        ],
    ),
    (
        "Part 7 — Destiny of X, Second Half X之命運（下） · 2022‒2023",
        "Every paused series restarts, under the new resurrection status quo. If you are ever unsure whether an issue belongs before or after the event, the boundary is always the Hellfire Gala 2022.",
        [
            one("X-Force", 2019, 33, R,
                "⚠ The spoiler trap. #33's ending gives away the conclusion of the main event, so it is read here rather than at its slot in Part 6 — where it also works as the transition into #34."),
            run("Immortal X-Men", 2022, 8, 13, E,
                "《不朽X戰警》 — resumes here. #10-12 are Sins of Sinister chapters and appear in Part 8."),
            run("X-Men Red", 2022, 8, 13, E, "《赤色X戰警》 — resumes here."),
            run("X-Men", 2021, 15, 25, E, "Resumes here."),
            run("X-Force", 2019, 34, 40, R),
            run("Wolverine", 2020, 26, 37, R),
            run("Marauders", 2022, 7, 12, R),
            run("Legion of X", 2022, 7, 10, R, "《X軍團》"),
            run("New Mutants", 2019, 27, 33, R, "《新變種人》"),
        ],
    ),
    (
        "Part 8 — Sins of Sinister 辛尼斯特之罪 · 2023",
        "A self-contained alternate-future crossover — but it runs on the post-Judgment Day resurrection rules. Reading it before Part 6 is the single most common way to break this order.",
        chain(SINS_OF_SINISTER, E, "《辛尼斯特之罪》 — 11 chapters, strictly in this order."),
    ),
    (
        "Part 9 — Fall of X X之殞落 · 2023‒2024",
        "Hellfire Gala 2023 turns the era over.",
        [
            one("X-Men: Before the Fall - Sinister Four", 2023, 1, E, "《辛尼斯特四人組》 — entry point."),
            one("X-Men: Before the Fall - Heralds of Apocalypse", 2023, 1, E, "《天啟先驅》"),
            one("X-Men: Before the Fall - Mutant First Strike", 2023, 1, E, "《變種人先制打擊》"),
            one("X-Men: Before the Fall - Sons of X", 2023, 1, E, "《X之子》"),
            one("X-Men: Hellfire Gala", 2023, 1, E,
                "The turning point. Read before anything below. Assumes Invincible Iron Man (2022) #1-9."),
            run("Immortal X-Men", 2022, 14, 18, E),
            run("X-Men Red", 2022, 14, 18, E),
            run("X-Men", 2021, 26, 35, E),
            run("X-Force", 2019, 43, 50, E),
            run("Wolverine", 2020, 37, 50, E),
            run("Invincible Iron Man", 2022, 10, 19, E),
            run("Uncanny Avengers", 2023, 1, 5, R, "《非凡復仇者》"),
            run("Dark X-Men", 2023, 1, 5, R, "《黑暗X戰警》"),
            run("Astonishing Iceman", 2023, 1, 5, R, "《驚異冰人》"),
            run("Children of the Vault", 2023, 1, 4, R, "《穹窖之子》"),
            run("Alpha Flight", 2023, 1, 5, O, "《阿爾法飛行隊》"),
            run("Jean Grey", 2023, 1, 4, O, "《琴·葛雷》"),
            run("Realm of X", 2023, 1, 4, O, "《X之境》"),
            run("Ms. Marvel: The New Mutant", 2023, 1, 4, O),
        ],
    ),
    (
        "Part 10 — The Finale 終章 · 2024",
        "Fall / Rise, alternating strictly, and the X-Men: Forever coda.",
        chain(FINALE, E, "《X之家的崩落》/《X之力的崛起》 — alternate strictly.")
        + [
            run("X-Men", 2021, 33, 35, R, "Concurrent with Fall / Rise."),
            run("X-Force", 2019, 48, 50, R, "Concurrent with Fall / Rise."),
            run("Wolverine", 2020, 45, 50, R, "Concurrent with Fall / Rise."),
            run("Dead X-Men", 2024, 1, 4, R, "Concurrent with Fall / Rise."),
            run("Resurrection of Magneto", 2024, 1, 4, R, "《萬磁王的復活》 — concurrent with Fall / Rise."),
            run("X-Men: Forever", 2024, 1, 4, E,
                "《X戰警：永恆》 — Gillen's coda. The true final page of the era."),
        ],
    ),
]


# =========================================================================
# LIST 2 — the Combined Core
# =========================================================================

COMBINED_CORE = [
    (
        "Prerequisites 前置閱讀",
        "The minimum that makes the era legible.",
        [
            one("Giant-Size X-Men", 1975, 1, E, "Krakoa's first appearance."),
            run("Uncanny X-Men", 1963, 129, 138, E, "The Dark Phoenix Saga."),
            run("Uncanny X-Men", 1963, 141, 142, E, "Days of Future Past."),
            one("X-Men: God Loves, Man Kills", 1982, 1, E),
            run("House of M", 2005, 1, 8, E),
            run("New X-Men", 2001, 114, 154, E, "Morrison's run."),
        ],
    ),
    (
        "Krakoa, to the 2022 Gala 克拉科亞",
        "The Krakoan spine up to the hard boundary the event sits behind.",
        chain(HOX_POX, E, "House of X / Powers of X, strictly interlaced.")
        + [
            run("X-Men", 2019, 1, 21, E),
            one("X of Swords: Creation", 2020, 1, E,
                "X of Swords, in brief. The full 27-chapter interleave is in Part 3 of the complete order."),
            one("X of Swords: Stasis", 2020, 1, E),
            one("X of Swords: Destruction", 2020, 1, E),
            run("S.W.O.R.D.", 2020, 1, 11, E),
            run("Way of X", 2021, 1, 5, E),
            one("Planet-Size X-Men", 2021, 1, E,
                "Hellfire Gala 2021, in brief. The full 11-chapter block is in Part 4 of the complete order."),
            run("Inferno", 2021, 1, 4, E, "Hickman's exit."),
            run("Immortal X-Men", 2022, 1, 4, E, "Stop at #4."),
            run("X-Men Red", 2022, 1, 4, E, "Stop at #4."),
        ]
        + chain(GALA_2022, E, "Hellfire Gala 2022 — the boundary. Judgment Day opens days later."),
    ),
    (
        "Judgment Day 審判日",
        "The one abbreviation you should not take: the Eternals run stays whole.",
        [
            run("Eternals", 2021, 1, 12, E,
                "《永恆族》 — not abbreviated. This is the prerequisite the event grows out of."),
            one("A.X.E.: Eve of Judgment", 2022, 1, E),
        ]
        + chain(JUDGMENT_DAY, E, "All 21 chapters, exactly as in Part 6 of the complete order."),
    ),
    (
        "Krakoa, to the End 終章",
        "Everything after the event, at the core's pace.",
        [
            run("Immortal X-Men", 2022, 8, 18, E, "Complete, from #8 on."),
            run("X-Men Red", 2022, 8, 18, E, "Complete, from #8 on."),
        ]
        + chain(SINS_OF_SINISTER, E, "Sins of Sinister, complete.")
        + [
            one("X-Men: Hellfire Gala", 2023, 1, E, "The turning point."),
        ]
        + chain(FINALE, E, "Fall / Rise, alternating.")
        + [
            run("X-Men: Forever", 2024, 1, 4, E, "The true final page of the era."),
        ],
    ),
]


# =========================================================================
# Seeding
# =========================================================================


def build(db, name, list_type, remark, plan, most_recommended=False):
    lookup = {
        (c.comic_name_en, c.release_year): c.system_id for c in db.query(Comic).all()
    }

    missing = []
    for _section, _remark, entries in plan:
        for nm, yr, *_ in entries:
            if (nm, yr) not in lookup:
                missing.append((nm, yr))
    if missing:
        print("  !! UNRESOLVED ENTRIES:")
        for m in sorted(set(missing)):
            print("     ", m)
        return None

    existing = (
        db.query(WatchOrderList)
        .filter(
            WatchOrderList.franchise_id == FRANCHISE_ID,
            WatchOrderList.list_name == name,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        db.flush()
        print("  (replaced existing list)")

    now = get_taipei_now()
    db_list = WatchOrderList(
        system_id=uuid.uuid4(),
        franchise_id=FRANCHISE_ID,
        list_name=name,
        list_type=list_type,
        is_most_recommended=most_recommended,
        remark=remark,
        created_at=now,
        updated_at=now,
    )
    db.add(db_list)
    db.flush()

    item_pos = 0
    total = 0
    for s_index, (section_name, section_remark, entries) in enumerate(plan, start=1):
        section = WatchOrderSection(
            system_id=uuid.uuid4(),
            list_id=db_list.system_id,
            position=float(s_index),
            section_name=section_name,
            remark=section_remark,
            created_at=now,
            updated_at=now,
        )
        db.add(section)
        db.flush()

        for nm, yr, start, end, imp, note in entries:
            item_pos += 1
            db.add(
                WatchOrderItem(
                    system_id=uuid.uuid4(),
                    list_id=db_list.system_id,
                    section_id=section.system_id,
                    position=float(item_pos),
                    media_type="comic",
                    entry_id=lookup[(nm, yr)],
                    ep_start=start,
                    ep_end=end,
                    importance=imp,
                    note=note,
                    created_at=now,
                    updated_at=now,
                )
            )
            total += 1

    print("  %s: %d sections, %d steps" % (name, len(plan), total))
    return db_list


def main():
    db = SessionLocal()
    try:
        print("Building reading orders on franchise Marvel Comics...")
        a = build(
            db,
            "Ultimate Krakoan × A.X.E. Reading Order",
            "Recommended",
            "One merged read order for The Krakoan Age and A.X.E.: Judgment Day, "
            "optimised for best experience. Prerequisites included · X-Men · Avengers "
            "· Eternals · 1975‒2024. ★ Essential · ◆ Recommended · ○ Optional.",
            FULL_ORDER,
            most_recommended=True,
        )
        b = build(
            db,
            "The Combined Core 精簡整合路線",
            "Recommended",
            "Both stories, every major beat intact, at roughly a third of the length "
            "— about 205 issues instead of 625. The A.X.E. tie-ins and everything "
            "marked Optional elsewhere are texture; the Eternals run is not.",
            COMBINED_CORE,
        )
        if a is None or b is None:
            db.rollback()
            print("ROLLED BACK — unresolved entries above.")
            return 1
        db.commit()
        print("Committed.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
