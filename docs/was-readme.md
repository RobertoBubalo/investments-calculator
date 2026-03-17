# Wealth Accumulation Simulator

A full-stack web application for tracking and projecting dividend-based wealth accumulation. Supports price appreciation, dividend growth, recurring investments, dividend reinvestment (DRIP), Irish deemed disposal tax rules, and inflation adjustment.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (Composition API) + Vuetify 3 + Chart.js |
| Backend | .NET 10 Web API + Entity Framework Core |
| Database | PostgreSQL 17 |
| Auth | ASP.NET Identity (cookie-based) |
| CI/CD | GitHub Actions → Azure |

## Repository Structure

```
/src
  /api
    WealthAccSim.Api/              — Controllers, Program.cs, middleware
    WealthAccSim.Core/             — Entities, DTOs, interfaces, ProjectionService
    WealthAccSim.Infrastructure/   — EF Core DbContext, migrations, repositories
    WealthAccSim.Tests/            — Unit + integration tests (xUnit)
    docker-compose.yml             — Local PostgreSQL
  /web
    src/
      components/                  — AssetTable, AssetFormDialog, ProjectionTable, ProjectionChart
      composables/                 — useFormatters, useExportCsv
      services/                    — API client, projectionEngine (TS)
      stores/                      — Pinia stores (auth, portfolio, assets, snackbar)
      types/                       — TypeScript interfaces (domain + API DTOs)
      views/                       — Login, Register, Portfolios, PortfolioDetail, Projections
      router/
.github/
  workflows/
    ci.yml                         — Lint, type-check, test, build (both stacks)
    deploy.yml                     — Deploy to Azure on main
```

## Prerequisites

- .NET 10 SDK
- Node.js 22+
- Docker

## Local Development

```bash
# 1. Start PostgreSQL
cd src/api && docker compose up -d

# 2. Start the API (auto-migrates and seeds in dev)
cd WealthAccSim.Api && dotnet run

# 3. Start the frontend (in a separate terminal)
cd src/web && npm install && npm run dev
```

Open http://localhost:5173 and log in with the seeded demo account: `demo@test.com` / `Demo1234`.

## Running Tests

```bash
# Backend (requires Docker for Testcontainers)
cd src/api && dotnet test

# Frontend
cd src/web && npm run test
```

## Key Features

**Portfolio management** — Create portfolios, add/edit/delete assets with share count, buy price, current price, dividend yield, and optional tax rates.

**Projection engine** — Runs a year-by-year simulation across all assets factoring in price appreciation, dividend growth, withholding tax, CGT (unrealised), annual contributions, and dividend reinvestment. Each of these generates independent share lots that compound correctly.

**Irish deemed disposal** — Optional per-asset toggle. Applies 41% exit tax on unrealised gains every 8 years from each lot's purchase date. Each annual contribution and reinvested dividend creates an independent lot with its own 8-year cycle. Cost base resets after each trigger. Disposal years are expandable in the projection table to show a per-lot breakdown (asset, lot purchase year, unrealised gain, tax paid, shares sold).

**Inflation adjustment** — Inject a custom inflation rate to see all projections in today's money. Toggle between nominal and real values in both the table and chart.

**CSV export** — Download the full projection table as a CSV file.

## Implementation Plan

The project is structured into four phases, each with detailed task breakdowns and acceptance criteria:

| Phase | Focus | Tasks |
|---|---|---|
| 1 | Frontend-only POC — projection engine, table, chart | 12 |
| 2 | Backend API — .NET 10, PostgreSQL, auth, CRUD, projections | 14 |
| 3 | Frontend integration — wire Vue to API, auth pages, stores | 14 |
| 4 | Production — CI/CD, Azure deployment, testing, polish | 12 |

Refer to the individual phase documents for step-by-step instructions.

## API Endpoints

```
Auth
  POST   /api/auth/register          — Create account
  POST   /api/auth/login             — Sign in
  POST   /api/auth/logout            — Sign out
  GET    /api/auth/me                — Current user

Portfolios
  GET    /api/portfolios             — List portfolios
  POST   /api/portfolios             — Create portfolio
  PUT    /api/portfolios/{id}        — Rename portfolio
  DELETE /api/portfolios/{id}        — Delete portfolio + assets

Assets
  GET    /api/portfolios/{id}/assets — List assets
  POST   /api/portfolios/{id}/assets — Add asset
  PUT    /api/assets/{id}            — Update asset
  DELETE /api/assets/{id}            — Delete asset

Projections
  POST   /api/portfolios/{id}/projections — Run projection (stateless)
         Body: { years, inflationRate }
```

All endpoints (except auth) require an authenticated session. All percentage/rate values are transmitted as decimals (e.g. `0.03` for 3%).

## Deployment

Production targets Azure: App Service (API), Static Web Apps (frontend), Database for PostgreSQL Flexible Server. CI/CD via GitHub Actions — CI runs on all PRs, deployment triggers on merge to `main`. See the Phase 4 plan for full Azure setup instructions.
