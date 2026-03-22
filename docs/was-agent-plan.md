# Wealth Accumulation Simulator – Agent Implementation Plan

## Context

You are building a full-stack web application called **Wealth Accumulation Simulator**. It allows authenticated users to manage a portfolio of assets and run long-term wealth projection simulations with dividend growth, tax modelling, inflation adjustment, recurring investments, and Irish deemed disposal rules.

### Tech Stack
- **Frontend:** Vue 3 (Composition API + `<script setup>`) + Vuetify 3 + Chart.js
- **Backend:** .NET 10 Web API + Entity Framework Core
- **Database:** PostgreSQL (Docker for dev, Azure Database for PostgreSQL for prod)
- **Auth:** ASP.NET Identity with cookie auth
- **CI/CD:** GitHub Actions
- **Monorepo structure:**
  ```
  /src
    /api
      WealthAccSim.Api/          — ASP.NET controllers, program.cs, middleware
      WealthAccSim.Core/         — Domain entities, interfaces, ProjectionService
      WealthAccSim.Infrastructure/ — EF Core DbContext, migrations, repositories
      WealthAccSim.Tests/        — Unit + integration tests
    /web
      src/
        components/
        views/
        services/              — API client layer
        composables/           — shared logic (useProjection, useAuth, etc.)
        router/
        stores/                — Pinia stores
        types/
  ```

---

## Phase 1 – Projection Engine (Frontend-only POC)

**Goal:** Build the core calculation engine in TypeScript and prove it works with a hardcoded dataset, rendered in a table and chart. No backend, no auth, no persistence.

### 1.1 – Project scaffolding
- Scaffold a Vue 3 + Vite project in `/src/web`
- Install dependencies: `vuetify`, `chart.js`, `vue-chartjs`, `pinia`
- Configure Vuetify plugin, default light theme
- Create `App.vue` with a `v-app` shell and a single route `/`

### 1.2 – Type definitions
Create `src/types/index.ts` with these interfaces:

```typescript
interface Asset {
  id: string
  name: string
  symbol: string
  shares: number
  buyPrice: number
  currentSharePrice: number
  dividendYield: number              // annual %, e.g. 0.03 = 3%
  priceAppreciationPct: number | null
  dividendGrowthPct: number | null
  cgtTaxRate: number | null          // per-asset CGT rate; null = use global settings fallback
  withholdingTaxRate: number | null
  deemedDisposalEnabled: boolean
  dripEnabled: boolean               // true = reinvest dividends as shares; false = accumulate as cash
  annualContribution: number         // € per year
}

interface ProjectionSettings {
  years: number
  inflationRate: number              // e.g. 0.025 = 2.5%
  cgtTaxRate?: number                // global fallback CGT rate applied when per-asset rate is null
  dividendIncomeTaxRate?: number     // personal income tax on net dividends, e.g. 0.40
  deemedDisposalTaxRate?: number     // exit tax rate, defaults to 0.41
}

interface ShareLot {
  shares: number
  costBase: number
  purchaseYear: number
}

interface DeemedDisposalEvent {
  assetName: string
  assetSymbol: string
  lotPurchaseYear: number
  gain: number
  taxAmount: number
  sharesReduced: number
}

interface YearRow {
  year: number
  totalWealth: number                // portfolioWealth (all lots × price) + cashBalance
  wealthDelta: number
  dividends: number                  // net dividends after withholding tax
  dividendsDelta: number
  taxPaid: number                    // actual cash: WHT + deemed disposal + dividend income tax (CGT excluded)
  unrealisedCgt: number              // paper CGT liability if sold today — informational only, not in taxPaid
  dividendIncomeTax: number          // income tax on dividends (subset of taxPaid)
  deemedDisposalTax: number
  deemedDisposalEvents: DeemedDisposalEvent[]
  accumWealth: number
  accumDividends: number
  accumTaxPaid: number
  realWealth: number                 // inflation-adjusted
  realAccumDividends: number         // inflation-adjusted
}
```

### 1.3 – Projection engine
Create `src/services/projectionEngine.ts` containing a single pure function:

```typescript
function runProjection(assets: Asset[], settings: ProjectionSettings): YearRow[]
```

**Logic per asset per year (iterate year 1 → settings.years):**

1. **Share lots model.** Each asset maintains an array of `ShareLot` objects. The initial holding is lot index 0 (`{ shares: asset.shares, costBase: asset.buyPrice, purchaseYear: 0 }`).

