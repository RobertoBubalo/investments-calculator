# Phase 1 – Projection Engine (Frontend-only POC)

**Goal:** Build the core calculation engine in TypeScript and prove it works with a hardcoded dataset, rendered in a table and chart. No backend, no auth, no persistence — everything is in-memory.

**Deliverable:** A single-page app where you can add assets, tweak projection settings, and see a full projection table + chart.

---

## Task 1.1 – Project Scaffolding

**What:** Create the Vue 3 + Vite project with all dependencies and boilerplate.

**Steps:**

1. Scaffold the project in `/src/web` using `npm create vue@latest` with these options: TypeScript yes, Vue Router yes, Pinia yes, ESLint yes, Prettier yes.

2. Install dependencies:
   ```bash
   npm install vuetify @mdi/font chart.js vue-chartjs
   ```

3. Create `src/plugins/vuetify.ts`:
   - Import `createVuetify` from `vuetify`
   - Import `md3` blueprint or default
   - Use light theme only
   - Import `vuetify/styles` and `@mdi/font/css/materialdesignicons.css`

4. Register the Vuetify plugin in `main.ts` alongside Pinia and Router.

5. Replace the contents of `App.vue` with a minimal `v-app` shell:
   ```vue
   <template>
     <v-app>
       <v-app-bar title="Wealth Accumulation Simulator" flat />
       <v-main>
         <v-container>
           <router-view />
         </v-container>
       </v-main>
     </v-app>
   </template>
   ```

6. Configure `src/router/index.ts` with a single route:
   ```typescript
   { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') }
   ```

7. Create an empty `src/views/HomeView.vue` placeholder.

8. Verify the app runs with `npm run dev` and shows the app bar with the title.

**Acceptance criteria:**
- `npm run dev` starts without errors
- Browser shows the Vuetify app bar with "Wealth Accumulation Simulator"
- Vuetify components render correctly (Material Design styling present)

---

## Task 1.2 – Type Definitions

**What:** Define all TypeScript interfaces used across the app.

**Steps:**

1. Create `src/types/index.ts` with the following interfaces:

```typescript
export interface Asset {
  id: string
  name: string
  symbol: string
  shares: number
  buyPrice: number
  currentSharePrice: number
  dividendYield: number              // as decimal, e.g. 0.03 = 3%
  priceAppreciationPct: number | null
  dividendGrowthPct: number | null
  cgtTaxRate: number | null          // per-asset CGT rate; null = use global fallback
  withholdingTaxRate: number | null
  deemedDisposalEnabled: boolean
  dripEnabled: boolean               // true = reinvest dividends as shares; false = accumulate as cash
  annualContribution: number
}

export interface ProjectionSettings {
  years: number
  inflationRate: number              // as decimal, e.g. 0.025 = 2.5%
  cgtTaxRate?: number                // global fallback CGT rate, e.g. 0.33
  dividendIncomeTaxRate?: number     // personal income tax on dividends, e.g. 0.40
  deemedDisposalTaxRate?: number     // exit tax rate on deemed disposal gains, defaults to 0.41
}

export interface ShareLot {
  shares: number
  costBase: number
  purchaseYear: number
}

export interface AssetSimState {
  assetId: string
  lots: ShareLot[]
  sharePrice: number
  dividendYield: number
}

export interface DeemedDisposalEvent {
  assetName: string
  assetSymbol: string
  lotPurchaseYear: number
  gain: number
  taxAmount: number
  sharesReduced: number              // shares sold to cover the tax
}

export interface YearRow {
  year: number
  totalWealth: number                // portfolioWealth + cashBalance
  wealthDelta: number
  dividends: number                  // net dividends after withholding tax
  dividendsDelta: number
  taxPaid: number                    // actual cash taxes: WHT + deemed disposal + dividend income tax
  unrealisedCgt: number              // paper CGT liability if sold today (informational, not in taxPaid)
  dividendIncomeTax: number          // income tax on dividends (subset of taxPaid)
  deemedDisposalTax: number
  deemedDisposalEvents: DeemedDisposalEvent[]
  accumWealth: number
  accumDividends: number
  accumTaxPaid: number
  realWealth: number
  realAccumDividends: number
}
```

