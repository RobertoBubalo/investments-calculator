# Phase 4 – Production Readiness

**Goal:** Polish the application, add remaining features (CSV export, nominal/real toggle, dividend reinvestment), expand test coverage, set up CI/CD via GitHub Actions, and deploy to Azure.

**Deliverable:** A production-deployed, CI/CD-backed application accessible via HTTPS with full test coverage and all features complete.

**Prerequisites:** Phase 3 complete — fully integrated app with auth, CRUD, projections working end-to-end.

---

## Task 4.1 – Nominal vs Real Toggle

**What:** Add a toggle on the projection view that switches the table and chart between nominal and inflation-adjusted values.

**Steps:**

1. Add state to `src/views/ProjectionsView.vue`:
   ```typescript
   const showReal = ref(false)
   ```

2. Add a `v-switch` above the table:
   ```vue
   <v-switch
     v-model="showReal"
     label="Show inflation-adjusted values"
     color="primary"
     hide-details
     density="compact"
   />
   ```

3. Update `ProjectionTable.vue`:

   a) Add a new prop:
   ```typescript
   const props = defineProps<{
     rows: YearRowDto[]
     showReal: boolean
   }>()
   ```

   b) Create a computed that maps rows based on the toggle:
   ```typescript
   const displayRows = computed(() => {
     if (!props.showReal) return props.rows
     return props.rows.map(row => ({
       ...row,
       totalWealth: row.realWealth,
       accumWealth: row.realWealth,
       accumDividends: row.realAccumDividends,
       // Deltas need recalculation against real values
       wealthDelta: row.realWealth - (prev?.realWealth ?? 0),
     }))
   })
   ```

   c) When `showReal` is true, hide the "Real Wealth" column (it would be redundant). Show a subtle banner above the table: "Values shown in today's money (adjusted for {{ inflationRate }}% inflation)."

4. Update `ProjectionChart.vue`:

   a) Add the same `showReal` prop.

   b) When `showReal` is false (default), show all 4 lines as in Phase 1:
      - Accumulated Wealth (Nominal) — solid blue
      - Accumulated Wealth (Real) — dashed blue
      - Accumulated Dividends — solid green
      - Accumulated Tax Paid — solid red

   c) When `showReal` is true, swap the lines:
      - Accumulated Wealth (Real) — solid blue (promoted to primary)
      - Accumulated Wealth (Nominal) — dashed blue (demoted to reference)
      - Accumulated Dividends (Real) — solid green
      - Accumulated Tax Paid — solid red (unchanged, tax is always nominal)

   d) Update the legend labels to reflect which view is active (e.g. "Wealth (real)" vs "Wealth (nominal)").

5. Pass `showReal` from `ProjectionsView` to both `ProjectionTable` and `ProjectionChart`.

**Acceptance criteria:**
- Toggle is visible above the table
- Table values swap immediately on toggle (no re-fetch)
- Chart lines swap emphasis on toggle
- "Real Wealth" column hides when toggle is on (to avoid duplication)
- Banner text reflects the inflation rate used in the current projection

---

## Task 4.2 – CSV Export

**What:** Export the projection table data to a CSV file.

**Steps:**

1. Install Papaparse in the frontend:
   ```bash
   npm install papaparse
   npm install -D @types/papaparse
   ```

2. Create `src/composables/useExportCsv.ts`:
   ```typescript
   import Papa from 'papaparse'

   export function useExportCsv() {
     function exportProjection(
       rows: YearRowDto[],
       portfolioName: string,
       showReal: boolean
     ) {
       const headers = [
         'Year',
         'Total Wealth',
         'Wealth Change',
         'Dividends',
         'Dividends Change',
         'Tax Paid',
         'Deemed Disposal Tax',
         'Accumulated Wealth',
         'Accumulated Dividends',
         'Accumulated Tax',
         'Real Wealth',
         'Real Accumulated Dividends',
       ]

       const data = rows.map(row => [
         row.year,
         row.totalWealth.toFixed(2),
         row.wealthDelta.toFixed(2),
         row.dividends.toFixed(2),
         row.dividendsDelta.toFixed(2),
         row.taxPaid.toFixed(2),
         row.deemedDisposalTax.toFixed(2),
         row.accumWealth.toFixed(2),
         row.accumDividends.toFixed(2),
         row.accumTaxPaid.toFixed(2),
         row.realWealth.toFixed(2),
         row.realAccumDividends.toFixed(2),
       ])

       const csv = Papa.unparse({ fields: headers, data })
       const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
       const url = URL.createObjectURL(blob)

       const date = new Date().toISOString().split('T')[0]
       const filename = `${portfolioName}-projection-${date}.csv`

       const link = document.createElement('a')
       link.href = url
       link.download = filename
       link.click()
       URL.revokeObjectURL(url)
     }

     return { exportProjection }
   }
   ```

