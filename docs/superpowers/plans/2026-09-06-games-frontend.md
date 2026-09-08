# Games Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `game` its full frontend surface — library, detail, tracker, add/modify/delete, plan, statistics, search and nav — and widen the watch-vs-read axis to a third `statusType: "play"`.

**Architecture:** Most of the work is registry keys: `MEDIA_CONFIG`, `LIBRARY_CONFIGS`, `ADMIN_TABS`, `FORM_FACTORIES` and friends are config-driven, so a key buys a route. The genuine work is eleven places that today branch `read ? … : watch` and must become three-way, plus the hand-written per-type pages and two new controlled editors.

**Tech Stack:** React 18, Vite, Tailwind CSS v4 (semantic tokens only), TanStack Query, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-06-games-media-type-design.md`

**Depends on:** `2026-09-06-games-backend.md` — `/api/game` must exist and serve `playing_status`, `copies` and the derived `ownership`.

## Global Constraints

- **Never `git add -A`, never stage a directory pathspec.** Stage the exact files each Commit step names.
- **Semantic colour tokens only.** `src/theme-tokens.test.js` scans `src/` and fails the build on any `(bg|text|border|divide|ring|placeholder)-(gray|slate|zinc|neutral)-N` outside its allowlist. Use `bg-surface`, `text-text-muted`, `border-border`, etc.
- **`scopeColors.js` is the one deliberate exception to "every type is the same chip":** it assigns a hue per type, and Tailwind scans source text, so `bg-scope-${key}` never generates — the class string must be spelled out literally, and `--color-scope-game` added to `index.css` plus its three theme blocks.
- **Run `cd frontend && npm run build` after the last task**, and any time you want to check a change on `:8000`. Vite's `:5173` picks up edits live; `:8000` serves the prebuilt `frontend_dist/`.
- **`vitest` failures are real signal** — unlike the backend suite, nothing here is shared between concurrent agents.
- **Status value strings are exact:** `"Might Play"`, `"Plan to Play"`, `"Play When Released"`, `"Active Playing"`, `"Passive Playing"`, `"Paused"`, `"Completed"`, `"Temp Dropped"`, `"Dropped"`, `"Won't Play"`. Plan flags are `play_next` and `to_replay`.
- Lint with `cd frontend && npm run lint` before each commit.

---

### Task 1: The play status vocabulary

**Files:**
- Modify: `frontend/src/config/fieldOptions.js`, `frontend/src/config/statusGroups.js`, `frontend/src/lib/status.js`, `frontend/src/lib/enumGroups.js`
- Test: `frontend/src/config/statusGroups.test.js`, `frontend/src/lib/status.test.js` (create if absent)

**Interfaces:**
- Produces: `PLAYING_STATUSES` (array), `PLAYING_STATUS_GROUP` (map), `PLAYING_BUTTON_CONFIG`, `getPlayingButtonConfig(status)`, and a three-way `getCardStatusConfig(type, status)`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/config/statusGroups.test.js`:

```js
import { PLAYING_STATUSES } from "./fieldOptions";
import { PLAYING_STATUS_GROUP, groupStatusOptions } from "./statusGroups";

describe("the playing vocabulary", () => {
  it("splits into the three picker groups", () => {
    expect(groupStatusOptions(PLAYING_STATUSES)).toEqual([
      {
        label: "Not Released",
        statuses: ["Might Play", "Plan to Play", "Play When Released"],
      },
      {
        label: "On-Going",
        statuses: ["Active Playing", "Passive Playing", "Paused", "Temp Dropped"],
      },
      { label: "Done", statuses: ["Completed", "Dropped", "Won't Play"] },
    ]);
  });

  it("maps every playing status to a library display group", () => {
    for (const status of PLAYING_STATUSES) {
      expect(PLAYING_STATUS_GROUP[status]).toBeDefined();
    }
    expect(PLAYING_STATUS_GROUP["Active Playing"]).toBe("Playing");
    expect(PLAYING_STATUS_GROUP["Might Play"]).toBe("Might Play");
  });
});
```

Create `frontend/src/lib/status.test.js`:

```js
import { describe, expect, it } from "vitest";
import { getCardStatusConfig, getPlayingButtonConfig } from "./status";

describe("getCardStatusConfig", () => {
  it("is three-way, not read-or-watch", () => {
    expect(getCardStatusConfig("game", "Active Playing")).toEqual(
      getPlayingButtonConfig("Active Playing"),
    );
    expect(getCardStatusConfig("manga", "Active Reading").label).not.toBe(
      getPlayingButtonConfig("Active Playing").label,
    );
    expect(getCardStatusConfig("anime", "Active Watching").label).not.toBe(
      getPlayingButtonConfig("Active Playing").label,
    );
  });

  it("falls back to Might Play for an unknown playing status", () => {
    expect(getPlayingButtonConfig("nonsense")).toEqual(
      getPlayingButtonConfig("Might Play"),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/config/statusGroups.test.js src/lib/status.test.js`
Expected: FAIL — `PLAYING_STATUSES` is not exported

- [ ] **Step 3: Implement**

`fieldOptions.js`, beside `WATCHING_STATUSES` / `READING_STATUSES`:

```js
export const PLAYING_STATUSES = [
  "Might Play",
  "Plan to Play",
  "Play When Released",
  "Active Playing",
  "Passive Playing",
  "Paused",
  "Completed",
  "Temp Dropped",
  "Dropped",
  "Won't Play",
];
```

and `playing_status: PLAYING_STATUSES` in `CONSTANTS_FALLBACK`. Add `"game"` to `MEDIA_TYPES` and the four `Game *` categories to `OPTION_CATEGORIES`.

`statusGroups.js` — a third display-group map, and the play values appended to the flat picker map (`groupStatusOptions` needs no change, because `STATUS_PICKER_GROUP` is deliberately one map over every vocabulary):

```js
/**
 * Maps raw playing_status values to display groups used by library filters.
 */
export const PLAYING_STATUS_GROUP = {
  "Plan to Play": "Planned",
  "Play When Released": "Planned",
  "Active Playing": "Playing",
  "Passive Playing": "Playing",
  Paused: "Playing",
  Completed: "Completed",
  "Temp Dropped": "Dropped",
  Dropped: "Dropped",
  "Won't Play": "Dropped",
  "Might Play": "Might Play",
};
```

and into `STATUS_PICKER_GROUP`: `"Might Play"`, `"Plan to Play"`, `"Play When Released"` → `"Not Released"`; `"Active Playing"`, `"Passive Playing"` → `"On-Going"`; `"Won't Play"` → `"Done"`. (`Paused`, `Temp Dropped`, `Completed` and `Dropped` are already mapped and shared across vocabularies.)

`lib/status.js` — add `PLAYING_BUTTON_CONFIG` mirroring `READING_BUTTON_CONFIG`, `getPlayingButtonConfig(status)` falling back to `"Might Play"`, and make the dispatcher three-way with an explicit set rather than a chain of `||`:

```js
const READ_TYPES = new Set(["manga", "novel", "comic"]);
const PLAY_TYPES = new Set(["game"]);

export function getCardStatusConfig(type, status) {
  if (PLAY_TYPES.has(type)) return getPlayingButtonConfig(status);
  if (READ_TYPES.has(type)) return getReadingButtonConfig(status);
  return getStatusButtonConfig(status);
}
```

`lib/enumGroups.js` — add `"playing_status"` to the `"My Progress"` group keys.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/config/statusGroups.test.js src/lib/status.test.js src/lib/enumGroups.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/config/fieldOptions.js frontend/src/config/statusGroups.js frontend/src/config/statusGroups.test.js frontend/src/lib/status.js frontend/src/lib/status.test.js frontend/src/lib/enumGroups.js && git commit -m "feat(game): the playing status vocabulary"
```

---

### Task 2: Registry keys

**Files:**
- Modify: `frontend/src/config/mediaRegistry.js`, `namingConfigs.js`, `mediaTypeColors.js`, `scopeColors.js`, `frontend/src/index.css`, `frontend/src/config/planNextGroups.js`, `frontend/src/config/navigation.js`
- Test: `frontend/src/utils/planNext.test.js`, `frontend/src/config/navigation.test.js`, `frontend/src/api/endpoints.test.js`

- [ ] **Step 1: Write the failing test**

Update the three count-guarding blocks in `frontend/src/utils/planNext.test.js` — `expect(types).toHaveLength(8)` becomes `9`, `REWATCH_TABS` gains `"game"`, and the `it.each` table gains:

```js
    ["next", "game", ["entry", "series", "franchise"]],
    ["rewatch", "game", ["entry", "series", "franchise"]],
