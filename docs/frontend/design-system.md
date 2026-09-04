# Design system — "the archive"

Last verified: 2026-09-04

The UI is styled as a physical media archive: paper, ink, index slips,
spine labels and a rating stamp. It replaced the generic dashboard look
(grey canvas, white rounded cards, drop shadows, blue accent, rainbow
badges). This document is the rulebook; the code lives in
`frontend/src/index.css` (tokens) and
`frontend/src/components/ui/primitives.jsx` (components).

## Tokens (`index.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#ece9e2` bone | `#17150f` | page background |
| `surface` | `#f8f6f1` | `#211e18` | slips, tables, panels |
| `surface-2` / `surface-3` | darker paper | lighter charcoal | inset, hover, stripes |
| `text` / `text-muted` / `text-faint` | ink shades | paper shades | body / secondary / captions |
| `border` / `border-strong` | | | hairline / emphasised rule |
| `brand` / `brand-hover` | `#7a4c9e` wisteria | `#c2a0e6` | the one accent |
| `on-brand` | white | charcoal | text on a brand fill |
| `brand-soft` | 8 % tint | 14 % tint | selected rows, active tab |
| `ink` / `ink-text` | dark in both themes | | nav drawer front, spine strips |
| `danger` / `success` / `warning` / `info` | fixed hues | | state only, never decoration |

Geometry: Tailwind's `--radius-*` scale is capped at 6 px and `shadow-sm` /
`shadow-md` are zeroed, so every `rounded-xl shadow-sm` card in the code
renders flat. Elevation (`shadow-lg`+) is reserved for menus, popovers and
modals.

Sticky offsets: the nav height lives once as `--nav-h` in `index.css`
(3.5rem; 6rem + 1px on lg+ where the tab strip shows). Page headers that
pin below the nav use `top-[var(--nav-h)]`, never a hard-coded `top-16`
(`src/nav-offset.test.js` guards this).

Type: `font-display` Archivo Narrow (titles, large figures), `font-sans`
Noto Sans TC (body, CJK), `font-mono` IBM Plex Mono (labels, ids, dates,
counts). `h1` is display by default.

## Rules

1. **One accent.** `brand` is the only saturated colour on a page: active
   nav tab, primary button, rating stamp, focused ring, links on hover.
   Never use Tailwind palette colours (`blue-500`, `emerald-100`, …) for
   categories, statuses or decoration. `danger` marks destructive or
   critical state; `success`/`warning`/`info` may tint a toast or a
   pipeline status, tinted with opacity (`bg-success/15`).
2. **Structure is mono.** Labels, section titles, breadcrumbs, ids, dates
   and counts are set in `font-mono`, small, uppercase, letter-spaced
   (`Eyebrow`). Values are in the body face. Titles are `font-display`.
3. **Flat.** Surfaces are separated by hairlines, not shadows or tinted
   headers. A slip has a mono title on a dotted rule (`Slip`).
4. **No decorative icons.** Font Awesome icons stay only where they carry
   meaning on their own (an icon-only button, an external-link mark, a
   spinner). Section titles, nav links, labels and buttons with text do
   not get an icon.
5. **Colour never encodes a category.** Media type, airing status,
   expectation and the like are text (`Chip`, tone `ink`). The exceptions
   are the rating stamp (brand), destructive states (danger) and the
   **scope chips on the System Options page** (`config/scopeColors.js`,
   `--color-scope-*` in both palettes). That page runs the same eight media
   type keys down one narrow column across hundreds of rows, and the question
   asked of it — which two values are offered in the same places — is a
   comparison, not a reading; hue answers it at a glance where
   "anime-movie" against "anime" does not. The key stays written in the chip,
   so the colour is an index and never the only signal. It is scoped to that
   one column on purpose: `config/mediaTypeColors.js` still gives every media
   type the same ink chip everywhere else, and a second colour-coded category
   needs the same argument made again, not this one cited.
6. **Copy** is sentence case, plain verbs, no exclamation marks:
   "Quick edit", "Mark completed", "Saved". Empty states say what is
   missing and what to do, not a mood.
7. **Both themes.** Anything on a brand fill uses `text-on-brand`, never
   `text-white`. Nothing sits on a hard-coded grey (`src/theme-tokens.test.js`
   guards this); overlays on cover art may use `bg-black/60`.

## Primitives (`components/ui/primitives.jsx`)

- `Eyebrow` — mono caption; `as="h3"` when it titles a section.
- `Slip` — flat bordered section with title row (`title`, `actions`,
  `padded`).
- `RatingStamp` — outlined brand square with the rank letter; `size`
  `sm`/`md`, `tilt` on covers.
- `Chip` — mono tag on a faint fill, hairline border, 4 px radius; `tone` `ink` (default) / `brand` / `danger` /
  `muted`.
- `ProgressRule` — 4 px brand rule, `value` 0–1.
- `Button` — `kind` `primary` / `outline` / `danger` / `ghost`, `size`
  `md`/`sm`.

Shared detail-page pieces built on these: `InfoCard` (a slip of
label/value fields), `ScoreBlock` (display figures on hairlines),
`SourcesCard`, `MyTrackerCard`, `RelationsSection`.

## Page anatomy

Detail page (`pages/detail/*.jsx`):

```
ANIME  /  <title>                                  ← Eyebrow breadcrumb
[ ADMIN ............ Quick edit  Mark completed  Autofill ]   ← dashed strip, admin only
┌spine┬─────────┐  ANIME · TV · FINISHED AIRING · SPR 2021    ← Eyebrow line
│ANIME│  cover  │  <Title in display face>
│ ·TV │   [A]   │  subtitle (muted)
│ id  │─────────│  ───────────────────────────────
│     │ progress│  FRANCHISE <link>   SERIES <link>
└─────┴─────────┘  8.35 │ #274 │ —          last updated
 Sources           My tracker (Slip)
 Relations         Naming / Information / Production (InfoCard)
                   Notes
```

Cards (`components/cards/*.jsx`): cover with a thin ink spine on the left
carrying the media type; the rating stamp top-right; title in display
face below; one mono line for season/year and count; no hover zoom, the
border darkens on hover.

Library and list pages: the filter bar is a flat strip on the canvas;
tables use hairline rows with mono headers.

## Changing it

- New colour → add a token to `index.css` in both palettes, never a raw hex
  in a component. Three palettes in practice: `:root`, `[data-theme="dark"]`
  and the `prefers-color-scheme` block that covers a no-JS first paint —
  a token missing from the third renders as nothing in that one case.
- New surface pattern → add a primitive here before using it twice.
- Check both themes on :5173 before calling it done.