2. **Price appreciation.** Calculate `sharePrice[y] = sharePrice[y-1] × (1 + priceAppreciationPct)`. If `priceAppreciationPct` is null, price stays flat.

3. **Annual contribution.** If `annualContribution > 0`, push a new lot: `{ shares: contribution / sharePrice[y], costBase: sharePrice[y], purchaseYear: y }`.

4. **Deemed disposal.** If `deemedDisposalEnabled`, iterate all lots. For each lot where `(y - lot.purchaseYear) > 0 && (y - lot.purchaseYear) % 8 === 0`:
   - `unrealisedGain = (sharePrice[y] - lot.costBase) × lot.shares`
   - `deemedTax = unrealisedGain × 0.41`
   - `sharesToSell = deemedTax / sharePrice[y]`
   - `lot.shares -= sharesToSell`
   - `lot.costBase = sharePrice[y]` (reset for next cycle)
   - Accumulate `deemedTax` into the year's tax total.

5. **Total shares.** Sum `lot.shares` across all lots for this asset.

6. **Dividends.** `dividendYield[y] = dividendYield[y-1] × (1 + dividendGrowthPct)`. Gross dividend = `totalShares × sharePrice[y] × dividendYield[y]`. Withholding tax = gross × `withholdingTaxRate`. Net dividend = gross − withholding tax.

7. **CGT (unrealised reference).** For each lot: `(sharePrice[y] - lot.costBase) × lot.shares × cgtTaxRate`. Sum across lots. This is informational only — no shares are sold.

8. **Portfolio value.** `totalShares × sharePrice[y]`.

**Per-asset steps (in order):**
1. Price appreciation
2. Annual contribution → new lot
3. Deemed disposal (rate = `settings.deemedDisposalTaxRate ?? 0.41`; cost base reset after each trigger)
4. Dividends on shares before any DRIP lot: gross → WHT → net → income tax → takeHome
5. DRIP: if `dripEnabled && takeHome > 0` → push new lot; else `cashBalance += takeHome` (persists across years)
6. CGT informational: `effectiveCgtRate = asset.cgtTaxRate ?? (settings.cgtTaxRate ?? 0)`; sum lotGain × rate across all lots
7. Portfolio value = totalShares × sharePrice

**Aggregation across all assets per year:**
- `portfolioWealth` = Σ portfolio values
- `totalWealth` = `portfolioWealth + cashBalance` (cashBalance persists and grows across years)
- `dividends` = Σ net dividends (after WHT, before income tax)
- `taxPaid` = Σ (whTax + deemedTax + incomeTax) — **CGT excluded** (informational only)
- `unrealisedCgt` = Σ cgtTax — paper liability, never included in taxPaid or accumTaxPaid
- `dividendIncomeTax` = Σ assetIncomeTax
- `deemedDisposalTax` = Σ deemed disposal taxes only
- `wealthDelta` = `totalWealth[y] - totalWealth[y-1]`
- `dividendsDelta` = `dividends[y] - dividends[y-1]`
- `accumWealth` = `totalWealth[y]` (inherently cumulative)
- `accumDividends` = `accumDividends[y-1] + dividends[y]`
- `accumTaxPaid` = `accumTaxPaid[y-1] + taxPaid[y]` (excludes CGT)
- `realWealth` = `totalWealth[y] / (1 + inflationRate)^y`
- `realAccumDividends` = `accumDividends[y] / (1 + inflationRate)^y`

**Edge cases to handle:**
- `priceAppreciationPct`, `dividendGrowthPct`, `cgtTaxRate`, `withholdingTaxRate` can be null — treat as 0.
- `shares` = 0 — skip asset.
- `annualContribution` = 0 — no new lots created.
- Deemed disposal on a lot with negative gain — tax is 0, not negative.

### 1.4 – Asset entry form
Create a view at `/` with:
- A Vuetify `v-data-table` showing all assets in local state (Pinia store)
- An "Add Asset" button opening a `v-dialog` with a form for all `Asset` fields
- Fields grouped: **Required** (name, symbol, shares, buy price, current price, dividend yield) and **Optional** (price appreciation, dividend growth, CGT rate, withholding rate, deemed disposal toggle, annual contribution)
- Edit action per row (same dialog, pre-filled)
- Delete action per row with confirmation

### 1.5 – Projection settings controls
Below the asset table, add a `v-card` with:
- `v-slider` for years (range 1–50, default 20)
- `v-text-field` for inflation rate (%, default 2.5)
- "Run Projection" button