3. Add an "Export CSV" button in `ProjectionsView.vue`:
   - Place it next to the `v-switch` toggle, aligned right
   - Icon: `mdi-download`
   - Variant: `outlined`
   - Disabled when `projectionRows` is empty
   - On click, call `exportProjection(projectionRows, portfolioName, showReal)`

4. If `showReal` is true, the export should include a note row at the top: `"Values adjusted for X% annual inflation"`. Implement by prepending a row to the data array before unparsing.

5. All monetary values formatted to 2 decimal places in the CSV.

**Acceptance criteria:**
- Clicking "Export CSV" downloads a `.csv` file
- Filename follows pattern: `{portfolio-name}-projection-{YYYY-MM-DD}.csv`
- CSV opens correctly in Excel/Google Sheets with proper column alignment
- All 12 columns present with headers
- Monetary values have 2 decimal places
- Button is disabled when no projection has been run
- Inflation note row included when showing real values

---

## Task 4.3 – Dividend Reinvestment (DRIP) Toggle ✅ DONE (Frontend)

**Status:** Fully implemented in the frontend (Phase 1 POC). Backend still pending.

**What was implemented:**

The `dripEnabled: boolean` field was added to the `Asset` type. The `AssetFormDialog` includes a "Reinvest dividends (DRIP)" toggle in the Advanced section. The projection engine implements the full DRIP/cash model:

- **DRIP on:** take-home dividend (after WHT and income tax) buys a new `ShareLot` each year at the current share price. The lot compounds naturally and participates in future deemed disposal cycles.
- **DRIP off:** take-home dividend accumulates in a running `cashBalance` that is added to `totalWealth` each year.

Both paths report the same `dividends` value (income is income regardless of where it goes).

**Remaining backend work:**

1. Add `DripEnabled bool` to the C# `Asset` entity and all DTOs.
2. Create EF migration: `dotnet ef migrations add AddDripEnabled`.
3. Port DRIP/cash logic into `ProjectionService`:
   ```csharp
   decimal cashBalance = 0m;  // persists across the year loop

   // Per asset per year, after dividend calculation:
   if (asset.DripEnabled && takeHome > 0)
     simState.Lots.Add(new ShareLot { Shares = takeHome / simState.SharePrice, CostBase = simState.SharePrice, PurchaseYear = y })
   else
     cashBalance += takeHome;

   // After asset loop:
   var totalWealth = portfolioWealth + cashBalance;
   ```
4. Update `ProjectionRequestDto` to include `DividendIncomeTaxRate?` and `DeemedDisposalTaxRate?`.

**Frontend tests (already passing):**
- Test 13: DRIP creates 4 new shares, totalWealth ≈ 10,400
- Test 14: Cash dividends accumulate — year 1 = 10,400, year 2 = 10,800

**Acceptance criteria (pending backend):**
- Backend `DripEnabled` field persists and round-trips through API
- C# engine produces identical results to TypeScript engine for DRIP and non-DRIP scenarios
- Migration applies cleanly (default `false`, non-breaking)

---

## Task 4.4 – Input Validation Hardening

**What:** Tighten validation across frontend and backend to handle edge cases.

**Steps:**

1. **Frontend form validation** — update `AssetFormDialog.vue`:

   a) Add Vuetify `:rules` to all numeric fields:
   ```typescript
   const positiveNumber = [(v: number) => v >= 0 || 'Must be 0 or greater']
   const requiredPositive = [
     (v: any) => v !== null && v !== '' || 'Required',
     (v: number) => v >= 0 || 'Must be 0 or greater',
   ]
   const percentRange = [
     (v: any) => v === null || v === '' || (v >= 0 && v <= 100) || 'Must be between 0 and 100',
   ]
   ```

   b) Disable the "Save" button until the form is valid (`v-form` ref's `validate()` method).

   c) Prevent submission of NaN values — if a user clears a numeric field and it becomes empty string, convert to `0` or `null` (for optional fields) before sending to API.