2. Export all interfaces as named exports.

**Acceptance criteria:**
- File compiles with zero TypeScript errors
- All interfaces are importable from `@/types`

---

## Task 1.3 – Projection Engine

**What:** Implement the pure-function projection engine. This is the core of the entire application.

**Steps:**

1. Create `src/services/projectionEngine.ts`.

2. Implement and export the main function:
   ```typescript
   export function runProjection(assets: Asset[], settings: ProjectionSettings): YearRow[]
   ```

3. **Initialisation (year 0).** For each asset, create an `AssetSimState`:
   ```typescript
   {
     assetId: asset.id,
     lots: [{ shares: asset.shares, costBase: asset.buyPrice, purchaseYear: 0 }],
     sharePrice: asset.currentSharePrice,
     dividendYield: asset.dividendYield
   }
   ```

4. **Year loop (y = 1 to settings.years).** For each year, for each asset's sim state:

   **a) Price appreciation:**
   ```
   simState.sharePrice *= (1 + (asset.priceAppreciationPct ?? 0))
   ```

   **b) Annual contribution (new lot):**
   ```
   if asset.annualContribution > 0:
     newShares = asset.annualContribution / simState.sharePrice
     simState.lots.push({ shares: newShares, costBase: simState.sharePrice, purchaseYear: y })
   ```

   **c) Deemed disposal (rate is configurable, default 0.41):**
   ```
   deemedDisposalRate = settings.deemedDisposalTaxRate ?? 0.41
   assetDeemedTax = 0
   if asset.deemedDisposalEnabled:
     for each lot in simState.lots:
       yearsHeld = y - lot.purchaseYear
       if yearsHeld > 0 && yearsHeld % 8 === 0:
         gain = (simState.sharePrice - lot.costBase) * lot.shares
         if gain > 0:
           tax = gain * deemedDisposalRate
           sharesToSell = tax / simState.sharePrice
           lot.shares -= sharesToSell
           lot.costBase = simState.sharePrice  // cost base reset for next 8-year cycle
           assetDeemedTax += tax
           deemedDisposalEvents.push({ assetName, assetSymbol, lotPurchaseYear: lot.purchaseYear, gain, taxAmount: tax, sharesReduced: sharesToSell })
         else:
           lot.costBase = simState.sharePrice  // reset even with no gain
   ```

   **d) Dividends (calculated on shares BEFORE any DRIP lot is added):**
   ```
   totalSharesForDiv = sum of lot.shares across all lots
   simState.dividendYield *= (1 + (asset.dividendGrowthPct ?? 0))
   grossDividend = totalSharesForDiv * simState.sharePrice * simState.dividendYield
   whTax = grossDividend * (asset.withholdingTaxRate ?? 0)
   netDividend = grossDividend - whTax
   assetIncomeTax = netDividend * (settings.dividendIncomeTaxRate ?? 0)
   takeHome = netDividend - assetIncomeTax
   ```

   **e) DRIP or cash accumulation:**
   ```
   if asset.dripEnabled && takeHome > 0:
     simState.lots.push({ shares: takeHome / simState.sharePrice, costBase: simState.sharePrice, purchaseYear: y })
   else:
     cashBalance += takeHome   // running total, persists across years
   ```

   **f) CGT (unrealised, informational — uses ALL lots including any DRIP lot just added):**
   ```
   effectiveCgtRate = asset.cgtTaxRate ?? (settings.cgtTaxRate ?? 0)
   cgtTax = 0
   for each lot:
     lotGain = (simState.sharePrice - lot.costBase) * lot.shares
     if lotGain > 0:
       cgtTax += lotGain * effectiveCgtRate
   ```

   **g) Portfolio value (uses ALL lots including DRIP):**
   ```
   totalShares = sum of lot.shares across all lots
   portfolioValue = totalShares * simState.sharePrice
   ```

