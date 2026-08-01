# Admin Forms Logic

This document describes the frontend interaction logic for the Add, Modify, and Delete admin pages. All logic is implemented in the React SPA. For the backend pipeline functions triggered on submit (e.g. `execute_replace_single_anime`), see `business-logic.md`.

---

## Where Defaults Come From

Every Add-form field has a **built-in** blank value defined in
`frontend/src/config/formFactories.js` (one `defaultX()` factory per media type). An
admin can override any of them per media type on the [Form Defaults](#form-defaults-page)
page; overrides are stored sparsely, so a field the admin never touched keeps its
built-in value forever.

The resolution chain, in `frontend/src/hooks/useFormDefaults.js`:

```
defaultX()  →  overlay config.defaults  →  coerceToShape  →  form state
 (built-in)     (only overridden keys)     (match the factory value's type)
```

**Governing rule: configured defaults apply to newly created entries and as
fallbacks for NULL values. Changing a default never rewrites an existing row.**
`/defaults` is a form-behavior setting, not a bulk-edit tool.

Three places consume the resolved values:

1. **Add** seeds all nine forms from them at mount, and resets to them after each
   successful submit. Because the page renders a spinner until its bulk load
   resolves, the form's first paint already has the configured values — there is no
   flash and no risk of clobbering something the admin typed.
2. **Add / Modify submit** uses them as the last-resort fallback if the admin blanks
   a status select (`watching_status || <resolved default>`).
3. **Modify's entity→form mappers** use them when a saved entry has a NULL status, so
   the editor shows the configured default rather than an empty select. Modify holds
   the config in a **ref**, not state, because the deep-link path (`/modify?id=…`)
   opens an editor from inside the load effect, before a state update would flush.

If the `/api/form-defaults/` fetch fails, it resolves to `{}` and every form falls
back to its built-ins — behavior identical to before the feature existed. The fetch is
guarded separately from the rest of the bulk load for exactly this reason.

---

## Auto-Fill From Existing Entry

Each Add tab has a search bar that copies fields from an existing entry into the form.
One shared helper — `frontend/src/lib/autofill.js` `buildAutofillPatch()` — drives all
seven, replacing what used to be six near-duplicate functions with divergent hardcoded
field lists.

- **Which fields are copied** comes from the admin's configuration, falling back to
  `BUILTIN_AUTOFILL` in `config/formFields/fieldMeta.js` (the historical per-type sets,
  preserved verbatim). A configured `[]` genuinely means "copy nothing".
- **The patch is merged**, not assigned: `setX(p => ({...p, ...patch}))`, so fields
  outside the list keep whatever the form already had.
- **Franchise / series** resolve their `_id` and display-name `_text` fields together
  from one registry entry — copying the id alone would leave the ComboBox blank.
- **`derive_related`** is a real boolean in the DB but a `"true"`/`"false"`/`""` select
  in the form, so it is coerced on the way in.
- **Movie's `airing_status`** falls back to the configured default when the source entry
  has none. (It previously pinned a literal `"Not Yet Aired"`, which contradicted the
  Movie tab's own `"Finished Airing"` default.)
- Auto-fill copies the source entry's **title verbatim**, so the duplicate-name check on
  submit will fire unless the admin edits the name first.

---

## Form Defaults Page

`/defaults` — admin only. See [pages.md](pages.md#form-defaults-defaults) for the UI and
[api.md](api.md#form-defaults--apiform-defaults) for the stored payload.

The field list is **derived**, not hand-written: `config/formFields/index.js`
`getFieldRegistry(type)` walks `Object.keys(defaultX())` and merges in presentation
metadata from `fieldMeta.js`. A field with no metadata still appears, with a humanized
label and a control inferred from its blank value. This means a field added to a form
shows up on `/defaults` automatically, and a metadata entry whose field no longer exists
is dropped with a dev-mode warning — drift is impossible in either direction.

Fields marked `defaultable: false` (`franchise_id`, `series_id`, `source_other`,
`cover_image_file`, `novel_name_each_*`) accept no default: they are entity pickers or
repeatable sub-record editors where a fixed starting value is meaningless. Most still
expose the auto-fill checkbox.

---

## Add Page

### General Field Interactions

**Franchise & Series Autocomplete**

- Both the Franchise and Series fields support searching existing entries via a dropdown menu.
- **Selection requirement:** To bind an entry to an existing franchise or series, the user must explicitly click/select it from the dropdown.
- **Typed fallback:** If the user types a name (whether new or matching an existing one) but does not select it from the dropdown, the frontend treats the selection state as `null`. Upon submission, this triggers the Franchise Generation modal or Series Generation modal respectively to create a new franchise/series hub.

---

### Add Anime Entry Tab

**Prefill from existing entry**

- A search box allows typing to find an existing anime entry. Selecting one prefills: Franchise, Series, all Anime Name fields, Airing Type, Main / Spinoff, Genre Main, Genre Sub, Studio.

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- A franchise must be chosen or typed before the form can be submitted.

**Series field**

- Supports searching existing series filtered to the selected franchise, or typing a new name.
- Series is optional.

**Form defaults**
| Field | Default |
|---|---|
| Airing Status | Not Yet Aired |
| Watching Status | Might Watch |
| Main / Spinoff | 本傳 |

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Auto-generate `system_id`, `created_at`, `updated_at`.
4. Call `execute_replace_single_anime` (Replace pipeline for this entry).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using all anime name fields filled in the form (the text typed in the Franchise field is ignored for name generation).
- `franchise_type` is set to `ACG`.

**Series Generation modal**

- Series is created using all anime name fields filled in the form (the text typed in the Series field is ignored for name generation).

---

### Add Anime Movie Entry Tab

**Auto-fill** — searches existing anime movies by any of the five name fields and copies
names, franchise, studio, and director. (This tab had no auto-fill before; it was the
only media type missing one.)

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- A franchise must be chosen or typed before the form can be submitted.

**Form defaults**
| Field | Default |
|---|---|
| Airing Status | Not Yet Aired |
| Watching Status | Might Watch |

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. Auto-generate `system_id`, `created_at`, `updated_at`.
3. Call `execute_replace_single_anime_movie` (Replace pipeline for this entry).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using all anime movie name fields filled in the form (the text typed in the Franchise field is ignored for name generation).
- `franchise_type` is set to `ACG`.

---

### Add Franchise Entry Tab

- On submit: auto-generate `system_id`, `created_at`, `updated_at`.

---

### Add Series Entry Tab

- The Franchise field supports searching existing franchises only (no new franchise creation here).
- A franchise must be chosen before the form can be submitted.
- On submit: auto-generate `system_id`.

---

### Add Movie Entry Tab

**Prefill from existing entry**

- A search box allows typing to find an existing movie entry. Selecting one prefills: Franchise, Series, all Movie Name fields (EN/CN/Alt), Main / Spinoff, Movie Type, Director.

**Franchise field**

- Supports searching existing franchises filtered to `franchise_type = "TV or Movie"` or typing a new name.
- Franchise is optional (can leave blank).
- Changing franchise clears the series field.

**Series field**

- Supports searching existing series (filtered by selected franchise) or typing a new name.
- Series is optional.

**Form defaults**
| Field | Default |
|---|---|
| Airing Status | Not Yet Aired |
| Watching Status | Might Watch |

**On submit**

1. If franchise text was typed but no existing franchise selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Auto-generate `system_id`, `created_at`, `updated_at`.
4. `POST /api/movies/` — which internally triggers `execute_replace_single_movie` (IMDb autofill pipeline).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using Movie Name EN/CN/Alt fields from the form.
- `franchise_type` is set to `"TV or Movie"`.

**Series Generation modal**

- Series is created using all movie name fields filled in the form (the text typed in the Series field is ignored for name generation).

---

### Add TV Show Entry Tab

**Prefill from existing entry**

- A search box allows typing to find an existing TV show entry. Selecting one prefills: Franchise, Series, all TV Show Name fields, Main / Spinoff, Region.

**Franchise field**

- Supports searching existing TV or Movie franchises or typing a new name.
- A franchise must be chosen or typed before the form can be submitted.

**Series field**

- Supports searching existing series or typing a new name.
- Series is optional.

**Form defaults**
| Field | Default |
|---|---|
| Airing Status | Not Yet Aired |
| Watching Status | Might Watch |
| Main / Spinoff | 本傳 |

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Auto-generate `system_id`, `created_at`, `updated_at`.
4. Call `execute_replace_single_tv_show` (Replace pipeline for this entry).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using all TV show name fields filled in the form (the text typed in the Franchise field is ignored for name generation).
- `franchise_type` is set to `"TV or Movie"`.

**Series Generation modal**

- Series is created using all TV show name fields filled in the form (the text typed in the Series field is ignored for name generation).

---

### Add Cartoon Entry Tab

**Prefill from existing entry**

- A search box allows typing to find an existing cartoon entry. Selecting one prefills: Franchise, Series, all Cartoon Name fields (CN/EN/Alt), Airing Type, Main / Spinoff, Source Official, Season Part, Derive Related, IMDb Link.

**Franchise field**

- Supports searching existing Cartoon franchises or typing a new name.
- A franchise must be chosen or typed before the form can be submitted.

**Series field**

- Supports searching existing series or typing a new name.
- Series is optional.

**Form defaults**
| Field | Default |
|---|---|
| Airing Type | TV |
| Airing Status | Not Yet Aired |
| Watching Status | Might Watch |
| Main / Spinoff | 本傳 |

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Auto-generate `system_id`, `created_at`, `updated_at`.
4. Call `execute_replace_single_cartoon` (Replace pipeline for this entry).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using all cartoon name fields filled in the form (the text typed in the Franchise field is ignored for name generation).
- `franchise_type` is set to `Cartoon`.

**Series Generation modal**

- Series is created using all cartoon name fields filled in the form (the text typed in the Series field is ignored for name generation).

---

### Add Manga Entry Tab

**Prefill from existing entry**

- A search box allows typing to find an existing manga entry. Selecting one prefills: Franchise, Series, all Manga Name fields, Region, Main / Spinoff.

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- A franchise must be chosen or typed before the form can be submitted.

**Series field**

- Supports searching existing series or typing a new name.
- Series is optional.

**Form defaults**
| Field | Default |
|---|---|
| Serialization Status | _(null)_ |
| Reading Status | Might Read |
| Main / Spinoff | 本傳 |

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Auto-generate `system_id`, `created_at`, `updated_at`.
4. Call `execute_replace_single_manga` (Replace pipeline for this entry).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using all manga name fields filled in the form (the text typed in the Franchise field is ignored for name generation).
- `franchise_type` is set to `ACG`.

**Series Generation modal**

- Series is created using all manga name fields filled in the form (the text typed in the Series field is ignored for name generation).

---

### Add Novel Entry Tab

**Prefill from existing entry**

- A search box allows typing to find an existing novel entry. Selecting one prefills: Franchise, Series, all Novel Name fields (CN/EN/Roman/JP/Alt), Type, Region, Main / Spinoff, Author, Illustrator.

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- A franchise must be chosen or typed before the form can be submitted.

**Series field**

- Supports searching existing series or typing a new name.
- Series is optional.

**Form defaults**
| Field | Default |
|---|---|
| Serialization Status | _(null)_ |
| Reading Status | Might Read |
| Main / Spinoff | 本傳 |

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Auto-generate `system_id`, `created_at`, `updated_at`.
4. Call `execute_replace_single_novel` (Replace pipeline for this entry).

**Franchise Generation modal**

- User selects Franchise Expectation (default: Low) and optionally adds a remark.
- Franchise is created using all novel name fields filled in the form (the text typed in the Franchise field is ignored for name generation).
- `franchise_type` is set to `Novel`.

**Series Generation modal**

- Series is created using all novel name fields filled in the form (the text typed in the Series field is ignored for name generation).

**Novel Name Each fields**

- `novel_name_each_cn` and `novel_name_each_en`: a dynamic list of key-value pairs editable in the Relational & Timeline section.
- Each pair: key (book identifier — string, may be non-numeric) + value (book name).
- User can add new pairs, delete existing pairs, and reorder pairs.
- Stored as a JSON object on submit: `{"1": "最後帝國", "2": "昇華之井"}`.

---

## Modify Page

### Modify Anime Entry Form

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- When an existing franchise is selected, a sibling ribbon shows all other anime entries in that franchise, grouped by series.

**Series field**

- Supports searching existing series or typing a new name.

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Update all fields and refresh `updated_at`.
4. Call `execute_replace_single_anime` (Replace pipeline for this entry).

**Franchise Generation modal** — same logic as Add (names from form fields, type = ACG, expectation default Low).

**Series Generation modal** — same logic as Add (names from form fields).

---

### Modify Anime Movie Entry Form

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. Update all fields and refresh `updated_at`.
3. Call `execute_replace_single_anime_movie` (Replace pipeline for this entry).

**Franchise Generation modal** — same logic as Add (names from movie name fields, type = ACG, expectation default Low).

---

### Modify Franchise Entry Form

- On submit: update all fields and refresh `updated_at`.

---

### Modify Series Entry Form

- The Franchise field supports searching existing franchises of any type (ACG, Movie, TV, Cartoon) or typing a new name.
- A franchise must be chosen before the form can be submitted.
- On submit: update all fields and refresh `updated_at`.

---

### Modify Movie Entry Form

**Franchise field**

- Supports searching existing franchises filtered to `franchise_type = "TV or Movie"` or typing a new name.
- Changing franchise clears the series field.

**Series field**

- Supports searching existing series (filtered by selected franchise) or typing a new name.

**On submit**

1. If no existing franchise was selected and franchise text is non-blank → show Franchise Generation modal.
2. If no existing series was selected and series text is non-blank → show Series Generation modal.
3. Update all fields and refresh `updated_at`.
4. `PUT /api/movies/:id` — which internally triggers `execute_replace_single_movie` (IMDb autofill pipeline).

**Franchise Generation modal** — names from Movie Name EN/CN/Alt fields; `franchise_type = "TV or Movie"`.

**Series Generation modal** — series is created using Movie Name EN/CN/Alt fields from the form.

**Deep-link:** Movie detail page Quick Edit button navigates to `/modify?id=:uuid&type=movie`, which pre-selects and opens the movie editor directly.

---

### Modify TV Show Entry Form

**Franchise field**

- Supports searching existing TV or Movie franchises or typing a new name.
- When an existing franchise is selected, a sibling ribbon shows all other TV show entries in that franchise, grouped by series.

**Series field**

- Supports searching existing series or typing a new name.

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Update all fields and refresh `updated_at`.
4. Call `execute_replace_single_tv_show` (Replace pipeline for this entry).

**Franchise Generation modal** — names from all TV show name fields; `franchise_type = "TV or Movie"`, expectation default Low.

**Series Generation modal** — series is created using all TV show name fields from the form.

---

### Modify Cartoon Entry Form

**Franchise field**

- Supports searching existing Cartoon franchises or typing a new name.
- When an existing franchise is selected, a sibling ribbon shows all other cartoon entries in that franchise, grouped by series.

**Series field**

- Supports searching existing series or typing a new name.

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Update all fields and refresh `updated_at`.
4. Call `execute_replace_single_cartoon` (Replace pipeline for this entry).

**Franchise Generation modal** — same logic as Add (names from cartoon name fields, type = Cartoon, expectation default Low).

**Series Generation modal** — same logic as Add (names from cartoon name fields).

---

### Modify Manga Entry Form

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- When an existing franchise is selected, a sibling ribbon shows all other manga entries in that franchise, grouped by series.

**Series field**

- Supports searching existing series or typing a new name.

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Update all fields and refresh `updated_at`.
4. Call `execute_replace_single_manga` (Replace pipeline for this entry).

**Franchise Generation modal** — same logic as Add (names from manga name fields, type = ACG, expectation default Low).

**Series Generation modal** — same logic as Add (names from manga name fields).

---

### Modify Novel Entry Form

**Franchise field**

- Supports searching existing ACG franchises or typing a new name.
- When an existing franchise is selected, a sibling ribbon shows all other novel entries in that franchise, grouped by series.

**Series field**

- Supports searching existing series or typing a new name.

**On submit**

1. If no existing franchise was selected → show Franchise Generation modal.
2. If no existing series was selected and the series field is non-blank → show Series Generation modal.
3. Update all fields and refresh `updated_at`.
4. Call `execute_replace_single_novel` (Replace pipeline for this entry).

**Franchise Generation modal** — same logic as Add (names from novel name fields, franchise_type = Novel, expectation default Low).

**Series Generation modal** — same logic as Add (names from novel name fields).

**Novel Name Each fields**

- `novel_name_each_cn` and `novel_name_each_en`: same editable key-value pair list as Add form.
- Pre-populated from the loaded entry.
- User can add, delete, and reorder pairs.

**Structured Notes section** — editable in the Modify form. Sections:
Remark, 優點, 缺點, 優缺點, 大眾評價, 我的評價, 神片段, 解析, 巧思, Foreshadowing, 對稱, 改編, Resources, Unread, Questions, 名言/梗/迷因

---

## Delete Page

- When any entry is deleted, its associated cover image is removed from GCS if one exists.

### Delete Movie Entry Tab

- Search bar → filter by Movie Name CN/EN/Alt; select to show cover thumbnail, Movie Name CN/EN, Airing Status, Watching Status, Franchise Name, System ID, Delete button.
- **Confirmation modal** — if the deleted movie is the only entry in its franchise (no anime, anime movies, other movies, or series), offers option to also delete the orphaned Franchise Hub.
- Deletes: `DELETE /api/movies/:id`