2. **Frontend projection controls** — update `ProjectionControls.vue`:
   - Years: enforce integer (no decimals) via `:step="1"` and input filtering
   - Inflation: enforce range 0–30%

3. **Backend validation** — review and tighten:

   a) Add a custom validation attribute for optional percentage fields:
   ```csharp
   public class OptionalRangeAttribute : ValidationAttribute
   {
       // Allows null, but if present must be within range
   }
   ```

   b) Add model-level validation to `ProjectionRequestDto`:
   ```csharp
   public record ProjectionRequestDto(
       [Range(1, 50)] int Years,
       [Range(0, 0.5)] decimal InflationRate  // max 50% inflation
   );
   ```

   c) Verify all controller actions return meaningful error messages for validation failures. Test with:
   - Empty name → "Name is required"
   - Negative shares → "Shares must be 0 or greater"
   - Dividend yield > 1 → "Dividend yield must be between 0 and 1"

4. **Edge case: very large numbers.**
   - If `annualContribution` is extremely large relative to share price (e.g. €1,000,000/yr on a €1 share), the lot array grows large. Add a guard: if lot count exceeds 200 (50 years × 4 possible lot sources per year), log a warning but don't crash.
   - In the projection engine, if any computed value exceeds `decimal.MaxValue` (or `Number.MAX_SAFE_INTEGER` in TS), cap it and note the overflow.

**Acceptance criteria:**
- All form fields have appropriate validation rules
- Invalid forms cannot be submitted
- Backend rejects invalid input with descriptive 400 errors
- No NaN or undefined values reach the API
- Large numbers don't crash the engine

---

## Task 4.5 – Backend Test Expansion

**What:** Expand unit and integration test coverage for edge cases and the new reinvestment feature.

**Steps:**

1. **Projection service — additional tests in `ProjectionServiceTests.cs`:**

   **Test 11 – Dividend reinvestment compounding:**
   - Already defined in Task 4.3 step 4.

   **Test 12 – Reinvestment lots subject to deemed disposal:**
   - Already defined in Task 4.3 step 4.

   **Test 13 – All features combined:**
   - 1 asset with all features enabled: price appreciation, dividend growth, withholding tax, CGT, deemed disposal, annual contribution, dividend reinvestment
   - 20 years, 2.5% inflation
   - Assert: no NaN, no negative shares, no negative tax
   - Assert: accumWealth is non-decreasing (barring deemed disposal years)
   - Assert: accumDividends is strictly increasing
   - Assert: accumTaxPaid is non-decreasing

   **Test 14 – Multiple assets with mixed settings:**
   - 3 assets: one with deemed disposal, one with reinvestment, one plain
   - 15 years
   - Assert: totals correctly aggregate across all assets
   - Assert: deemed disposal only affects the asset with it enabled
   - Assert: reinvestment only affects the asset with it enabled

   **Test 15 – Zero shares asset is skipped:**
   - 2 assets: one with 100 shares, one with 0 shares
   - 5 years
   - Assert: result is identical to running with just the 100-share asset

   **Test 16 – Maximum projection length:**
   - 1 asset, 50 years, all features enabled
   - Assert: no overflow, no errors, returns exactly 50 rows
   - Assert: all monetary values are positive

2. **Integration tests — additional cases in `ProjectionTests.cs`:**

   **Test: Projection with reinvestment-enabled asset:**
   - Create portfolio, add asset with `reinvestDividends: true`
   - Run projection, 10 years
   - Assert: year 2 wealth > what it would be without reinvestment

   **Test: Update asset and re-run projection:**
   - Create portfolio + asset, run projection (save result)
   - Update asset shares from 100 to 200
   - Re-run projection
   - Assert: new result has higher wealth than original

   **Test: Concurrent projection requests:**
   - Create portfolio with assets
   - Fire 3 projection requests simultaneously
   - Assert: all return 200 with correct data (stateless endpoint should handle concurrency)

3. **Auth integration tests — edge cases:**

   **Test: Session persistence:**
   - Register → make request → wait → make another request
   - Assert: cookie-based auth still valid

   **Test: Password validation boundaries:**
   - 7 characters → reject
   - 8 characters with digit + uppercase → accept
   - No digit → reject
   - No uppercase → reject