5. **Aggregate across all assets for year y:**
   ```
   portfolioWealth = Σ portfolioValue
   totalWealth     = portfolioWealth + cashBalance   // cashBalance persists across years
   dividends       = Σ netDividend
   taxPaid         = Σ (whTax + assetDeemedTax + assetIncomeTax)  // CGT excluded — informational only
   unrealisedCgt   = Σ cgtTax                        // paper liability, not in taxPaid
   dividendIncomeTax = Σ assetIncomeTax
   deemedDisposalTax = Σ assetDeemedTax
   wealthDelta     = totalWealth - prevTotalWealth
   dividendsDelta  = dividends - prevDividends
   accumWealth     = totalWealth
   accumDividends  = prevAccumDividends + dividends
   accumTaxPaid    = prevAccumTaxPaid + taxPaid
   realWealth      = totalWealth / Math.pow(1 + settings.inflationRate, y)
   realAccumDividends = accumDividends / Math.pow(1 + settings.inflationRate, y)
   ```

6. Push each year's `YearRow` into the result array. Return the array.

7. **Edge cases to handle explicitly:**
   - All nullable fields default to `0` when null
   - Skip assets with `shares <= 0`
   - Deemed disposal on negative gain → `tax = 0` (never negative)
   - Prevent `lot.shares` from going below `0` after deemed disposal share sell
   - If `annualContribution` is `0`, no new lot is created
   - If `years` is `0`, return empty array

**Acceptance criteria:**
- Function is pure (no side effects, no mutations of input)
- Handles all edge cases listed above
- Manually verify: 1 asset, €10,000 value (100 shares @ €100), 5% price growth, 3% dividend yield, 1% dividend growth, 20% withholding tax, deemed disposal enabled, €1,200/yr contribution, 2.5% inflation, 20 years — results match a spreadsheet calculation

---

## Task 1.4 – Pinia Asset Store

**What:** Create the in-memory store for managing assets.

**Steps:**

1. Create `src/stores/assets.ts`:

```typescript
export const useAssetStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([])

  function addAsset(asset: Omit<Asset, 'id'>) {
    assets.value.push({ ...asset, id: crypto.randomUUID() })
  }

  function updateAsset(id: string, data: Partial<Asset>) {
    const idx = assets.value.findIndex(a => a.id === id)
    if (idx !== -1) assets.value[idx] = { ...assets.value[idx], ...data }
  }

  function deleteAsset(id: string) {
    assets.value = assets.value.filter(a => a.id !== id)
  }

  return { assets, addAsset, updateAsset, deleteAsset }
})
```

2. Optionally seed the store with 1–2 example assets for development convenience (behind a `DEV` flag or a "Load example data" button).

**Acceptance criteria:**
- Store is reactive — adding/editing/deleting assets updates any bound UI
- `addAsset` generates a unique `id` for each asset

---

## Task 1.5 – Asset Table Component

**What:** Display all assets in a data table with edit and delete actions.

**Steps:**

1. Create `src/components/AssetTable.vue`.

2. Use `v-data-table` with the following columns:
   | Column | Field | Format |
   |---|---|---|
   | Name | `name` | text |
   | Symbol | `symbol` | text, uppercase |
   | Shares | `shares` | number, 2 decimals |
   | Buy Price | `buyPrice` | € currency |
   | Current Price | `currentSharePrice` | € currency |
   | Current Value | computed: `shares × currentSharePrice` | € currency |
   | Dividend Yield | `dividendYield` | percentage |
   | Deemed Disposal | `deemedDisposalEnabled` | `v-chip` Yes/No |
   | Actions | — | Edit + Delete icon buttons |

3. Currency formatting: create a composable `src/composables/useFormatters.ts` with:
   ```typescript
   function formatCurrency(value: number): string  // → "€1,234.56"
   function formatPercent(value: number): string    // → "3.00%"
   function formatDelta(value: number): string      // → "+€1,234.56" or "-€1,234.56"
   ```

4. Edit button emits `edit(asset)` event. Delete button emits `delete(assetId)` event.

5. Show an empty state when no assets exist: a `v-card` with text "No assets yet" and a call-to-action button.

**Acceptance criteria:**
- Table renders all assets from the store
- Current Value column is computed correctly
- Percentages display as human-readable (e.g. "3.00%" not "0.03")
- Edit and Delete buttons emit correct events
- Empty state shows when store is empty

---

## Task 1.6 – Asset Form Dialog

**What:** A dialog for creating and editing assets.

**Steps:**

1. Create `src/components/AssetFormDialog.vue`.