### 1.6 – Projection results table
Render `YearRow[]` in a `v-data-table` with columns:
| Year | Total Wealth | Δ Wealth | Dividends | Δ Dividends | Tax Paid | Deemed Disposal Tax | Accum. Wealth | Accum. Dividends | Accum. Tax | Real Wealth |

Rows with `deemedDisposalEvents.length > 0` are expandable. Clicking the chevron reveals a nested table showing per-lot breakdown: asset symbol, lot purchase year, unrealised gain, tax paid (41%), and shares sold.

Format all currency values with `€` and 2 decimal places. Format deltas with `+`/`-` prefix and colour (green/red).

### 1.7 – Projection chart
Below the table, render a Chart.js line chart with these datasets:
- Accumulated Wealth (nominal) — solid line
- Accumulated Wealth (real) — dashed line
- Accumulated Dividends — solid line
- Accumulated Tax Paid — solid line

X-axis: Year. Y-axis: €. Include a legend and tooltip.

### 1.8 – Validation & testing
- Prepare a known test case (e.g. 1 asset, €10,000, 5% growth, 3% yield, 1% dividend growth, 20% withholding, deemed disposal on, €1,200/yr contribution, 2.5% inflation, 20 years) and verify against a manual spreadsheet.
- 14 unit tests (Vitest) covering all engine features: basic growth, deemed disposal, annual contributions, inflation, DRIP, cash accumulation, CGT, dividend income tax, configurable deemed disposal rate, edge cases.

**Phase 1 deliverable:** ✅ COMPLETE — A single-page app deployed to GitHub Pages at https://robertobubalo.github.io/investments-calculator/. All-in-memory, no backend. Full projection engine with all tax features, DRIP/cash model, 14 passing tests.

---

## Phase 2 – Backend API

**Goal:** Build the .NET 10 API with auth, CRUD, and the projection endpoint. No frontend integration yet — test via Swagger/HTTP files.

### 2.1 – Solution scaffolding
- Create solution file `WealthAccSim.sln` in `/src/api`
- Create three projects:
  - `WealthAccSim.Api` (web API, references Core + Infrastructure)
  - `WealthAccSim.Core` (class library, no external dependencies)
  - `WealthAccSim.Infrastructure` (class library, references Core, depends on EF Core + Identity)
- `WealthAccSim.Tests` (xUnit, references all three)
- Configure `appsettings.json` with connection string for local PostgreSQL (Docker)
- Add `Program.cs` with service registration, CORS (allow `http://localhost:5173`), Swagger

### 2.2 – Domain entities (`WealthAccSim.Core`)
Create entity classes:

```csharp
public class Portfolio
{
    public Guid Id { get; set; }
    public string UserId { get; set; }     // FK to Identity user
    public string Name { get; set; }
    public DateTime CreatedAt { get; set; }
    public ICollection<Asset> Assets { get; set; }
}

public class Asset
{
    public Guid Id { get; set; }
    public Guid PortfolioId { get; set; }
    public string Name { get; set; }
    public string Symbol { get; set; }
    public decimal Shares { get; set; }
    public decimal BuyPrice { get; set; }
    public decimal CurrentSharePrice { get; set; }
    public decimal DividendYield { get; set; }
    public decimal? PriceAppreciationPct { get; set; }
    public decimal? DividendGrowthPct { get; set; }
    public decimal? CgtTaxRate { get; set; }
    public decimal? WithholdingTaxRate { get; set; }
    public bool DeemedDisposalEnabled { get; set; }
    public bool DripEnabled { get; set; }   // true = reinvest dividends as shares; false = accumulate as cash
    public decimal AnnualContribution { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Portfolio Portfolio { get; set; }
}
```

Create interfaces:
```csharp
public interface IPortfolioRepository
{
    Task<Portfolio?> GetByIdAsync(Guid id, string userId);
    Task<List<Portfolio>> GetAllAsync(string userId);
    Task<Portfolio> CreateAsync(Portfolio portfolio);
    Task UpdateAsync(Portfolio portfolio);
    Task DeleteAsync(Guid id, string userId);
}

public interface IAssetRepository
{
    Task<Asset?> GetByIdAsync(Guid id);
    Task<List<Asset>> GetByPortfolioIdAsync(Guid portfolioId);
    Task<Asset> CreateAsync(Asset asset);
    Task UpdateAsync(Asset asset);
    Task DeleteAsync(Guid id);
}
```

### 2.3 – ProjectionService (`WealthAccSim.Core`)
Port the TypeScript projection engine to C#. Same logic, same lot-based model.