**Acceptance criteria:**
- All new tests pass
- Total test count ≥ 30 (unit + integration)
- `dotnet test` completes in < 30 seconds
- No flaky tests

---

## Task 4.6 – Frontend Test Coverage

**What:** Add unit tests for the TypeScript projection engine and key composables.

**Steps:**

1. **Projection engine tests** — update `projectionEngine.test.ts`:

   Add the same tests 11–16 from Task 4.5 (adapted for TypeScript):
   - Test 11: Dividend reinvestment compounding
   - Test 12: Reinvestment lots + deemed disposal
   - Test 13: All features combined
   - Test 14: Multiple assets, mixed settings
   - Test 15: Zero shares skipped
   - Test 16: 50-year max projection

2. **Cross-validation test:**
   - For tests 11 and 12, hardcode the expected values from the C# engine output.
   - Assert TypeScript results match within `0.01` tolerance.
   - This ensures both engines stay in sync after the reinvestment feature was added.

3. **Composable tests** — create `src/composables/__tests__/useFormatters.test.ts`:
   - `formatCurrency(1234.56)` → `"€1,234.56"`
   - `formatCurrency(0)` → `"€0.00"`
   - `formatCurrency(-500)` → `"-€500.00"`
   - `formatPercent(0.03)` → `"3.00%"`
   - `formatPercent(0)` → `"0.00%"`
   - `formatDelta(1234.56)` → `"+€1,234.56"`
   - `formatDelta(-500)` → `"-€500.00"`
   - `formatDelta(0)` → `"€0.00"`

4. **CSV export test** — create `src/composables/__tests__/useExportCsv.test.ts`:
   - Mock `document.createElement` and `URL.createObjectURL`
   - Call `exportProjection` with known data
   - Assert the generated CSV string contains correct headers and formatted values
   - Assert filename matches expected pattern

5. Run all tests: `npm run test`. Verify all pass.

**Acceptance criteria:**
- All frontend tests pass
- Projection engine has ≥ 14 test cases (8 original + 6 new)
- Formatter tests cover edge cases (0, negative, large numbers)
- CSV export test verifies content without requiring actual download
- `npm run test` exits with code 0

---

## Task 4.7 – GitHub Actions CI Pipeline

**What:** Set up continuous integration that runs on every push and PR.

**Steps:**

1. Create `.github/workflows/ci.yml`:

   ```yaml
   name: CI

   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]

   jobs:
     api:
       name: Backend
       runs-on: ubuntu-latest

       services:
         postgres:
           image: postgres:17
           env:
             POSTGRES_USER: wealth
             POSTGRES_PASSWORD: wealth_ci_123
             POSTGRES_DB: wealthaccsim_test
           ports:
             - 5432:5432
           options: >-
             --health-cmd pg_isready
             --health-interval 10s
             --health-timeout 5s
             --health-retries 5

       steps:
         - uses: actions/checkout@v4

         - name: Setup .NET 10
           uses: actions/setup-dotnet@v4
           with:
             dotnet-version: '10.0.x'

         - name: Restore
           working-directory: src/api
           run: dotnet restore

         - name: Build
           working-directory: src/api
           run: dotnet build --no-restore --configuration Release

         - name: Test
           working-directory: src/api
           run: dotnet test --no-build --configuration Release --collect:"XPlat Code Coverage" --results-directory ./coverage
           env:
             ConnectionStrings__DefaultConnection: "Host=localhost;Port=5432;Database=wealthaccsim_test;Username=wealth;Password=wealth_ci_123"

         - name: Upload coverage
           if: github.event_name == 'push' && github.ref == 'refs/heads/main'
           uses: actions/upload-artifact@v4
           with:
             name: backend-coverage
             path: src/api/coverage/**/coverage.cobertura.xml

     web:
       name: Frontend
       runs-on: ubuntu-latest

       steps:
         - uses: actions/checkout@v4

         - name: Setup Node 22
           uses: actions/setup-node@v4
           with:
             node-version: '22'
             cache: 'npm'
             cache-dependency-path: src/web/package-lock.json

         - name: Install dependencies
           working-directory: src/web
           run: npm ci

         - name: Lint
           working-directory: src/web
           run: npm run lint

         - name: Type check
           working-directory: src/web
           run: npm run type-check

         - name: Test
           working-directory: src/web
           run: npm run test -- --run --coverage

         - name: Build
           working-directory: src/web
           run: npm run build

         - name: Upload coverage
           if: github.event_name == 'push' && github.ref == 'refs/heads/main'
           uses: actions/upload-artifact@v4
           with:
             name: frontend-coverage
             path: src/web/coverage/
   ```