2. Props:
   ```typescript
   modelValue: boolean           // v-model for dialog open/close
   asset: Asset | null           // null = create mode, Asset = edit mode
   ```

3. Use a `v-dialog` with `max-width="600"` containing a `v-card`.

4. Form layout using `v-form` with `v-text-field` and `v-switch` inputs, split into two sections:

   **Required fields:**
   - Name (`v-text-field`, required, text)
   - Symbol (`v-text-field`, required, text, uppercase transform)
   - Number of Shares (`v-text-field`, required, type number, min 0)
   - Buy Price (`v-text-field`, required, type number, min 0, prefix "€")
   - Current Share Price (`v-text-field`, required, type number, min 0, prefix "€")
   - Dividend Yield % (`v-text-field`, required, type number, min 0, max 100, suffix "%")

   **Optional fields** (in a collapsible `v-expansion-panel` labelled "Advanced"):
   - Price Appreciation % per year (`v-text-field`, type number, suffix "%")
   - Dividend Growth % per year (`v-text-field`, type number, suffix "%")
   - CGT Tax Rate % (`v-text-field`, type number, suffix "%") — per-asset override; leave blank to use global rate
   - Withholding Tax Rate % (`v-text-field`, type number, suffix "%")
   - Annual Contribution (`v-text-field`, type number, min 0, prefix "€")
   - Deemed Disposal (`v-switch`, label "Enable Irish 8-year deemed disposal rule")
   - Reinvest Dividends DRIP (`v-switch`, label "Reinvest dividends (DRIP)") — when off, dividends accumulate as cash

5. **Important:** The form accepts percentage inputs as human-readable numbers (e.g. user types `3` for 3%). Convert to decimal on save (`3` → `0.03`) and back to display values on edit (`0.03` → `3`).

6. Validation rules:
   - All required fields must have a value
   - Numeric fields must be ≥ 0
   - Percentage fields must be between 0 and 100
   - Name must not be empty

7. Card actions: "Cancel" (closes dialog, resets form) and "Save" (validates, converts percentages, emits `save(assetData)`, closes dialog).

8. When `asset` prop is non-null, pre-fill the form with the asset's values (converting decimals back to display percentages).

**Acceptance criteria:**
- Dialog opens for both create and edit modes
- Validation prevents saving invalid data
- Percentage conversion is correct in both directions
- Cancel resets the form without saving
- Save emits correctly formatted asset data

---

## Task 1.7 – Projection Settings Controls

**What:** UI controls for configuring the projection parameters.

**Steps:**

1. Create `src/components/ProjectionControls.vue`.

2. Props/emits:
   ```typescript
   // emits
   'run-projection': [settings: ProjectionSettings]
   ```

3. Layout as a `v-card` with `title="Projection Settings"`:
   - Years: `v-slider` with min=1, max=50, step=1, default=20, thumb-label, appended text showing value
   - Inflation Rate: `v-text-field` type number, suffix "%", default=2.5, min=0, max=30
   - CGT Rate: `v-text-field` type number, suffix "%", optional — global fallback rate applied to assets with no per-asset CGT rate set
   - Dividend Income Tax Rate: `v-text-field` type number, suffix "%", optional — personal income tax applied to net dividends
   - Deemed Disposal Tax Rate: `v-text-field` type number, suffix "%", default=41 — the Irish exit tax rate (editable for future-proofing)
   - "Run Projection" `v-btn` (colour primary, block)

4. On button click, convert all display percentages to decimals and emit the `run-projection` event with `ProjectionSettings`.

**Acceptance criteria:**
- Slider and input are reactive
- Emitted settings have inflation as decimal (e.g. `0.025` not `2.5`)
- Button is clearly visible

---

## Task 1.8 – Projection Results Table

**What:** Display the `YearRow[]` output in a data table.

**Steps:**

1. Create `src/components/ProjectionTable.vue`.

2. Props:
   ```typescript
   rows: YearRow[]
   ```

