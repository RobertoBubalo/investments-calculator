# Wealth Accumulation Simulator – Development Plan

## Tech Stack

**Frontend:** Vue 3 + Vuetify + Chart.js (or Recharts equivalent)
**Backend:** .NET 10 Web API + Entity Framework Core
**Database:** SQL Server (Azure SQL for prod)
**Auth:** ASP.NET Identity (cookie or JWT) – simple email/password to start
**Infra:** Azure App Service + Azure SQL, CI/CD via GitHub Actions

---

## Data Model

```
User
├── Id (guid)
├── Email
├── PasswordHash
└── CreatedAt

Portfolio
├── Id (guid)
├── UserId (FK)
├── Name
└── CreatedAt

Asset
├── Id (guid)
├── PortfolioId (FK)
├── Name
├── Symbol
├── Shares (decimal)
├── BuyPrice (decimal)
├── CurrentSharePrice (decimal)
├── CurrentValue (computed: Shares × CurrentSharePrice)
├── CgtTaxRate (decimal?, nullable)            — per-asset rate; null = use global fallback
├── WithholdingTaxRate (decimal?, nullable)
├── PriceAppreciationPct (decimal?, nullable)  — annual %
├── DividendYield (decimal)                    — current annual yield %
├── DividendGrowthPct (decimal?, nullable)     — annual %
├── DeemedDisposalEnabled (bool)               — Irish 8-year exit tax rule
├── DripEnabled (bool)                         — reinvest dividends as shares (true) or accumulate as cash (false)
├── AnnualContribution (decimal, default 0)    — recurring investment
└── CreatedAt / UpdatedAt

ProjectionSettings (per request)
├── Years (int)
├── InflationRate (decimal)
├── CgtTaxRate (decimal?, optional)            — global fallback CGT rate for assets with null per-asset rate
├── DividendIncomeTaxRate (decimal?, optional) — personal income tax on net dividends
└── DeemedDisposalTaxRate (decimal?, optional) — exit tax rate, defaults to 0.41
```

`CurrentValue` can be a computed column or a getter in the entity — no need to store it.

---

## Core Calculation Logic

All projection logic lives in a dedicated **service** (`ProjectionService`) so it's unit-testable independent of the API layer.

### Per-year loop (for year `y`, starting from year 0):

Each asset maintains an array of **ShareLots** (initial holding + annual contribution lots + DRIP lots). This is the core of the engine.

```
cashBalance = 0  // persists across years for non-DRIP assets
deemedDisposalRate = settings.deemedDisposalTaxRate ?? 0.41

For each asset (each year):
  a) sharePrice[y] = sharePrice[y-1] × (1 + priceAppreciationPct)
  b) if annualContribution > 0: push new lot { shares: contribution / sharePrice[y], costBase: sharePrice[y], purchaseYear: y }
  c) Deemed disposal: for each lot where (y - lot.purchaseYear) % 8 === 0 && yearsHeld > 0:
       gain = (sharePrice[y] - lot.costBase) × lot.shares
       if gain > 0: tax = gain × deemedDisposalRate; sell shares to cover; reset costBase
       else: reset costBase (no tax)
  d) dividendYield[y] = dividendYield[y-1] × (1 + dividendGrowthPct)
     grossDividend = totalSharesBeforeDrip × sharePrice[y] × dividendYield[y]
     whTax = grossDividend × withholdingTaxRate
     netDividend = grossDividend - whTax
     incomeTax = netDividend × dividendIncomeTaxRate
     takeHome = netDividend - incomeTax
  e) if dripEnabled && takeHome > 0: push new lot { shares: takeHome / sharePrice[y], costBase: sharePrice[y], purchaseYear: y }
     else: cashBalance += takeHome
  f) CGT (unrealised, informational): effectiveCgtRate = asset.cgtTaxRate ?? settings.cgtTaxRate ?? 0
     unrealisedCgt = Σ (sharePrice[y] - lot.costBase) × lot.shares × effectiveCgtRate  (for lots with gain > 0)
  g) portfolioValue = totalShares × sharePrice[y]  (all lots including DRIP)

Aggregate across all assets per year:
  portfolioWealth[y]     = Σ portfolioValue
  totalWealth[y]         = portfolioWealth[y] + cashBalance        ← cashBalance persists!
  totalDividends[y]      = Σ netDividend (after WHT, before income tax)
  totalTaxPaid[y]        = Σ (whTax + deemedTax + incomeTax)      ← CGT excluded!
  totalUnrealisedCgt[y]  = Σ unrealisedCgt                        ← informational only
  accumDividends[y]      = accumDividends[y-1] + totalDividends[y]
  accumTaxPaid[y]        = accumTaxPaid[y-1] + totalTaxPaid[y]    ← excludes CGT

Inflation-adjusted (real) values:
  realValue[y] = nominalValue[y] / (1 + inflationRate)^y
```