2. **Important CI considerations:**
   - Backend tests use the GitHub Actions PostgreSQL service container instead of Testcontainers (simpler in CI). Override the connection string via env var.
   - Frontend tests run in headless mode (`--run` flag for Vitest).
   - Both jobs run in parallel for speed.
   - Coverage artifacts uploaded only on `main` pushes (not PRs).

3. Add a `type-check` script to `src/web/package.json` if not present:
   ```json
   "type-check": "vue-tsc --noEmit"
   ```

4. Add a `lint` script if not present:
   ```json
   "lint": "eslint . --ext .vue,.ts,.tsx"
   ```

5. Verify locally before pushing:
   ```bash
   cd src/web && npm run lint && npm run type-check && npm run test -- --run && npm run build
   cd src/api && dotnet build && dotnet test
   ```

**Acceptance criteria:**
- Pipeline triggers on push to `main` and on PRs
- Backend job: restore, build, test all pass with PostgreSQL service
- Frontend job: lint, type-check, test, build all pass
- Both jobs run in parallel
- Pipeline completes in < 5 minutes
- Coverage artifacts are uploaded on `main`

---

## Task 4.8 – GitHub Actions CD Pipeline

**Note:** The **frontend POC** (Phase 1 static app) is already deployed to GitHub Pages at `https://robertobubalo.github.io/investments-calculator/` via `.github/workflows/deploy.yml`. This was done as an interim step to make the projection engine accessible before the backend exists. The full Azure deployment below is planned for when the backend (Phase 2–3) is complete.

**What:** Add deployment steps that run only on pushes to `main` after CI passes.

**Steps:**

1. Create `.github/workflows/deploy.yml`:

   ```yaml
   name: Deploy

   on:
     push:
       branches: [main]

   jobs:
     ci:
       uses: ./.github/workflows/ci.yml

     deploy-api:
       name: Deploy API
       needs: ci
       runs-on: ubuntu-latest
       environment: production

       steps:
         - uses: actions/checkout@v4

         - name: Setup .NET 10
           uses: actions/setup-dotnet@v4
           with:
             dotnet-version: '10.0.x'

         - name: Publish
           working-directory: src/api/WealthAccSim.Api
           run: dotnet publish -c Release -o ./publish

         - name: Deploy to Azure App Service
           uses: azure/webapps-deploy@v3
           with:
             app-name: ${{ vars.AZURE_API_APP_NAME }}
             publish-profile: ${{ secrets.AZURE_API_PUBLISH_PROFILE }}
             package: src/api/WealthAccSim.Api/publish

     deploy-web:
       name: Deploy Frontend
       needs: ci
       runs-on: ubuntu-latest
       environment: production

       steps:
         - uses: actions/checkout@v4

         - name: Setup Node 22
           uses: actions/setup-node@v4
           with:
             node-version: '22'
             cache: 'npm'
             cache-dependency-path: src/web/package-lock.json

         - name: Install & Build
           working-directory: src/web
           run: |
             npm ci
             npm run build
           env:
             VITE_API_BASE_URL: ${{ vars.API_BASE_URL }}

         - name: Deploy to Azure Static Web Apps
           uses: Azure/static-web-apps-deploy@v1
           with:
             azure_static_web_apps_api_token: ${{ secrets.AZURE_SWA_TOKEN }}
             action: upload
             app_location: src/web/dist
             skip_app_build: true
   ```

2. **GitHub repository configuration required:**

   Secrets (Settings → Secrets and variables → Actions):
   - `AZURE_API_PUBLISH_PROFILE` — download from Azure App Service
   - `AZURE_SWA_TOKEN` — from Azure Static Web Apps deployment token

   Variables:
   - `AZURE_API_APP_NAME` — the App Service name
   - `API_BASE_URL` — the production API URL (e.g. `https://wealthaccsim-api.azurewebsites.net`)