3. Use `v-data-table` with the following columns:
   | Header | Field | Format |
   |---|---|---|
   | Year | `year` | integer |
   | Total Wealth | `totalWealth` | € currency |
   | Δ Wealth | `wealthDelta` | € delta (green/red) |
   | Dividends | `dividends` | € currency |
   | Δ Dividends | `dividendsDelta` | € delta (green/red) |
   | Tax Paid | `taxPaid` | € currency (WHT + deemed disposal + income tax; CGT excluded) |
   | CGT Liability | `unrealisedCgt` | € currency (informational; shown in muted style) |
   | Div. Income Tax | `dividendIncomeTax` | € currency (show "—" if 0) |
   | Deemed Disposal Tax | `deemedDisposalTax` | € currency (show "—" if 0) |
   | Accum. Wealth | `accumWealth` | € currency |
   | Accum. Dividends | `accumDividends` | € currency |
   | Accum. Tax | `accumTaxPaid` | € currency |
   | Real Wealth | `realWealth` | € currency |

4. Use the `formatCurrency`, `formatDelta` composables from Task 1.5.

5. Delta columns: green text for positive values, red for negative.

6. Table should use `dense` variant for compact display. Disable pagination (show all rows).

7. Show nothing (or a placeholder) when `rows` is empty.

8. **Expandable rows for deemed disposal detail.** Use `show-expand` on the table with a custom expand toggle column:
   - Show a chevron icon button only when `deemedDisposalEvents.length > 0`; otherwise show a `—` placeholder in the expand column
   - The expanded row renders a nested table showing each `DeemedDisposalEvent`:
     | Asset | Lot purchased | Unrealised Gain | Tax Paid (41%) | Shares Sold |

**Acceptance criteria:**
- All columns render with correct formatting
- Delta colours are correct
- Deemed disposal tax column shows "—" for non-trigger years
- Expand chevron appears only on rows with deemed disposal events
- Expanded row shows per-lot breakdown with asset symbol, purchase year, gain, tax, and shares sold
- Table scrolls horizontally if needed on narrow viewports

---

## Task 1.9 – Projection Chart

**What:** Render a Chart.js line chart visualising the projection.

**Steps:**

1. Create `src/components/ProjectionChart.vue`.

2. Props:
   ```typescript
   rows: YearRow[]
   ```

3. Use `vue-chartjs` `Line` component.