**Key design decisions:**
- CGT is informational (unrealised) — never included in `taxPaid` or `accumTaxPaid`
- Cash dividends (`dripEnabled: false`) accumulate in a running `cashBalance` added to `totalWealth`
- Each DRIP lot and contribution lot has its own independent 8-year deemed disposal cycle

---

## API Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/portfolios
POST   /api/portfolios
PUT    /api/portfolios/{id}
DELETE /api/portfolios/{id}

GET    /api/portfolios/{id}/assets
POST   /api/portfolios/{id}/assets
PUT    /api/assets/{id}
DELETE /api/assets/{id}

POST   /api/portfolios/{id}/projections
  Body: { years, inflationRate, annualContribution? }
  Returns: ProjectionResult (yearly breakdown array)
```

---

## Frontend Views

### 1. Auth
- Login / Register pages (minimal)

### 2. Portfolio Dashboard (`/portfolio`)
- List of assets as a Vuetify `v-data-table`
- Columns: Name, Symbol, Shares, Buy Price, Current Price, Current Value, Dividend Yield, Actions (edit/delete)
- "Add Asset" button → dialog/drawer form
- Edit inline or via dialog

### 3. Projection View (`/portfolio/projections`)
- Input controls at top: Years slider, Inflation % input, Additional annual investment input
- **Table** (`v-data-table`): one row per year with columns:
  | Year | Total Wealth | Δ Wealth | Dividends | Δ Dividends | Tax Paid | Accum. Wealth | Accum. Dividends | Accum. Tax | Real Value |
- **Chart** (Chart.js or similar): multi-line chart showing:
  - Accumulated wealth (nominal vs real)
  - Accumulated dividends
  - Accumulated tax paid
- Toggle between nominal and inflation-adjusted views

---

## Phased Delivery

### Phase 1 – POC ✅ COMPLETE
**Goal:** Prove the projection math works end-to-end in a single page.

**Delivered:**
- Vue 3 + Vuetify frontend-only app (no backend, no auth)
- Per-asset form with all fields including DRIP toggle and deemed disposal toggle
- Full projection engine in TypeScript: ShareLot model, deemed disposal per lot, DRIP/cash accumulation, configurable tax rates
- Projection table with expandable deemed disposal events, CGT liability column, dividend income tax column
- Chart.js projection chart (4 lines: nominal wealth, real wealth, dividends, tax paid)
- 14 unit tests (Vitest) covering all engine features
- Deployed to GitHub Pages: https://robertobubalo.github.io/investments-calculator/

**Key features implemented:**
- Irish 8-year deemed disposal (per lot, cost base reset, configurable rate, default 41%)
- Annual contributions → independent lots with own disposal cycles
- DRIP: take-home dividend → new ShareLot OR cash accumulation in totalWealth
- Global CGT fallback rate + per-asset override; CGT is informational (unrealisedCgt), excluded from taxPaid
- Dividend income tax (personal income tax on net dividends)
- Inflation adjustment (realWealth)

### Phase 2 – Architecture Talks (1 day)
**Goal:** Agree on final data model, API contract, and infra decisions.

- Finalise entity model and EF Core configuration
- Define OpenAPI spec for all endpoints
- Decide auth strategy (cookie vs JWT, refresh tokens?)
- Decide on price data source (manual entry only for now? or integrate a free API like Yahoo Finance later?)
- Decide deployment target (Azure App Service + Azure SQL)
- Solution structure: `WealthAccSim.Api`, `WealthAccSim.Core`, `WealthAccSim.Infrastructure`

### Phase 3 – MVP (1–2 weeks)
**Goal:** Full working app with persistence and auth.

- .NET 10 API with EF Core migrations
- ASP.NET Identity for auth (register/login/logout)
- CRUD endpoints for portfolios and assets
- `ProjectionService` moved to backend (returns structured JSON)
- Frontend wired to real API
- Portfolio dashboard with add/edit/delete
- Projection view with table + chart
- Basic error handling and loading states
- Deploy to Azure (App Service + Azure SQL)

### Phase 4 – V1 (1–2 weeks)
**Goal:** Polish, additional investment modelling, and UX refinements.

- Annual contribution field per asset + global contribution in projection settings
- Reinvestment toggle (auto-reinvest dividends into more shares)
- CGT and withholding tax fully integrated into projections
- Nominal vs inflation-adjusted toggle on chart and table
- Export projection data to CSV
- Input validation and edge-case handling (0 shares, negative rates, etc.)
- Unit tests for `ProjectionService`
- Integration tests for API endpoints
- CI/CD pipeline in GitHub Actions

---

## Future Ideas (Post-V1)
- Live price fetching (Yahoo Finance / Alpha Vantage API)
- Multi-currency support with FX conversion
- Dividend calendar view (expected payment dates)
- "What-if" scenario comparisons (side-by-side projections)
- Portfolio allocation pie chart
- Shared/public portfolio links