3. **Workflow reuse:** The deploy pipeline calls the CI workflow first via `uses: ./.github/workflows/ci.yml`. Deployment only runs if CI passes.

4. Create a GitHub environment called `production` with optional manual approval if desired (Settings → Environments).

**Acceptance criteria:**
- Deployment triggers only on `main` pushes (not PRs)
- CI must pass before deployment starts
- API deploys to Azure App Service
- Frontend deploys to Azure Static Web Apps
- Production environment variables are injected at build time
- Failed deployment does not leave a partial deploy

---

## Task 4.9 – Azure Infrastructure Setup

**What:** Provision the Azure resources needed for production deployment.

**Steps:**

1. **Azure Database for PostgreSQL Flexible Server:**
   - SKU: Burstable B1ms (1 vCore, 2GB RAM) — cheapest tier
   - PostgreSQL version: 17
   - Storage: 32GB
   - Backup retention: 7 days
   - Enable connection from Azure services
   - Create database: `wealthaccsim`
   - Create a server admin user (not `postgres`)
   - Note the connection string

2. **Azure App Service (API):**
   - Runtime: .NET 10 (Linux)
   - SKU: B1 (Basic) to start
   - Region: same as database (e.g. North Europe for Ireland proximity)
   - Configuration → Application settings:
     - `ConnectionStrings__DefaultConnection`: PostgreSQL connection string
     - `ASPNETCORE_ENVIRONMENT`: `Production`
   - Enable HTTPS only
   - Configure custom domain later if needed

3. **Azure Static Web Apps (Frontend):**
   - Free tier
   - Linked to GitHub repo (or use deployment token from Task 4.8)
   - Configure custom domain later if needed

4. **Networking:**
   - App Service → allow outbound to PostgreSQL
   - PostgreSQL → firewall rule to allow App Service's outbound IPs
   - Alternatively, use VNet integration if both support it on the chosen tier

5. **CORS on the API App Service:**
   - In `Program.cs`, configure CORS for production:
     ```csharp
     if (app.Environment.IsProduction())
     {
         // Use environment variable for allowed origin
         var allowedOrigin = builder.Configuration["AllowedOrigin"]
             ?? "https://your-swa-domain.azurestaticapps.net";
         // Configure CORS with this origin
     }
     ```
   - Add `AllowedOrigin` to App Service Configuration.

6. **Run EF Core migrations on first deploy:**
   - Option A: Add migration execution to `Program.cs` for development/first deploy:
     ```csharp
     if (app.Environment.IsDevelopment() || args.Contains("--migrate"))
     {
         using var scope = app.Services.CreateScope();
         var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
         await db.Database.MigrateAsync();
     }
     ```
   - Option B: Run migrations manually via Azure CLI / Kudu console.
   - Prefer Option B for production safety. Document the command:
     ```bash
     dotnet ef database update -p WealthAccSim.Infrastructure -s WealthAccSim.Api --connection "<prod_connection_string>"
     ```

**Acceptance criteria:**
- PostgreSQL Flexible Server is running and accessible from App Service
- App Service is running and accessible via HTTPS
- Static Web App is deployed and accessible via HTTPS
- API can connect to database (verify via `/api/auth/me` → 401, not 500)
- CORS allows requests from the Static Web App domain
- No secrets are stored in code or config files (all in Azure Configuration / GitHub Secrets)

---

## Task 4.10 – Production Configuration and Security

**What:** Harden the application for production use.

**Steps:**

1. **Environment-specific configuration:**

   Create `appsettings.Production.json`:
   ```json
   {
     "Logging": {
       "LogLevel": {
         "Default": "Warning",
         "Microsoft.AspNetCore": "Warning"
       }
     }
   }
   ```
   All sensitive values (connection strings, allowed origins) come from Azure Configuration, not this file.

2. **Cookie configuration for production:**
   ```csharp
   builder.Services.ConfigureApplicationCookie(options =>
   {
       options.Cookie.HttpOnly = true;
       options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
       options.Cookie.SameSite = SameSiteMode.None; // required for cross-origin cookie (SWA → App Service)
       options.SlidingExpiration = true;
       options.ExpireTimeSpan = TimeSpan.FromDays(30);
       // ... same event overrides as before
   });
   ```

   **Important:** If the frontend (Static Web Apps) and API (App Service) are on different domains, cookies require `SameSite=None` and `Secure=true`. If you put them on the same domain (via custom domain + path routing), use `SameSite=Lax`.

