# Phase 1.1 – localStorage Persistence

**Goal:** Persist user data across page refreshes and browser sessions. Without this, every reload wipes all assets and resets projection settings to defaults, making the Phase 1 POC impractical to use.

**Deliverable:** Assets and projection settings survive page refresh, tab duplication, and browser restart. Zero new npm dependencies — implemented with native `localStorage` and Vue `watch`.

**Prerequisites:** Phase 1 complete — the full frontend POC with the asset form, projection engine, table, and chart.

---

## What is Persisted

| Data | Storage key | Format |
|---|---|---|
| Assets | `was-assets` | JSON array of `Asset[]` |
| Projection settings | `was-projection-settings` | JSON object (see schema below) |

### Projection settings schema

```json
{
  "years": 20,
  "inflation": "2.5",
  "cgt": "",
  "incomeTax": "",
  "deemedDisposal": "41"
}
```

Note: all settings values are stored as **display strings** (the same format the inputs use), not as decimals. This avoids any conversion mismatch on load.

---

## Task 1.1.1 – Persist Assets (`stores/assets.ts`)

**What:** Load assets from `localStorage` on store initialisation. Write back on every change.

**Implementation:**

```typescript
const STORAGE_KEY = 'was-assets'

function loadAssets(): Asset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Asset[]) : []
  } catch {
    return []  // corrupted data → start fresh
  }
}

export const useAssetStore = defineStore('assets', () => {
  const assets = ref<Asset[]>(loadAssets())

  // Sync to localStorage on any mutation (add, update, delete, nested field change)
  watch(assets, (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
  }, { deep: true })

  // ... addAsset, updateAsset, deleteAsset unchanged ...

  // Seed only on first visit in DEV (when localStorage is empty)
  if (import.meta.env.DEV && assets.value.length === 0) {
    addAsset({ /* VWCE */ })
    addAsset({ /* CSPX */ })
  }
})
```

**Key details:**
- `loadAssets()` is called **outside** the store definition so the initial `ref` value comes from storage, not an empty array
- `{ deep: true }` on the watch ensures nested mutations (e.g. editing a field inside an asset object) are caught
- The `try/catch` in `loadAssets()` silently recovers from corrupted JSON — app loads with an empty list rather than crashing
- The DEV seed guard `assets.value.length === 0` now naturally means "nothing in localStorage" since `loadAssets()` returns `[]` when the key is absent

**Files modified:**
- `src/web/src/stores/assets.ts`

---

## Task 1.1.2 – Persist Projection Settings (`components/ProjectionControls.vue`)

**What:** Restore the five projection setting inputs from `localStorage` when the component mounts. Write back whenever any field changes.

**Implementation (added to `<script setup>`):**

```typescript
const SETTINGS_KEY = 'was-projection-settings'

onMounted(() => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s.years)             years.value                = s.years
      if (s.inflation)         inflationDisplay.value      = s.inflation
      if (s.cgt != null)       cgtDisplay.value            = s.cgt
      if (s.incomeTax != null) incomeTaxDisplay.value      = s.incomeTax
      if (s.deemedDisposal)    deemedDisposalDisplay.value = s.deemedDisposal
    }
  } catch { /* ignore corrupted data */ }
})

watch([years, inflationDisplay, cgtDisplay, incomeTaxDisplay, deemedDisposalDisplay], () => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    years: years.value,
    inflation: inflationDisplay.value,
    cgt: cgtDisplay.value,
    incomeTax: incomeTaxDisplay.value,
    deemedDisposal: deemedDisposalDisplay.value,
  }))
})
```

**Key details:**
- `onMounted` (not `watchEffect` or immediate) runs after Vue has initialised the component refs, and avoids any SSR edge cases
- Per-field null checks use `!= null` for `cgt` and `incomeTax` because those fields default to empty string `''` — a falsy check would wrongly skip restoring a stored empty value
- The array-form `watch([...])` is a single watcher on all five refs — fires whenever any of them changes, keeping storage fresh without a manual save step
- No conversion needed: values are stored and restored as-is (display strings)

**Files modified:**
- `src/web/src/components/ProjectionControls.vue`

---

## Acceptance Criteria

- Add an asset → refresh page → asset still present with all fields intact
- Edit an asset → refresh → edited values persisted
- Delete all assets → refresh → list is empty (no ghost data)
- Change projection settings (years slider, any tax field) → refresh → same values restored
- First visit with empty localStorage in DEV → seed data appears
- Subsequent visits in DEV → seed data does NOT re-appear (uses stored assets)
- Open the same page in a new tab → same assets and settings
- Corrupt `was-assets` in DevTools → refresh → app loads with empty list, no crash or console error
- `npm run test` → all 14 tests still pass (localStorage not involved in unit tests)
- `npm run build` → no TypeScript errors