```csharp
public class ProjectionService
{
    public List<YearRow> Run(List<Asset> assets, ProjectionSettings settings);
}
```

This class has zero dependencies — pure computation. Make it easily unit-testable.

### 2.4 – Infrastructure (`WealthAccSim.Infrastructure`)
- `AppDbContext` inheriting `IdentityDbContext` with `DbSet<Portfolio>` and `DbSet<Asset>`
- Configure Npgsql provider (`UseNpgsql`) in service registration
- Entity configurations via `IEntityTypeConfiguration<T>`:
  - `Asset.PortfolioId` FK with `DeleteBehavior.Cascade`
  - `Portfolio.UserId` FK with `DeleteBehavior.Restrict`
  - Decimal precision: `(18, 6)` for rates/percentages, `(18, 2)` for currency values
- Repository implementations for `IPortfolioRepository` and `IAssetRepository`
- Initial EF Core migration

### 2.5 – Auth endpoints (`WealthAccSim.Api`)
Use ASP.NET Identity with cookie auth. Minimal endpoints:

```
POST /api/auth/register  — Body: { email, password } → 200 + set cookie
POST /api/auth/login     — Body: { email, password } → 200 + set cookie
POST /api/auth/logout    — → 200 + clear cookie
GET  /api/auth/me        — → { email } or 401
```

Configure Identity:
- Require confirmed email: **false** (simplify for now)
- Password: minimum 8 chars, require digit + uppercase
- Cookie: `HttpOnly`, `SameSite=Lax`, sliding expiry 30 days

### 2.6 – Portfolio CRUD endpoints
All endpoints require `[Authorize]`. Extract `userId` from `HttpContext.User`.

```
GET    /api/portfolios                    → List<PortfolioDto>
POST   /api/portfolios                    → PortfolioDto (body: { name })
PUT    /api/portfolios/{id}               → PortfolioDto (body: { name })
DELETE /api/portfolios/{id}               → 204
```

Ensure all queries are scoped to the authenticated user's ID. Return 404 if portfolio belongs to a different user.

### 2.7 – Asset CRUD endpoints
```
GET    /api/portfolios/{portfolioId}/assets       → List<AssetDto>
POST   /api/portfolios/{portfolioId}/assets       → AssetDto (body: CreateAssetDto)
PUT    /api/assets/{id}                           → AssetDto (body: UpdateAssetDto)
DELETE /api/assets/{id}                           → 204
```

Validate that the parent portfolio belongs to the authenticated user.

### 2.8 – Projection endpoint
```
POST /api/portfolios/{portfolioId}/projections
Body: { years: int, inflationRate: decimal }
Response: { rows: YearRow[] }
```

Loads all assets for the portfolio, passes them to `ProjectionService.Run()`, returns the result. No data is persisted — this is a stateless computation.

### 2.9 – DTOs and mapping
Create request/response DTOs for all endpoints. Do not expose domain entities directly. Map with manual mapping methods (no AutoMapper — keep it simple).

### 2.10 – Tests
- **Unit tests for `ProjectionService`:** Same test cases as Phase 1 TypeScript tests. Verify identical results.
- **Unit tests for repositories:** Use Npgsql in-memory or Testcontainers for PostgreSQL.
- **Integration tests:** Use `WebApplicationFactory<Program>` to test auth flow and CRUD endpoints end-to-end.

**Phase 2 deliverable:** A fully functional API testable via Swagger at `https://localhost:5001/swagger`. Auth works, CRUD works, projection endpoint returns correct data.

---

## Phase 3 – Frontend Integration

**Goal:** Wire the Vue frontend to the real API. Add auth pages, replace local state with API calls, and make the full flow work end-to-end.

### 3.1 – API client layer
Create `src/services/api.ts`:
- Base URL configurable via env var (`VITE_API_BASE_URL`)
- All requests include `credentials: 'include'` for cookie auth
- Generic error handling (401 → redirect to login, 500 → toast notification)
- Methods mapping 1:1 to API endpoints:
  ```typescript
  auth.register(email, password)
  auth.login(email, password)
  auth.logout()
  auth.me()
  portfolios.list()
  portfolios.create(name)
  portfolios.update(id, name)
  portfolios.delete(id)
  assets.list(portfolioId)
  assets.create(portfolioId, data)
  assets.update(id, data)
  assets.delete(id)
  projections.run(portfolioId, settings)
  ```

