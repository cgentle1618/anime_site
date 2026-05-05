# Admin Forms Logic

This document describes the frontend interaction logic for the Add, Modify, and Delete admin pages. All logic is implemented in the React SPA. For the backend pipeline functions triggered on submit (e.g. `execute_replace_single_anime`), see `business-logic.md`.

---

## Add Page

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

- The Franchise field supports searching existing ACG franchises only (no new franchise creation here).
- A franchise must be chosen before the form can be submitted.
- On submit: auto-generate `system_id`.

---

### Add Movie Entry Tab

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

- Series is created using all anime name fields filled in the form (the text typed in the Series field is ignored for name generation).

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

- The Franchise field supports searching existing ACG franchises or typing a new name.
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

## Delete Page

- When any entry is deleted, its associated cover image is removed from GCS if one exists.

### Delete Movie Entry Tab

- Search bar → filter by Movie Name CN/EN/Alt; select to show cover thumbnail, Movie Name CN/EN, Airing Status, Watching Status, Franchise Name, System ID, Delete button.
- **Confirmation modal** — if the deleted movie is the only entry in its franchise (no anime, anime movies, other movies, or series), offers option to also delete the orphaned Franchise Hub.
- Deletes: `DELETE /api/movies/:id`
