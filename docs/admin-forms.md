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

### Planned Tabs (Under Development)

- Add Movie Entry
- Add TV Show Entry
- Add Cartoon Entry
- Add Manga Entry

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

### Planned Forms (Under Development)

- Modify Movie Entry
- Modify TV Show Entry
- Modify Cartoon Entry
- Modify Manga Entry

---

## Delete Page

- When any entry is deleted, its associated cover image is removed from GCS if one exists.