### 3.2 – Auth store and pages
- Create Pinia `useAuthStore` with state: `{ user: { email } | null, loading: boolean }`
- Actions: `login()`, `register()`, `logout()`, `fetchUser()` (calls `/auth/me` on app init)
- Create `/login` and `/register` views with simple Vuetify forms (email + password)
- Add Vue Router navigation guard: if not authenticated, redirect to `/login`

### 3.3 – Portfolio store and view
- Create Pinia `usePortfolioStore`
- Add `/portfolios` view listing all portfolios with create/rename/delete actions
- Add `/portfolios/:id` view which becomes the main dashboard (asset table from Phase 1)

### 3.4 – Rewire asset management
- Replace in-memory Pinia asset store with API calls
- Asset table on `/portfolios/:id` fetches from `assets.list(portfolioId)`
- Add/edit/delete dialogs call the API, then refresh the table
- Loading and error states on all actions

### 3.5 – Rewire projection
- "Run Projection" now calls `projections.run(portfolioId, settings)` instead of local engine
- Keep the same table and chart rendering from Phase 1
- Add a loading spinner during the API call
- Optionally keep the client-side engine for instant preview (toggle: "Live preview" vs "Server calculation")

### 3.6 – Navigation and layout
- Add a `v-navigation-drawer` or `v-app-bar` with:
  - App name: "Wealth Accumulation Simulator"
  - Portfolio selector (dropdown or link to `/portfolios`)
  - User email + logout button
- Routes:
  ```
  /login
  /register
  /portfolios
  /portfolios/:id          — asset management
  /portfolios/:id/projections — projection table + chart
  ```

### 3.7 – Polish
- Toast notifications for success/error on CRUD actions (use Vuetify `v-snackbar`)
- Confirmation dialogs on delete actions
- Form validation (required fields, numeric ranges, non-negative values)
- Empty states ("No assets yet — add your first asset")

**Phase 3 deliverable:** Fully integrated app. User can register, log in, create a portfolio, add assets, run projections, and see results in table + chart form.

---

## Phase 4 – Production Readiness

**Goal:** Testing, CI/CD, deployment, and final features.

### 4.1 – CSV export
- Add an "Export CSV" button on the projection view
- Generate CSV client-side from `YearRow[]` using Papaparse
- Filename: `{portfolio-name}-projection-{date}.csv`

### 4.2 – Nominal vs Real toggle
- Add a `v-switch` on the projection view: "Show inflation-adjusted values"
- When toggled on, the table and chart display real values instead of nominal
- Chart shows both lines simultaneously with clear labelling

### 4.3 – Backend tests (expand)
- Add edge-case tests: 0 shares, null optional fields, very long projections (50 years), deemed disposal with no gain (no tax)
- Add auth integration tests: register → login → CRUD → logout → 401

### 4.4 – Frontend tests
- Unit tests for `projectionEngine.ts` (if retained client-side)
- Component tests for the asset form (validation rules fire correctly)

### 4.5 – GitHub Actions CI/CD
Create `.github/workflows/ci.yml`:

**On push to `main` and on PRs:**
```yaml
jobs:
  api:
    - checkout
    - setup .NET 10
    - dotnet restore
    - dotnet build
    - dotnet test --collect:"XPlat Code Coverage"
    - (on main only) dotnet publish → deploy to Azure App Service

  web:
    - checkout
    - setup Node 22
    - npm ci
    - npm run lint
    - npm run type-check
    - npm run test (Vitest)
    - npm run build
    - (on main only) deploy to Azure Static Web Apps or App Service
```

### 4.6 – Azure deployment
- **API:** Azure App Service (Linux, .NET 10)
- **Database:** Azure Database for PostgreSQL (Flexible Server, Burstable tier for start)
- **Frontend:** Azure Static Web Apps or a second App Service
- **Secrets:** Connection strings and Identity config via App Service Configuration (not in code)
- **CORS:** Configure API to allow the frontend domain only

### 4.7 – Final review checklist
- [ ] All CRUD operations work with auth
- [ ] Projection engine produces correct results (verified against spreadsheet)
- [ ] Deemed disposal fires correctly at 8-year intervals per lot
- [ ] Annual contributions create independent lots with their own deemed disposal cycles
- [ ] Inflation adjustment works on all applicable columns
- [ ] CSV export matches table data
- [ ] No API endpoint is accessible without authentication
- [ ] Portfolio queries are scoped to the authenticated user
- [ ] CI pipeline passes on all PRs
- [ ] Deployed and accessible via HTTPS

**Phase 4 deliverable:** Production-deployed application with CI/CD, test coverage, and all features complete.