3. **HTTPS enforcement:**
   - `app.UseHttpsRedirection()` is already in place
   - Add HSTS in production:
     ```csharp
     if (!app.Environment.IsDevelopment())
     {
         app.UseHsts();
     }
     ```

4. **Rate limiting (basic):**
   ```csharp
   builder.Services.AddRateLimiter(options =>
   {
       options.AddFixedWindowLimiter("auth", opt =>
       {
           opt.Window = TimeSpan.FromMinutes(15);
           opt.PermitLimit = 10;  // max 10 auth attempts per 15 min
       });
   });
   ```
   Apply to auth endpoints:
   ```csharp
   [EnableRateLimiting("auth")]
   ```

5. **Exception handling:**
   - Add global exception handler middleware that catches unhandled exceptions and returns a generic 500 response in production (no stack traces):
     ```csharp
     app.UseExceptionHandler(handler =>
     {
         handler.Run(async context =>
         {
             context.Response.StatusCode = 500;
             await context.Response.WriteAsJsonAsync(new { error = "An unexpected error occurred" });
         });
     });
     ```

6. **Anti-forgery (optional but recommended):**
   - For cookie-based auth, consider adding anti-forgery tokens to mutation endpoints.
   - This can be deferred to a future iteration if complexity is a concern.

**Acceptance criteria:**
- No stack traces exposed in production error responses
- Auth endpoints are rate-limited
- Cookies are secure and HTTP-only
- HTTPS is enforced
- Logging level is appropriate for production (Warning+)

---

## Task 4.11 – Database Seeding (Development)

**What:** Create a seed script that populates the development database with sample data for testing.

**Steps:**

1. Create `WealthAccSim.Infrastructure/Data/DbSeeder.cs`:
   ```csharp
   public static class DbSeeder
   {
       public static async Task SeedAsync(AppDbContext context, UserManager<IdentityUser> userManager)
       {
           if (await userManager.FindByEmailAsync("demo@test.com") != null) return;

           // Create demo user
           var user = new IdentityUser { UserName = "demo@test.com", Email = "demo@test.com" };
           await userManager.CreateAsync(user, "Demo1234");

           // Create portfolio
           var portfolio = new Portfolio
           {
               Id = Guid.NewGuid(),
               UserId = user.Id,
               Name = "Demo Portfolio",
               CreatedAt = DateTime.UtcNow,
               Assets = new List<Asset>
               {
                   new()
                   {
                       Id = Guid.NewGuid(),
                       Name = "Vanguard FTSE All-World",
                       Symbol = "VWCE",
                       Shares = 150,
                       BuyPrice = 95.00m,
                       CurrentSharePrice = 105.50m,
                       DividendYield = 0.018m,
                       PriceAppreciationPct = 0.07m,
                       DividendGrowthPct = 0.02m,
                       WithholdingTaxRate = 0.15m,
                       DeemedDisposalEnabled = true,
                       AnnualContribution = 6000m,
                       ReinvestDividends = false,
                       CreatedAt = DateTime.UtcNow,
                       UpdatedAt = DateTime.UtcNow,
                   },
                   new()
                   {
                       Id = Guid.NewGuid(),
                       Name = "iShares S&P 500",
                       Symbol = "CSPX",
                       Shares = 50,
                       BuyPrice = 480.00m,
                       CurrentSharePrice = 520.00m,
                       DividendYield = 0.013m,
                       PriceAppreciationPct = 0.10m,
                       DividendGrowthPct = 0.05m,
                       WithholdingTaxRate = 0.15m,
                       CgtTaxRate = 0.33m,
                       DeemedDisposalEnabled = true,
                       AnnualContribution = 3600m,
                       ReinvestDividends = true,
                       CreatedAt = DateTime.UtcNow,
                       UpdatedAt = DateTime.UtcNow,
                   },
               }
           };

           context.Portfolios.Add(portfolio);
           await context.SaveChangesAsync();
       }
   }
   ```

2. Call the seeder in `Program.cs` (development only):
   ```csharp
   if (app.Environment.IsDevelopment())
   {
       using var scope = app.Services.CreateScope();
       var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
       var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
       await context.Database.MigrateAsync();
       await DbSeeder.SeedAsync(context, userManager);
   }
   ```