```

Add to `frontend/src/api/endpoints.test.js`:

```js
  it("derives the game resource from MEDIA_CONFIG", () => {
    expect(endpoints.resource("game").list()).toBe("/api/game/");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/planNext.test.js src/api/endpoints.test.js`
Expected: FAIL — length 8 ≠ 9; `Unknown resource type: game`

- [ ] **Step 3: Implement**

`mediaRegistry.js`:

```js
  game:          { statusField: "playing_status",  apiEndpoint: "/api/game",        navPath: "/game",         statusType: "play"  },
```

`namingConfigs.js`: `game: ["game_name_cn", "game_name_en", "game_name_roman", "game_name_jp", "game_name_alt"]`.

`mediaTypeColors.js`: add `"game"` to the array and update the "eight types" comment.

`scopeColors.js`: a literal entry — the class string cannot be interpolated, because Tailwind scans source text:

```js
  game: `${CHIP} bg-scope-game/12 border-scope-game/40 text-scope-game`,
```

`index.css`: `--color-scope-game: var(--c-scope-game);` in the `@theme` block, and a `--c-scope-game` value in each of the three theme blocks.

`planNextGroups.js`: `"game"` in `ALLOWED_SCOPES.next` and `.rewatch` (all three scopes), a `PLAN_TABS` entry, a `REWATCH_TABS` entry, and **no** `SIZE_GROUPS` entry — games have no size buckets. This file is a hand-maintained mirror of `app/utils/plan_next_kinds.py`; keep the two in step.

`navigation.js`: a Game item in the appropriate library column, `to: "/library/game"`, `matches: ["/game"]`.

`endpoints.js` needs no edit — `resource(type)` is derived from `MEDIA_CONFIG`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/utils/planNext.test.js src/api/endpoints.test.js src/config/navigation.test.js src/theme-tokens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/config/mediaRegistry.js frontend/src/config/namingConfigs.js frontend/src/config/mediaTypeColors.js frontend/src/config/scopeColors.js frontend/src/index.css frontend/src/config/planNextGroups.js frontend/src/config/navigation.js frontend/src/utils/planNext.test.js frontend/src/api/endpoints.test.js frontend/src/config/navigation.test.js && git commit -m "feat(game): frontend registry keys"
```

---

### Task 3: The eleven three-way branches

**Files:**
- Modify: `frontend/src/components/cards/MediaCard.jsx`, `frontend/src/components/layout/libraryColumns.jsx`, `frontend/src/components/layout/LibraryLayout.jsx`, `frontend/src/components/info/SourcesCard.jsx`, `frontend/src/components/plan/PlanKindToggles.jsx`, `frontend/src/components/tracker/DashboardCard.jsx`
- Test: `frontend/src/components/plan/PlanKindToggles.test.jsx`, `frontend/src/components/layout/libraryColumns.test.jsx`, `frontend/src/components/info/SourcesCard.test.jsx` (create if absent)

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/info/SourcesCard.test.jsx  (add if the file exists)
import { describe, expect, it } from "vitest";
import { accessHeading } from "./SourcesCard";

describe("accessHeading", () => {
  it("is three-way", () => {
    expect(accessHeading("anime")).toBe("Where to Watch");
    expect(accessHeading("manga")).toBe("Where to Read");
    expect(accessHeading("game")).toBe("Where to Play");
  });
});
```

Add to `frontend/src/components/plan/PlanKindToggles.test.jsx`:

```jsx
  it("says To Replay for an all-game group", () => {
    expect(kindLabel("rewatch", ["game"])).toBe("To Replay");
  });

  it("falls back to To Rewatch for a mixed group", () => {
    expect(kindLabel("rewatch", ["game", "anime"])).toBe("To Rewatch");
  });
```

Add to `frontend/src/components/layout/libraryColumns.test.jsx`:

```jsx
  it("builds a play button column", () => {
    const col = playButtonColumn();
    expect(col.statusField).toBe("playing_status");
    expect(col.fallback).toBe("Might Play");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/info/SourcesCard.test.jsx src/components/plan/PlanKindToggles.test.jsx src/components/layout/libraryColumns.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement**

`MediaCard.jsx` — the status fallback and button config are the two binary ternaries; replace both with the shared dispatcher rather than a nested ternary:

```jsx
  const FALLBACK_STATUS = { watch: "Might Watch", read: "Might Read", play: "Might Play" };
  const currentStatus = data[statusField] || FALLBACK_STATUS[statusType];
  const btnConfig = getCardStatusConfig(type, currentStatus);
```

Also add `game: "Game"` to `SPINE_LABEL`, add `"game"` to `HAS_PROGRESS` only if the card should show a playtime line (it should — see the tracker in Task 5), and leave `BOLT_PROMPTS_WATCHING` and `ADMIN_ONLY_STATUS` alone.

`libraryColumns.jsx`:

```jsx
export function playButtonColumn() {
  return statusToggleColumn({
    key: "play",
    header: "Play",
    statusField: "playing_status",
    buttonConfig: getPlayingButtonConfig,
    fallback: "Might Play",
    hidden: "xl",
  });
}
```

`LibraryLayout.jsx` — extend the toast copy branch to cover the play flags:

```js
        if (field === "watch_next" || field === "read_next" || field === "play_next") {
          showToast("success", nextStatus ? "Added to Next" : "Removed from Next");
        } else if (
          field === "to_rewatch" || field === "to_reread" || field === "to_replay"
        ) {
          showToast("success", nextStatus ? "Marked to revisit" : "Removed from revisit");
        }
```

`SourcesCard.jsx` — export `accessHeading` (it is currently module-private) and make it three-way:

```js
const READING_TYPES = new Set(["manga", "novel", "comic"]);
const PLAYING_TYPES = new Set(["game"]);

export function accessHeading(mediaType) {
  if (PLAYING_TYPES.has(mediaType)) return "Where to Play";
  if (READING_TYPES.has(mediaType)) return "Where to Read";
  return "Where to Watch";
}
```

`PlanKindToggles.jsx` — `LABELS` gains `game: "Game"`, and `kindLabel` gains a play arm. Keep "To Rewatch" as the mixed-group fallback, exactly as the read case already does.

`DashboardCard.jsx` — `isReading` gates the progress unit and the status fallback; add the play case or, if the game dashboard card is separate (Task 5), leave this file alone and note why in the commit message.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components src/lib`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cards/MediaCard.jsx frontend/src/components/layout/libraryColumns.jsx frontend/src/components/layout/libraryColumns.test.jsx frontend/src/components/layout/LibraryLayout.jsx frontend/src/components/info/SourcesCard.jsx frontend/src/components/info/SourcesCard.test.jsx frontend/src/components/plan/PlanKindToggles.jsx frontend/src/components/plan/PlanKindToggles.test.jsx frontend/src/components/tracker/DashboardCard.jsx && git commit -m "feat(game): widen the watch/read axis to a third play case"
```

---

### Task 4: The library page

**Files:**
- Create: `frontend/src/pages/library/configs/game.jsx`
- Modify: `frontend/src/pages/library/configs/index.js`
- Test: `frontend/src/pages/library/configs/game.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/pages/library/configs/game.test.js
import { describe, expect, it } from "vitest";
import GAME_LIBRARY_CONFIG from "./game";

const GAMES = [
  {
    system_id: "1",
    game_name_cn: "艾爾登法環",
    game_name_en: "Elden Ring",
    game_type: "Base Game",
    playing_status: "Active Playing",
    ownership: "Owned",
    hours_played: 32.5,
  },
  {
    system_id: "2",
    game_name_en: "Shadow of the Erdtree",
    game_type: "DLC",
    playing_status: "Might Play",
    ownership: "Wishlist",
  },
];

describe("game library config", () => {
  it("filters by play-status display group", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find(
      (f) => f.key === "playingStatus",
    );
    expect(filter.match(GAMES[0], new Set(["Playing"]))).toBe(true);
    expect(filter.match(GAMES[1], new Set(["Playing"]))).toBe(false);
  });

  it("filters by ownership", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find((f) => f.key === "ownership");
    expect(filter.match(GAMES[0], new Set(["Owned"]))).toBe(true);
  });

  it("filters by game type so DLC can be separated from base games", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find((f) => f.key === "gameType");
    expect(filter.match(GAMES[1], new Set(["DLC"]))).toBe(true);
  });

  it("sorts by playtime, longest first", () => {
    const sort = GAME_LIBRARY_CONFIG.sortDefs.find((s) => s.key === "hours_played");
    expect([...GAMES].sort(sort.compare)[0].system_id).toBe("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/library/configs/game.test.js`
Expected: FAIL — cannot resolve `./game`

- [ ] **Step 3: Implement**

Create `frontend/src/pages/library/configs/game.jsx` modelled on `comic.jsx`: CN-leading `getTitle`, a `buildSearchString` over the five names plus franchise/series names, `filterDefs` for `gameType` (`set-dynamic`), `playingStatus` (`set-grouped` over `["Playing", "Planned", "Completed", "Dropped", "Might Play"]` using `PLAYING_STATUS_GROUP`), `ownership` (`set-dynamic`) and `releaseStatus` (`set-dynamic`); `sortDefs` for title, `release_date`, `hours_played` and `myRatingSort`; `tableColumns` using `franchiseColumn()`, title CN/EN, type, playtime (`32.5 h`), `myRatingColumn()`, `playButtonColumn()` and `planFlagColumn("to_replay", "To Replay")`.

Register `game` in `configs/index.js`. That plus the `MEDIA_CONFIG` key from Task 2 gives `/library/game` with no routing work — `Library.jsx` resolves `LIBRARY_CONFIGS[type]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/library/configs/game.test.js src/theme-tokens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/library/configs/game.jsx frontend/src/pages/library/configs/index.js frontend/src/pages/library/configs/game.test.js && git commit -m "feat(game): library page config"
```

---

### Task 5: The detail page and tracker

**Files:**
- Create: `frontend/src/pages/detail/Game.jsx`, `frontend/src/pages/detail/GameNotes.jsx`, `frontend/src/components/tracker/GameDashboardCard.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/pages/detail/Game.test.jsx` (create), `frontend/src/nav-offset.test.js`

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/detail/Game.test.jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameProgress } from "./Game";

describe("GameProgress", () => {
  it("shows playtime against the main-story estimate", () => {
    render(<GameProgress game={{ hours_played: 32.5, hltb_main: 45 }} />);
    expect(screen.getByText(/32\.5 h/)).toBeInTheDocument();
    expect(screen.getByText(/45 h/)).toBeInTheDocument();
  });

  it("shows achievements only when a total is known", () => {
    const { rerender } = render(
      <GameProgress game={{ achievements_earned: 12, achievements_total: 40 }} />,
    );
    expect(screen.getByText(/12 \/ 40/)).toBeInTheDocument();

    rerender(<GameProgress game={{ achievements_earned: 12 }} />);
    expect(screen.queryByText(/12 \/ 40/)).not.toBeInTheDocument();
  });

  it("renders nothing rather than a zero when there is no playtime", () => {
    const { container } = render(<GameProgress game={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

Add `components/tracker/GameDashboardCard.jsx` to the `it.each` list in `frontend/src/nav-offset.test.js`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/detail/Game.test.jsx`
Expected: FAIL — cannot resolve `./Game`

- [ ] **Step 3: Implement**

`GameNotes.jsx` is the thirteen-line wrapper every type has, with `ownerType="game"`.

`Game.jsx` follows `Comic.jsx`: `useMediaItem("game", system_id)`, franchise/series lookups, `performPatch`, `MediaLoadingState`, then the two-column layout with `SourcesCard`, `NamingCard`, two `InfoCard`s, the remarks `Slip` and `GameNotes`. Export `GameProgress` as a named export so it is testable in isolation.

The tracker reuses `MyTrackerCard`, whose prop names are watch-flavoured and are relabelled rather than renamed — the same adaptation `Comic.jsx` makes:

```jsx
          <MyTrackerCard
            watchingStatus={game.playing_status || "Might Play"}
            statusOptions={PLAYING_STATUSES}
            statusLabel="Playing Status"
            myRating={game.my_rating}
            ratingOptions={MY_RATINGS}
            isAdmin={isAdmin}
            onStatusChange={(v) => performPatch({ playing_status: v }, "Status updated")}
            onRatingChange={(v) => performPatch({ my_rating: v || null }, "Rating saved")}
            toRewatch={game.to_replay}
            rewatchLabel="To Replay"
            onToRewatchChange={(v) =>
              performPatch({ to_replay: v }, v ? "Marked to replay" : "Removed from replay")
            }
          />
```

Games have no `ep_fin`-style stepper, so `epFin`/`epTotal` are omitted and playtime renders through `GameProgress` instead. The `InfoCard` rows include game type, base game (a link when `base_game_id` is set), release status, current patch, completion level, all endings, prices, and the derived ownership.

`GameDashboardCard.jsx` mirrors `ComicDashboardCard.jsx` — a single progress mode, no tracker toggle, `cursor-pointer relative isolate` on the root (asserted by `nav-offset.test.js`).

`App.jsx`: the `Game` import and `<Route path="/game/:system_id" element={<Game />} />` beside the other detail routes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/detail/Game.test.jsx src/nav-offset.test.js src/theme-tokens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/detail/Game.jsx frontend/src/pages/detail/GameNotes.jsx frontend/src/pages/detail/Game.test.jsx frontend/src/components/tracker/GameDashboardCard.jsx frontend/src/App.jsx frontend/src/nav-offset.test.js && git commit -m "feat(game): detail page and tracker"
```

---

### Task 6: The two new editors

**Files:**
- Create: `frontend/src/components/forms/GameCopiesEditor.jsx`, `frontend/src/pages/notes/sections/NameEntriesSection.jsx`
- Modify: `frontend/src/pages/notes/NotesTemplate.jsx`
- Test: `frontend/src/components/forms/GameCopiesEditor.test.jsx` (create)

**Interfaces:**
- Produces: `GameCopiesEditor({ items, onChange })` — fully controlled, parent owns `value`, every mutation calls `onChange(newArray)` with `position` renumbered `1..n`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/components/forms/GameCopiesEditor.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GameCopiesEditor from "./GameCopiesEditor";

const ROWS = [
  { storefront: "Steam", ownership: "Owned", copy_format: "Digital", position: 1 },
  { storefront: "GOG", ownership: "Wishlist", copy_format: "Digital", position: 2 },
];

describe("GameCopiesEditor", () => {
  it("is controlled: adding a row calls onChange and mutates nothing", async () => {
    const onChange = vi.fn();
    const items = [...ROWS];
    render(<GameCopiesEditor items={items} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add copy/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(3);
    expect(items).toEqual(ROWS);
  });

  it("renumbers position after a removal", async () => {
    const onChange = vi.fn();
    render(<GameCopiesEditor items={ROWS} onChange={onChange} />);
    await userEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);
    expect(onChange.mock.calls[0][0].map((r) => r.position)).toEqual([1]);
  });

  it("edits a field in place", async () => {
    const onChange = vi.fn();
    render(<GameCopiesEditor items={ROWS} onChange={onChange} />);
    await userEvent.selectOptions(
      screen.getAllByLabelText(/ownership/i)[1],
      "Owned",
    );
    expect(onChange.mock.calls[0][0][1].ownership).toBe("Owned");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/forms/GameCopiesEditor.test.jsx`
Expected: FAIL — cannot resolve `./GameCopiesEditor`

- [ ] **Step 3: Implement**

`GameCopiesEditor.jsx` follows `NovelUnitsEditor.jsx` exactly: no internal state, `addEntry` / `removeEntry` / `updateEntry` / `move` all calling `onChange` with `position` renumbered, row `key={entry.system_id || i}`, up/down chevrons, and a remove button. Columns: storefront (select over `GAME_STOREFRONTS`), ownership (select), format (select), acquisition (select), price + currency, acquired date (`ReleaseDateInput`), remark. Every select needs an `aria-label` so the test can address it.

`NameEntriesSection.jsx` renders the `name_entries` note shape: a title input plus an ordered list of items, each a text box or a labelled URL, with a per-item type toggle and add/remove/reorder. Model it on `NameLinksSection.jsx`, reusing `SectionCard`, `ItemActions`, `LinkPill`, `SaveCancel`, `draftCls`, `inputCls` from `sections/ui.jsx`. An item with neither a name nor a single entry is invalid.

`NotesTemplate.jsx`: add `name_entries: NameEntriesSection` to the `SHAPES` map. Nothing else in the notes layer needs a game change — the section registry is backend-owned and fetched per owner type.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/forms/GameCopiesEditor.test.jsx src/pages/notes src/theme-tokens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/forms/GameCopiesEditor.jsx frontend/src/components/forms/GameCopiesEditor.test.jsx frontend/src/pages/notes/sections/NameEntriesSection.jsx frontend/src/pages/notes/NotesTemplate.jsx && git commit -m "feat(game): copies editor and the name_entries note section"
```

---

### Task 7: Admin Add and Modify

**Files:**
- Create: `frontend/src/pages/add-tabs/GameAddTab.jsx`, `frontend/src/pages/modify-tabs/GameModifyTab.jsx`
- Modify: `frontend/src/config/adminTabs.js`, `frontend/src/config/formFactories.js`, `frontend/src/config/formFields/fieldMeta.js`, `frontend/src/lib/payloads.js`, `frontend/src/pages/admin/Add.jsx`, `frontend/src/pages/admin/Modify.jsx`
- Test: `frontend/src/config/adminTabs.test.js`, `frontend/src/config/formFactories.test.js` (create if absent)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/config/adminTabs.test.js`:

```js
  it("puts game in the entries group", () => {
    expect(groupOf(ADMIN_TABS, "game")).toBe("entries");
  });
```

Create or extend `frontend/src/config/formFactories.test.js`:

```js
import { describe, expect, it } from "vitest";
import { FORM_FACTORIES, defaultGame } from "./formFactories";

describe("defaultGame", () => {
  it("starts on Might Play with the play flags off", () => {
    const form = defaultGame();
    expect(form.playing_status).toBe("Might Play");
    expect(form.play_next).toBe(false);
    expect(form.to_replay).toBe(false);
    expect(form.copies).toEqual([]);
  });

  it("is registered under the game key", () => {
    expect(FORM_FACTORIES.game).toBe(defaultGame);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/config/adminTabs.test.js src/config/formFactories.test.js`
Expected: FAIL

- [ ] **Step 3: Implement**

- `formFactories.js`: `defaultGame()` with every form field, `playing_status: "Might Play"`, `play_next: false`, `to_replay: false`, `copies: []`, `sources: []`; register in `FORM_FACTORIES`.
- `adminTabs.js`: a `game` tab in the `entries` group (`icon: "fa-gamepad"`, `label: "Game Entry"`).
- `fieldMeta.js`: the per-type `game` block (labels, `control`/`options` for the selects, `source: { kind: "option", category: "Game Genre", scope: "game" }` for the tag fields, `source: { kind: "studio" }` for developer and `{ kind: "publisher" }` for publisher), the shared `playing_status` / `play_next` / `to_replay` meta beside their watch/read siblings, and a `game` ORDER entry.
- `payloads.js`: the game credit/tag key map — `credits: { studio: "studio", publisher: "publisher", director: "director", composer: "composer" }` and the four tag fields.
- `GameAddTab.jsx` / `GameModifyTab.jsx`: modelled on the comic pair (`gmf`/`ugm` and `cgmf`/`ugm` state conventions), with `<StatusOptions statuses={PLAYING_STATUSES} />`, the two flag checkboxes, `<SourcesEditor />`, and `<GameCopiesEditor items={gmf.copies} onChange={(v) => ugm("copies", v)} />`. `GameAddTab.jsx` re-exports `defaultGame` from `formFactories`.
- `Add.jsx` / `Modify.jsx`: the import, form state, updater, `resolveDefaults("game", fd)`, the submit dispatch arm, the render arm, and `submitGame()` building the payload including `copies`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/config src/pages/admin`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/add-tabs/GameAddTab.jsx frontend/src/pages/modify-tabs/GameModifyTab.jsx frontend/src/config/adminTabs.js frontend/src/config/adminTabs.test.js frontend/src/config/formFactories.js frontend/src/config/formFactories.test.js frontend/src/config/formFields/fieldMeta.js frontend/src/lib/payloads.js frontend/src/pages/admin/Add.jsx frontend/src/pages/admin/Modify.jsx && git commit -m "feat(game): admin add and modify tabs"
```

---

### Task 8: The remaining per-type surfaces

**Files:**
- Modify: `frontend/src/pages/admin/Delete.jsx`, `frontend/src/pages/plan/usePlanData.js`, `frontend/src/pages/statistics/useStatisticsData.js`, `frontend/src/utils/statsUtils.js`, `frontend/src/pages/public/Index.jsx`, `frontend/src/pages/public/Search.jsx`, `frontend/src/components/layout/NavSearch.jsx`, `frontend/src/hooks/useGlobalMediaSearch.js`, `frontend/src/components/layout/GroupedEntryPage.jsx`, `frontend/src/pages/detail/FranchisePage.jsx`, `frontend/src/pages/statistics/StatsCompletions.jsx`
- Test: `frontend/src/pages/public/Search.test.jsx`, `frontend/src/pages/public/Index.test.jsx`

- [ ] **Step 1: Write the failing test**

Update the label arrays in `Index.test.jsx` and `Search.test.jsx` to include Game, and add:

```js
  it("offers game as a search scope", () => {
    expect(SCOPE_LABELS.game).toBe("Game");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/public`
Expected: FAIL

- [ ] **Step 3: Implement**

- `Delete.jsx`: `"game"` in `MEDIA_KEYS`, the `game: []` state slot, the fetch, the delete tab and its status display.
- `usePlanData.js`: the game `useMediaList` call and its `entriesByType` entry. Games have no self-grouping column, so leave `SELF_GROUP_COLUMN` alone.
- `useStatisticsData.js` and `statsUtils.js`: the game query and `_type` tagging — note this file uses the **underscored** `_type` vocabulary, and `TYPE_TO_ENTRY_TYPES` is a third vocabulary keyed by `franchise_type`, so add `Game: ["game"]` there.
- `Index.jsx`: the dashboard division, query, handler and prop wiring.
- `Search.jsx` / `NavSearch.jsx` / `useGlobalMediaSearch.js`: scopes, `TYPE_LABEL`, quotas, the `navigate("/game/...")` arm and the `ENTRY_TYPES` list.
- `GroupedEntryPage.jsx`: a `game` entry in `MEDIA_TYPE_FILTERS`.
- `FranchisePage.jsx` and `StatsCompletions.jsx`: the per-type sections, following the comic blocks.
- **Cover resolution**, which a ninth media type quietly breaks in two places:
  - `getFranchiseCover` / `getSeriesCover` (`lib/covers.js`) are themselves
    media-type-agnostic, but they resolve `cover_entry_id` against the entry
    dictionary their caller builds. Games must be in that dictionary on
    `FranchisePage.jsx` and `SeriesPage.jsx`, or a franchise whose chosen cover
    is a game silently falls back to the placeholder. (`getSeriesCover`'s
    docstring says "six flat entry arrays" and is already stale — correct it
    while you are there.)
  - `franchise.type_covers` is a per-media-type cover choice held as JSONB, so
    it gains a `game` key with **no migration** — but the franchise admin
    form's cover picker must offer game entries, otherwise the key can never
    be set.

- [ ] **Step 4: Run the full suite**

Run: `cd frontend && npm run test:run && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/Delete.jsx frontend/src/pages/plan/usePlanData.js frontend/src/pages/statistics/useStatisticsData.js frontend/src/utils/statsUtils.js frontend/src/pages/public/Index.jsx frontend/src/pages/public/Index.test.jsx frontend/src/pages/public/Search.jsx frontend/src/pages/public/Search.test.jsx frontend/src/components/layout/NavSearch.jsx frontend/src/hooks/useGlobalMediaSearch.js frontend/src/components/layout/GroupedEntryPage.jsx frontend/src/pages/detail/FranchisePage.jsx frontend/src/pages/statistics/StatsCompletions.jsx && git commit -m "feat(game): plan, statistics, search and dashboard surfaces"
```

---

### Task 9: Build and document

**Files:**
- Modify: `docs/frontend/components.md`, `docs/frontend/pages.md`, `docs/frontend/design-system.md`, `docs/roadmap.md`

- [ ] **Step 1: Build**

```bash
cd frontend && npm run build
```

Expected: succeeds and writes `frontend_dist/`. Without this the change works on `:5173` and not on `:8000`.

- [ ] **Step 2: Update the docs**

Bump every `Last verified` line. `components.md` — the third `statusType`, the two new components, the "adding a media type" checklist updated with anything this plan found missing. `pages.md` — `/library/game` and `/game/:system_id`. `design-system.md` — the new scope colour. `roadmap.md` — a Done row.

- [ ] **Step 3: Verify everything**

```bash
cd frontend && npm run test:run && npm run lint && npm run build
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add docs/frontend/components.md docs/frontend/pages.md docs/frontend/design-system.md docs/roadmap.md && git commit -m "docs(game): frontend surface"
```

---

## Done when

- `npm run test:run`, `npm run lint` and `npm run build` are all green.
- `/library/game` lists games, filters by play status, ownership and type, and sorts by playtime.
- `/game/:system_id` shows the tracker, playtime, achievements, copies and the game note sections.
- A game can be added, modified and deleted from the admin pages, with copies round-tripping.
- Nothing regressed for the other eight types — the watch and read cases still read exactly as before.
