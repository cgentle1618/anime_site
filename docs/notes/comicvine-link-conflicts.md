# Comic Vine Link Conflicts

Moved verbatim from `comicvine-link-conflicts.md` on 2026-08-30 (file last changed 2026-08-27). Historical record; the numbers reflect the database at that date. Note: this record predates the media-sources migration — `source_other`, named below as where the original 1982 link was kept, was later dropped by migration `dc1o2l3s4d5`; that data now lives in a `media_source` `bucket='other'` row instead (see [data-model.md](../data-model.md#media_source)).

---


Every place where the Comic Vine volume linked on a `comic` row disagrees with
what the row — or its source document — says. All 99 comic entries currently in
the database come from `UltimateKrakoanAXEReadingOrder.pdf`; their
`comicvine_link` / `comicvine_id` were backfilled by matching name + release
year + publisher against the Comic Vine search API.

**Comic Vine is the authority.** Where the reading order and Comic Vine
disagree, the row is linked to the Comic Vine volume and the discrepancy is
recorded here. Each section states what the correct answer is and what was done
about it.

## Resolution summary

Every conflict below has been resolved and the database updated accordingly.

| # | Conflict | Verdict | DB change applied |
| --- | --- | --- | --- |
| 1 | *Before the Fall* one-shots: two PDF titles do not exist | Comic Vine correct | Renamed `Sinister Six` → `Sinister Four`, `The Four Horsemen of Apocalypse` → `Sons of X` |
| 2 | Nine entries one year behind Comic Vine | **DB correct** — not a conflict | None; `release_year` kept |
| 3a | Uncanny X-Men 1963/1981 split | DB correct | None |
| 3b | Uncanny X-Men vol. 5 — two rows, one CV volume | DB correct | None; duplicate `comicvine_id` is intentional |
| 3c | God Loves, Man Kills (1982) has no standalone CV volume | No correct volume exists | Kept the 2003 reprint link; original recorded in `source_other` |
| 4a | `Dark X-Men` issue count | Comic Vine correct | `issue_total` 4 → **5** |
| 4b | `Giant-Size X-Men` issue count | Comic Vine correct | `issue_total` 1 → **4** |
| 5 | Cosmetic title differences | DB correct in 9 of 10 | Renamed `Trial of Magneto` → `X-Men: The Trial of Magneto` |
| 6 | `Age of X-Man Alpha` linked to an unrelated volume | Pre-existing link wrong | `comicvine_id` 115444 → **116812** |
| 7 | Collected editions competing with serialized runs | Serialized run correct | None; collections were never linked |

---

## 1. Titles the reading order gets wrong

**Verdict: Comic Vine correct. DB rows renamed.**

Marvel published exactly four *X-Men: Before the Fall* one-shots in 2023, and a
`filter=name:Before the Fall` sweep of Comic Vine returns exactly those four and
nothing else:

| Comic Vine | ID | Creators |
| --- | --- | --- |
| X-Men: Before the Fall - Sons of X | 150028 | Si Spurrier / Phil Noto — Legion and Nightcrawler |
| X-Men: Before the Fall – Mutant First Strike | 151052 | Steve Orlando / Valentina Pinti — Bishop's rescue team |
| X-Men: Before The Fall - Heralds of Apocalypse | 151708 | Al Ewing — Apocalypse and the First Horsemen |
| X-Men: Before the Fall - Sinister Four | 151912 | Kieron Gillen — the *Sins of Sinister* follow-up |

The PDF (Part 9, "Entry Point") lists *Sinister Six*, *Heralds of Apocalypse*,
*Mutant First Strike*, and *The Four Horsemen of Apocalypse*. Two of those four
names do not exist.

| DB entry (from PDF) | Renamed to | Linked ID | Confidence |
| --- | --- | --- | --- |
| X-Men: Before the Fall - Sinister Six | X-Men: Before the Fall - Sinister Four | 151912 | Certain — same one-shot, wrong numeral |
| X-Men: Before the Fall - The Four Horsemen of Apocalypse | X-Men: Before the Fall - Sons of X | 150028 | By elimination — see below |

The second mapping needs a note. *Heralds of Apocalypse* is the one-shot that
actually features Apocalypse and his Horsemen, and the PDF already lists it
separately — so "The Four Horsemen of Apocalypse" is not a second Apocalypse
book. With the other three PDF names accounted for, *Sons of X* is the only
remaining one-shot, and it is the only assignment producing a complete,
non-duplicated set of four. The PDF author appears to have invented a
descriptive title for it.

**Applied:** both `comic_name_en` values updated to the Comic Vine titles.

## 2. Release-year drift — NOT a conflict

**Verdict: the DB is correct. Nothing changed.**

Nine rows looked like year mismatches. They are not: **the DB stores the on-sale
year and Comic Vine's `start_year` is the cover-date year of issue #1.** Marvel
cover-dates roughly two months ahead, so a November release carries a January
cover date and rolls into the next year. Comic Vine's own `store_date` field on
issue #1 agrees with the DB in all nine cases.

| DB entry | DB year | CV `start_year` | CV issue #1 `store_date` |
| --- | --- | --- | --- |
| X of Swords: Destruction | 2020 | 2021 | 2020-11-25 |
| IvX | 2016 | 2017 | 2016-11-30 |
| S.W.O.R.D. | 2020 | 2021 | 2020-12-09 |
| X-Factor (vol. 3) | 2005 | 2006 | 2005-12-14 |
| New Mutants | 2019 | 2020 | 2019-11-06 |
| Fallen Angels | 2019 | 2020 | 2019-11-13 |
| Uncanny X-Men (vol. 5) | 2018 | 2019 | 2018-11-14 |
| Invincible Iron Man | 2022 | 2023 | 2022-12-14 |
| Sabretooth & the Exiles | 2022 | 2023 | 2022-11-09 |

**Open risk.** `map_comicvine_to_comic_data` maps `start_year` straight into
`release_year` and `volume_label`, so running Fill on these nine rows *will*
shift them a year forward and undo the correct values. If the on-sale convention
is the one to keep, Fill should read `store_date` of issue #1 rather than the
volume's `start_year`. Not changed here — it is a pipeline fix, not a data fix.

## 3. Volume boundaries Comic Vine draws differently

### 3a. Uncanny X-Men, original run

**Verdict: the DB is correct. Nothing changed.**

Comic Vine splits the 1963 ongoing at the title change: `The X-Men` (1963,
#1-141, ID 2133) and `The Uncanny X-Men` (1981, #142-544, ID 3092). The two DB
rows map one-to-one onto the two volumes. The only wrinkle is that the PDF's
"Uncanny X-Men (1963) #141-142 — Days of Future Past" straddles the split:
#141 is in volume 2133, #142 is in volume 3092.

### 3b. Uncanny X-Men vol. 5 — the duplicate link is correct

**Verdict: the DB is correct. Nothing changed.**

The PDF splits this into "Uncanny X-Men (2018) #1-10" (*Disassembled*) and
"Uncanny X-Men (2019) #11-22" (*This Is Forever*). These are two story arcs of
one 22-issue series, and Comic Vine has a single volume for it (`Uncanny X-Men`,
2019, ID 115285, issue #1 cover-dated 2019-01, on sale 2018-11-14).

**Both DB rows therefore carry the same `comicvine_id`.** This is the only
duplicated ID in the table and it is intentional, not a data error. Merging the
two rows into one 22-issue entry would lose the reading-order distinction
between the arcs, so the split rows stay.

### 3c. X-Men: God Loves, Man Kills (1982)

**Verdict: no correct volume exists. Kept the 2003 reprint; original recorded in
`source_other`.**

The 1982 original is **Marvel Graphic Novel #5**, cover-dated December 1982
(Comic Vine issue `4000-21795`). Comic Vine files it as an *issue* inside the
`Marvel Graphic Novel` anthology volume (1982, 38 issues, ID 3144) — a volume
that also holds *The Death of Captain Marvel*, *Dazzler: The Movie* and 35 other
unrelated books. Linking it would make Fill rewrite the row as "Marvel Graphic
Novel" with 38 issues.

Every standalone Comic Vine volume under this title is a reprint:

| ID | Volume | Year | What it is |
| --- | --- | --- | --- |
| 3144 #5 | Marvel Graphic Novel | 1982 | **the original**, but an issue inside a 38-issue anthology |
| 32138 | X-Men: God Loves, Man Kills | 2003 | standard-size comic reprint, tied to the *X2* film |
| 30069 | X-Men: God Loves, Man Kills | 2007 | hardcover reprint |
| 128448 | ...Extended Cut | 2020 | 2-issue reprint with new material |

**Applied:** the row keeps `comicvine_id` 32138 — the only volume with the right
title, the right content and the right granularity (one row, one issue, the
complete story). Its year is 2003, not 1982; unavoidable at volume level. The
true source is now in `source_other`:

```json
{"Marvel Graphic Novel #5 (1982 original)": "https://comicvine.gamespot.com/marvel-graphic-novel-5-x-men-god-loves-man-kills/4000-21795/"}
```

## 4. Issue-count differences

### 4a. Dark X-Men (2023)

**Verdict: the DB was wrong. `issue_total` corrected 4 → 5.**

Comic Vine lists five issues, #1 (cover 2023-10) through #5 (cover 2024-02,
"The Mercy Seat"). *Dark X-Men* was a five-issue limited series. The PDF says
"#1-4" and the DB had copied that.

### 4b. Giant-Size X-Men (1975)

**Verdict: Comic Vine correct for this column. `issue_total` corrected 1 → 4.**

Comic Vine's volume 2763 holds four issues, and they are not one continuous run:
#1 (1975-05, "Deadly Genesis!"), #2 (1975-12, reprints), then #3 (2005-04,
"Teamwork") and #4 (2005-09, "Finding Home!") — the two Claremont one-shots
Marvel published under the revived title thirty years later.

The reading order only calls for #1, but `issue_total` is documented as the size
of the run, not the size of the assignment; the "only #1 is read" fact belongs in
`issue_fin`. Setting it to 4 also makes the row stable under Fill, which would
have overwritten a 1 anyway.

## 5. Cosmetic title differences

**Verdict: the DB is correct in nine of ten. One rename applied.**

Same run, different rendering. Where Marvel's own solicitation differs from
Comic Vine, that is noted — most of these are Comic Vine's inconsistencies
rather than the DB's.

| DB entry | Comic Vine name | Correct | Action |
| --- | --- | --- | --- |
| Amazing Spider-Man | The Amazing Spider-Man | Both; Marvel's masthead carries "The" | none |
| Invincible Iron Man | The Invincible Iron Man | Both; Marvel's masthead carries "The" | none |
| X-Men Red | X-Men: Red | **DB** — the 2022 series has no colon | none |
| X-Men: Forever | X-Men Forever | **DB** — the 2024 Gillen series has a colon | none |
| X-Men: Endangered Species | X-Men Endangered Species | **DB** — CV drops the colon | none |
| Trial of Magneto | X-Men: The Trial of Magneto | **Comic Vine** — the DB name was truncated | **renamed** |
| Sabretooth & the Exiles | Sabretooth and the Exiles | **DB** — solicited with an ampersand | none |
| Storm & the Brotherhood of Mutants | Storm & The Brotherhood of Mutants | DB (capitalisation only) | none |
| X-Men: Before the Fall - Mutant First Strike | ...– Mutant First Strike | CV uses an en dash; Marvel Database has "Mutants' First Strike" | none |
| X-Men: Before the Fall - Heralds of Apocalypse | ...Before The Fall - Heralds of Apocalypse (trailing space) | CV has a stray capital and a trailing space | none |

Note that Fill will overwrite the nine untouched names with Comic Vine's
rendering the next time it runs on those rows.

## 6. Corrected pre-existing link

**Verdict: the existing link was wrong. `comicvine_id` corrected 115444 →
116812.**

`Age of X-Man Alpha` (2019) was already linked to Comic Vine ID **115444** before
this backfill. That volume is `Victor Victrola` (2018, Oeuvre Comix) — an
unrelated indie digital series sitting at the ID the URL slug implied. Now
**116812** (`Age of X-Man Alpha`, 2019, Marvel, 1 issue).

Worth checking how that link was originally entered, in case the same
slug-then-guess-the-ID path can produce more of these.

## 7. Collected editions rejected

**Verdict: the serialized run is correct in every case. No change needed — the
collections were never linked.**

Several titles have a serialized volume and a near-identical trade-paperback
volume on Comic Vine, both matching on name, year and publisher. The serialized
run or one-shot the reading order actually cites was chosen; the collection was
discarded. Verified against each volume's Comic Vine description.

| DB entry | Linked (serialized) | Rejected (collection) | Evidence |
| --- | --- | --- | --- |
| X-Men: Second Coming (2010) | 32271 | 35716 | 35716: "Hardcover collecting Second Coming: Prepare, Second Coming, Uncanny X-Men #523-525…" |
| X-Force/Cable: Messiah War (2009) | 26055 | 28936 | 26055 is "One shot"; 28936 is "A hardcover and trade paperback collecting the Messiah War story arc" |
| Sins of Sinister (2023) | 147646 | 153615 | 147646 is "One Shot"; 153615 is the collection |
| Knights of X (2022) | 142576 | 147325 | 142576 has 5 issues; 147325 has 1 |
| Dead X-Men (2024) | 156494 | 160115 | 156494 has 4 issues; 160115 has 1 |
| Resurrection of Magneto (2024) | 156369 | 159269 | 156369 has 4 issues; 159269 has 1 |
| A.X.E.: Judgment Day (2022) | 144123 | 148828 | 144123 has 6 issues; 148828 has 1 |

---

## Sources

- Comic Vine API — volume, issue and `store_date` data
  (<https://comicvine.gamespot.com/api/>)
- [The FALL OF X begins this Summer in four new X-MEN: BEFORE THE FALL one-shots — The Beat](https://www.comicsbeat.com/x-men-before-the-fall-of-x-one-shots-marvel/)
- [Four 'Before the Fall' one-shots precede the next X-Men event — Smash Pages](https://smashpages.net/2023/01/30/four-before-the-fall-one-shots-precede-the-next-x-men-event/)
- [X-Men: Before The Fall - Heralds of Apocalypse Vol 1 — Marvel Database](https://marvel.fandom.com/wiki/X-Men:_Before_The_Fall_-_Heralds_of_Apocalypse_Vol_1)
- [X-Men: Before The Fall - Mutants' First Strike Vol 1 — Marvel Database](https://marvel.fandom.com/wiki/X-Men:_Before_The_Fall_-_Mutants%27_First_Strike_Vol_1)
- [Before the Fall of X — Marvel reading guide](https://www.marvel.com/comics/guides/2396/before_the_fall_of_x)