3. The seeder is idempotent — re-running it does nothing if the demo user already exists.

**Acceptance criteria:**
- Running the API in development auto-migrates and seeds
- Demo user `demo@test.com` / `Demo1234` can log in
- Demo portfolio with 2 assets exists
- Re-running the API doesn't create duplicates
- Seeder does NOT run in production

---

## Task 4.12 – Final Review Checklist and Documentation

**What:** Verify everything works end-to-end and create minimal documentation.

**Steps:**

1. **Create `README.md` in the repo root:**

   ```markdown
   # Wealth Accumulation Simulator

   A full-stack web application for tracking and projecting dividend-based
   wealth accumulation, with support for Irish deemed disposal tax rules.

   ## Tech Stack
   - Frontend: Vue 3 + Vuetify 3 + Chart.js
   - Backend: .NET 10 + EF Core + PostgreSQL
   - Auth: ASP.NET Identity (cookie-based)
   - CI/CD: GitHub Actions → Azure

   ## Local Development

   ### Prerequisites
   - .NET 10 SDK
   - Node.js 22+
   - Docker (for PostgreSQL)

   ### Setup
   1. Start the database: `cd src/api && docker compose up -d`
   2. Start the API: `cd src/api/WealthAccSim.Api && dotnet run`
   3. Start the frontend: `cd src/web && npm install && npm run dev`
   4. Open http://localhost:5173
   5. Login with demo@test.com / Demo1234

   ### Running Tests
   - Backend: `cd src/api && dotnet test`
   - Frontend: `cd src/web && npm run test`

   ## Features
   - Portfolio and asset management (CRUD)
   - Wealth projection with configurable timeframe
   - Price appreciation and dividend growth modelling
   - Irish 8-year deemed disposal rule (41% exit tax, per-lot tracking)
   - Annual contributions with independent deemed disposal cycles
   - Dividend reinvestment (DRIP)
   - Withholding tax and CGT (unrealised) tracking
   - Inflation adjustment (nominal vs real toggle)
   - Projection table and chart visualisation
   - CSV export
   ```

2. **Final verification checklist:**

   Run through each item and mark complete:

   **Frontend POC (Phase 1 — already complete):**
   - [x] `npm run dev` → Frontend starts
   - [x] Add asset with all fields → appears in table
   - [x] Edit asset → changes reflected
   - [x] Delete asset → removed from table
   - [x] Run projection (20 years, 2.5% inflation) → table + chart render
   - [x] Deemed disposal tax appears at correct 8-year intervals
   - [x] Annual contribution lots trigger deemed disposal independently
   - [x] Expandable row shows per-lot breakdown (asset, lot purchase year, gain, tax, shares sold)
   - [x] Dividend reinvestment (DRIP) increases wealth; cash dividends accumulate in totalWealth
   - [x] Global CGT rate, per-asset CGT override, dividend income tax, configurable deemed disposal rate
   - [x] `npm run test` → all 14 tests pass
   - [x] GitHub Actions deploy → frontend live at https://robertobubalo.github.io/investments-calculator/

   **Backend + full integration (Phase 2–4 — pending):**
   - [ ] `docker compose up -d` → PostgreSQL starts
   - [ ] `dotnet run` → API starts, Swagger loads
   - [ ] Register new account → success
   - [ ] Create portfolio → appears in list
   - [ ] Run projection via backend API (20 years, 2.5% inflation) → table + chart render
   - [ ] Nominal/real toggle switches table and chart values
   - [ ] Export CSV → file downloads with correct data
   - [ ] Logout → redirected to login, protected routes inaccessible
   - [ ] Login → data persisted from previous session
   - [ ] Second user → cannot see first user's data
   - [ ] `dotnet test` → all pass
   - [ ] `npm run lint` → no errors
   - [ ] `npm run type-check` → no errors
   - [ ] GitHub Actions CI → green on main
   - [ ] Production deployment → site accessible via HTTPS
   - [ ] Production API → `/api/auth/me` returns 401 (not 500)
   - [ ] Production full flow → register, create portfolio, add asset, run projection

**Acceptance criteria:**
- All checklist items pass
- README is accurate and sufficient for a new developer to get started
- No console errors in browser
- No warnings in API logs
- CI pipeline is green
- Production deployment is live and functional