4. Datasets (4 lines):
   | Dataset | Field | Colour | Style |
   |---|---|---|---|
   | Accumulated Wealth (Nominal) | `accumWealth` | blue (#1976D2) | solid |
   | Accumulated Wealth (Real) | `realWealth` | blue (#1976D2) | dashed |
   | Accumulated Dividends | `accumDividends` | green (#4CAF50) | solid |
   | Accumulated Tax Paid | `accumTaxPaid` | red (#F44336) | solid |

5. X-axis: `year` values. Y-axis: € values with `toLocaleString` for ticks.

6. Chart options:
   - Responsive: true
   - Maintain aspect ratio: true (16:9)
   - Tooltip: show all datasets at the hovered year
   - Legend: displayed at top
   - Y-axis: begin at zero
   - Interaction mode: `index` (all datasets at same x)

7. Chart should reactively update when `rows` prop changes.

**Acceptance criteria:**
- Chart renders all 4 lines
- Dashed line is visually distinct from solid lines
- Hovering shows tooltip with all values for that year
- Chart updates when new projection data arrives

---

## Task 1.10 – Home View Assembly

**What:** Wire all components together in the main view.

**Steps:**

1. In `src/views/HomeView.vue`:

2. Layout structure (top to bottom):
   ```
   AssetTable
     → "Add Asset" button triggers AssetFormDialog (create mode)
     → Edit action triggers AssetFormDialog (edit mode)
     → Delete action triggers confirmation dialog then store.deleteAsset()

   ProjectionControls
     → on "run-projection" → call runProjection(store.assets, settings)
     → store result in local ref projectionRows

   ProjectionTable :rows="projectionRows"

   ProjectionChart :rows="projectionRows"
   ```

3. State management:
   - `showFormDialog: boolean`
   - `editingAsset: Asset | null`
   - `projectionRows: YearRow[]`

4. When assets change (add/edit/delete), clear `projectionRows` to avoid stale data (user must re-run projection).

5. Add a `v-divider` between the asset management section and the projection section for visual separation.

**Acceptance criteria:**
- Full flow works: add asset → configure projection → run → see table + chart
- Editing an asset and re-running shows updated projections
- Deleting all assets clears the table and shows the empty state

---

## Task 1.11 – Validation & Manual Testing

**What:** Verify the projection engine against a known spreadsheet calculation.

**Steps:**

1. Create a test scenario:
   - 1 asset: "VWCE", 100 shares, buy price €100, current price €100
   - Dividend yield: 3%, dividend growth: 1%/yr
   - Price appreciation: 5%/yr
   - Withholding tax: 15%
   - CGT: 33%
   - Deemed disposal: enabled
   - Annual contribution: €1,200
   - Projection: 20 years, 2.5% inflation

2. Calculate years 1, 8, 9, 16, and 20 manually in a spreadsheet, paying specific attention to:
   - Year 8: deemed disposal triggers on the initial lot
   - Year 9: deemed disposal triggers on the year-1 contribution lot
   - Year 16: second deemed disposal cycle for the initial lot
   - Share counts after deemed disposal deductions

3. Compare spreadsheet values against the app's output. Accept ≤ €0.01 rounding differences.

4. Test edge cases in the UI:
   - Asset with 0 annual contribution (no new lots should be created)
   - All optional fields left empty (should default to 0)
   - Deemed disposal disabled (no deemed disposal tax in any year)
   - Very short projection (1 year)
   - Very long projection (50 years)

**Acceptance criteria:**
- Engine output matches spreadsheet within rounding tolerance
- All edge cases produce sensible results (no NaN, no negatives where impossible, no crashes)

---

## Task 1.12 – Unit Tests

**What:** Automated tests for the projection engine.

**Steps:**

1. Configure Vitest (should already be available from the Vue scaffolding, if not install it).

2. Create `src/services/__tests__/projectionEngine.test.ts`.

3. Write the following test cases:

   **Test 1 – Basic growth, no extras:**
   - 1 asset, 100 shares @ €100, 5% appreciation, 0% dividend, no tax, no deemed disposal, no contribution
   - 5 years
   - Assert: year 5 totalWealth ≈ 100 × 100 × 1.05^5

   **Test 2 – Dividend calculation with withholding tax:**
   - 1 asset, 100 shares @ €100, 0% appreciation, 3% yield, 0% growth, 15% withholding
   - 3 years
   - Assert: year 1 dividends = 100 × 100 × 0.03 × 0.85

   **Test 3 – Deemed disposal fires at year 8 and repeats every 8 years from last trigger:**
   - 1 asset, 100 shares @ €100, 5% appreciation, deemed disposal enabled, no contribution
   - 35 years
   - Assert: year 8 deemedDisposalTax > 0
   - Assert: year 16 deemedDisposalTax > 0
   - Assert: year 24 deemedDisposalTax > 0
   - Assert: year 32 deemedDisposalTax > 0
   - Assert: all other years deemedDisposalTax === 0
   - Assert: total shares decreases at each trigger year (shares sold to cover tax)
   - Assert: year 16 tax is calculated on gains since the year-8 reset price, NOT the original buy price. Specifically:
     - `costBase` after year 8 trigger = `sharePrice` at year 8
     - year 16 gain = `(sharePrice[16] - sharePrice[8]) × sharesAtYear16`
     - year 16 tax = that gain × 0.41
   - Assert: year 24 tax is calculated on gains since the year-16 reset price
   - Assert: year 32 tax is calculated on gains since the year-24 reset price

   **Test 4 – Annual contribution lots have independent 8-year cycles with repeated triggers:**
   - 1 asset, 100 shares @ €100, 5% appreciation, deemed disposal enabled, €1,200/yr contribution
   - 25 years
   - Assert: year 8 deemedDisposalTax > 0 (initial lot triggers)
   - Assert: year 9 deemedDisposalTax > 0 (year-1 contribution lot triggers)
   - Assert: year 10 deemedDisposalTax > 0 (year-2 contribution lot triggers)
   - Assert: year 16 deemedDisposalTax > 0 (initial lot triggers again, gain calculated since year-8 reset)
   - Assert: year 17 deemedDisposalTax > 0 (year-1 lot triggers again, gain since year-9 reset)
   - Assert: year 24 deemedDisposalTax > 0 (initial lot third cycle)
   - Assert: years with no lot triggering have deemedDisposalTax === 0 for that component

   **Test 5 – Inflation adjustment:**
   - 1 asset, 100 shares @ €100, 5% appreciation, inflation 2.5%
   - 10 years
   - Assert: realWealth < totalWealth for every year
   - Assert: realWealth[10] ≈ totalWealth[10] / 1.025^10

   **Test 6 – Edge case: empty assets:**
   - 0 assets, 20 years
   - Assert: returns empty array

   **Test 7 – Edge case: null optional fields:**
   - 1 asset with all optional fields as null, deemed disposal off, dripEnabled: false
   - 5 years
   - Assert: no errors, price flat, dividends (200/yr) accumulate in cash → `totalWealth ≈ 10000 + year × 200`

   **Test 8 – Deemed disposal with no gain produces no tax:**
   - 1 asset, 100 shares @ €100, 0% appreciation, deemed disposal enabled
   - 10 years
   - Assert: year 8 deemedDisposalTax === 0

   **Test 9 – DeemedDisposalEvent data is populated correctly:**
   - 1 asset, 100 shares @ €100, 5% appreciation, deemed disposal enabled, €1,200 annual contribution
   - 10 years
   - Assert: years 1–7 have `deemedDisposalEvents === []`
   - Assert: year 8 has exactly 1 event with `lotPurchaseYear === 0`, `gain > 0`, `taxAmount ≈ gain × 0.41`, `sharesReduced > 0`
   - Assert: year 9 has exactly 1 event with `lotPurchaseYear === 1` (year-1 contribution lot)

   **Test 10 – Dividend income tax reduces net take-home:**
   - 1 asset, 100 shares @ €100, 4% dividend yield, no WHT
   - `ProjectionSettings.dividendIncomeTaxRate = 0.40`
   - Assert: year 1 `dividends ≈ 400` (net after WHT, before income tax)
   - Assert: year 1 `dividendIncomeTax ≈ 160`
   - Assert: year 1 `taxPaid ≈ 160`
   - Assert: `dividendIncomeTax === 0` when rate is omitted from settings

   **Test 11 – Global CGT rate applies when per-asset rate is null:**
   - Asset with `cgtTaxRate: null`, `priceAppreciationPct: 0.05`
   - `ProjectionSettings.cgtTaxRate = 0.33`
   - Assert: year 5 `unrealisedCgt > 0` (global rate applied)
   - Assert: year 5 `taxPaid === 0` (CGT is informational, not in taxPaid)
   - Assert: asset with per-asset rate 0.20 has lower `unrealisedCgt` than asset using global rate 0.33

   **Test 12 – Custom deemed disposal tax rate is applied:**
   - 1 asset, 100 shares @ €100, 5% appreciation, deemed disposal enabled
   - `ProjectionSettings.deemedDisposalTaxRate = 0.30`
   - Assert: year 8 `deemedDisposalTax ≈ gain × 0.30`
   - Assert: lower than default 41% rate

   **Test 13 – DRIP creates new shares reflected in totalWealth:**
   - 1 asset, 100 shares @ €100, 4% dividend yield, 0% appreciation, `dripEnabled: true`, no WHT/income tax
   - Year 1: grossDividend = 400, takeHome = 400, dripShares = 4, totalShares = 104
   - Assert: `rows[0].totalWealth ≈ 104 × 100 = 10,400`
   - Assert: `rows[0].dividends ≈ 400` (income reporting unchanged)

   **Test 14 – Cash dividends accumulate in totalWealth:**
   - Same asset but `dripEnabled: false`
   - Year 1: takeHome = 400 → cashBalance = 400, totalWealth = 10,000 + 400 = 10,400
   - Year 2: takeHome = 400 → cashBalance = 800, totalWealth = 10,000 + 800 = 10,800
   - Assert: `rows[0].totalWealth ≈ 10,400`
   - Assert: `rows[1].totalWealth ≈ 10,800`

4. Run tests with `npm run test` and confirm all pass.

**Acceptance criteria:**
- All 14 tests pass
- Tests run in < 5 seconds
- `npm run test` exits with code 0
