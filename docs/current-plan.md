● User approved Claude's plan
⎿  Plan saved to: ~\.claude\plans\are-we-able-to-hashed-marble.md · /plan to edit
Plan: Split Add.jsx and Modify.jsx Into Per-Tab Components

     Context

     Add.jsx (~5,339 lines) and Modify.jsx (~5,543 lines) are monolithic React components that each handle 9 entity types (anime, anime-movie, movie, tv-show, cartoon, manga, franchise, series, options) in a
     single file. Each file has become difficult to navigate and edit. The goal is to split each into smaller, focused files without changing behavior.

     ---
     Approach: Extract Per-Tab Form Components (JSX Only)

     The cleanest, lowest-risk split is to extract the JSX form fields for each tab into a dedicated component file. The parent file retains all state management, data loading, submit/save logic, and modal
     coordination. Each tab component is a "dumb" render-only component that receives props.

     Why not move submit logic into tab components?
     Submit functions in both files trigger shared modals (franchiseCreateModal, createModal) and update shared data arrays (setAllFranchises, setAllAnime, etc.) that are needed by multiple tabs. Keeping that
     coordination in the parent avoids complex cross-component callbacks.

     ---
     New File Structure

     Add page

     frontend/src/pages/add-tabs/
       AnimeAddTab.jsx
       AnimeMovieAddTab.jsx
       MovieAddTab.jsx
       TvShowAddTab.jsx
       CartoonAddTab.jsx
       MangaAddTab.jsx
       FranchiseAddTab.jsx
       SeriesAddTab.jsx
       OptionsAddTab.jsx

     Modify page

     frontend/src/pages/modify-tabs/
       AnimeModifyTab.jsx
       AnimeMovieModifyTab.jsx
       MovieModifyTab.jsx
       TvShowModifyTab.jsx
       CartoonModifyTab.jsx
       MangaModifyTab.jsx
       FranchiseModifyTab.jsx
       SeriesModifyTab.jsx
       OptionsModifyTab.jsx

     ---
     What Each Tab Component Receives as Props

     Each tab component is a pure render component. It receives:

     ┌────────────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
     │         Prop category          │                                                   Examples                                                   │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Form state                     │ af (anime form object), amf, mf, etc.                                                                        │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Update function                │ ua (shorthand updater for that tab's form)                                                                   │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Shared data                    │ allFranchises, allSeries, allAnime, allOptions                                                               │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Auto-fill data (Add only)      │ fillResults, applyAutofill, fillQuery, setFillQuery, fillOpen, setFillOpen, fillRef                          │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Ribbon data (Modify only)      │ animeRibbon, movieRibbon, etc.                                                                               │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Callback: open franchise modal │ openFranchiseCreateModal(franchiseType, onConfirm, onCancel) → not needed since submit logic stays in parent │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ ComboBox items                 │ franchiseItems, seriesItems (pre-built in parent, passed down)                                               │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Shared classes                 │ inputCls, selectCls                                                                                          │
     ├────────────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
     │ Shared components              │ imported directly in tab file (ComboBox, Field, SectionHeader, etc.)                                         │
     └────────────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

     ▎ Note: franchiseItems and seriesItems* are already computed in the parent and can be passed as props.

     ---
     What Stays in the Parent Files

     - All useState declarations (form state, data arrays, modal state, activeTab)
     - All useEffect hooks (data loading, click-outside handlers)
     - All submit functions (submitAnime, submitMovie, etc.) — these call modals and update shared state
     - All save functions (Modify only)
     - Auto-fill application functions (applyAutofill, applyCartoonAutofill, etc.)
     - ComboBox item arrays (franchiseItems, seriesItemsForAnime, etc.)
     - Search/discovery logic (Modify only)
     - Modal rendering (FranchiseCreateModal, CreateNewEntityModal)
     - Tab bar render
     - Header/footer render
     - handleSubmit / handleSave dispatchers

     ---
     Resulting File Sizes (Estimated)

     ┌─────────────────────┬──────────────┬────────────────┐
     │        File         │    Before    │     After      │
     ├─────────────────────┼──────────────┼────────────────┤
     │ Add.jsx             │ ~5,339 lines │ ~1,200 lines   │
     ├─────────────────────┼──────────────┼────────────────┤
     │ Each *AddTab.jsx    │ —            │ ~300–700 lines │
     ├─────────────────────┼──────────────┼────────────────┤
     │ Modify.jsx          │ ~5,543 lines │ ~1,400 lines   │
     ├─────────────────────┼──────────────┼────────────────┤
     │ Each *ModifyTab.jsx │ —            │ ~300–700 lines │
     └─────────────────────┴──────────────┴────────────────┘

     ---
     Critical Files

     ┌──────────────────────────────────────┬───────────────────────────────────────────────────────────┐
     │                 File                 │                          Change                           │
     ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │ frontend/src/pages/Add.jsx           │ Remove tab JSX sections; import and render tab components │
     ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │ frontend/src/pages/Modify.jsx        │ Remove tab JSX sections; import and render tab components │
     ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │ frontend/src/pages/add-tabs/*.jsx    │ New — tab form JSX components                             │
     ├──────────────────────────────────────┼───────────────────────────────────────────────────────────┤
     │ frontend/src/pages/modify-tabs/*.jsx │ New — tab form JSX components                             │
     └──────────────────────────────────────┴───────────────────────────────────────────────────────────┘

     ---
     Implementation Order

     Extract one tab at a time to keep diffs reviewable. Recommended order:

     1. FranchiseAddTab and FranchiseModifyTab — simplest tabs (~80 lines of JSX each), no auto-fill, no ribbon
     2. SeriesAddTab / SeriesModifyTab — also simple
     3. OptionsAddTab / OptionsModifyTab — isolated, no franchise/series logic
     4. MangaAddTab / MangaModifyTab
     5. CartoonAddTab / CartoonModifyTab
     6. TvShowAddTab / TvShowModifyTab
     7. MovieAddTab / MovieModifyTab
     8. AnimeMovieAddTab / AnimeMovieModifyTab
     9. AnimeAddTab / AnimeModifyTab — largest and most complex

     Each step: extract JSX into new file → import and drop into parent → verify tab renders and saves correctly.

     ---
     Verification

     For each extracted tab:
     1. Open the Add or Modify page in the browser and navigate to that tab.
     2. Verify the form renders with correct fields and default values.
     3. Submit a valid entry and confirm success toast + data updates.
     4. For Modify: search for an existing entry, open it, edit a field, save — confirm the update.
     5. Test franchise/series auto-creation modals (enter a new franchise name in any item form and submit).
     6. Regression: confirm other tabs still work after each extraction step.
