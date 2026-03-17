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
├── CgtTaxRate (decimal?, nullable)
├── WithholdingTaxRate (decimal?, nullable)
├── PriceAppreciationPct (decimal?, nullable)  — annual %
├── DividendYield (decimal)                    — current annual yield %
├── DividendGrowthPct (decimal?, nullable)     — annual %
├── AnnualContribution (decimal?, default 0)   — recurring investment
└── CreatedAt / UpdatedAt

ProjectionSettings (per portfolio or per request)
├── Years (int)
├── InflationRate (decimal)
└── AnnualContribution (decimal)
```

`CurrentValue` can be a computed column or a getter in the entity — no need to store it.

---

## Core Calculation Logic

All projection logic lives in a dedicated **service** (`ProjectionService`) so it's unit-testable independent of the API layer.

### Per-year loop (for year `y`, starting from year 0):

```
For each asset:
  sharePrice[y]    = sharePrice[y-1] × (1 + priceAppreciationPct)
  shares[y]        = shares[y-1] + (annualContribution / sharePrice[y])
  portfolioValue[y]= shares[y] × sharePrice[y]
  grossDividend[y] = shares[y] × sharePrice[y] × dividendYield[y]
  dividendYield[y] = dividendYield[y-1] × (1 + dividendGrowthPct)
  whTax[y]         = grossDividend[y] × withholdingTaxRate
  netDividend[y]   = grossDividend[y] - whTax[y]
  capitalGain[y]   = (sharePrice[y] - buyPrice) × shares[y]
  cgtTax[y]        = capitalGain[y] × cgtTaxRate  (unrealised, for reference)

Aggregate across all assets per year:
  totalWealth[y]         = Σ portfolioValue[y]
  totalDividends[y]      = Σ netDividend[y]
  totalTaxPaid[y]        = Σ (whTax[y] + cgtTax[y])
  accumWealth[y]         = totalWealth[y]  (already cumulative by nature)
  accumDividends[y]      = accumDividends[y-1] + totalDividends[y]
  accumTaxPaid[y]        = accumTaxPaid[y-1] + totalTaxPaid[y]

Inflation-adjusted (real) values:
  realValue[y] = nominalValue[y] / (1 + inflationRate)^y
```

### Reinvestment / additional contribution handling:

The `annualContribution` field on each asset (or a global one in `ProjectionSettings`) gets converted to additional shares each year at that year's share price, compounding into subsequent years.

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

### Phase 1 – POC (1–2 days)
**Goal:** Prove the projection math works end-to-end in a single page.

- Hardcoded asset data (no backend, no auth)
- Vue 3 + Vuetify single-page app
- Manual asset entry form → local state (no persistence)
- `ProjectionService` logic implemented in TypeScript on the frontend
- Render projection table + a basic Chart.js line chart
- Validate the math against a spreadsheet

**Deliverable:** A working calculator you can demo with fake data.

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
