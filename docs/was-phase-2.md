# Phase 2 – Backend API (.NET 10 + PostgreSQL)

**Goal:** Build the .NET 10 API with auth, CRUD, and the projection endpoint. No frontend integration yet — test everything via Swagger and HTTP request files.

**Deliverable:** A fully functional API at `https://localhost:5001/swagger`. Auth works, CRUD works, projection endpoint returns correct data. All verified by integration tests.

**Prerequisites:** Phase 1 complete. The projection engine logic and test cases from Phase 1 serve as the reference specification for the C# port.

---

## Task 2.1 – Solution Scaffolding

**What:** Create the .NET solution structure with all projects and Docker-based PostgreSQL for local dev.

**Steps:**

1. Create the solution in `/src/api`:
   ```bash
   dotnet new sln -n WealthAccSim
   dotnet new webapi -n WealthAccSim.Api -o WealthAccSim.Api
   dotnet new classlib -n WealthAccSim.Core -o WealthAccSim.Core
   dotnet new classlib -n WealthAccSim.Infrastructure -o WealthAccSim.Infrastructure
   dotnet new xunit -n WealthAccSim.Tests -o WealthAccSim.Tests
   ```

2. Add all projects to the solution:
   ```bash
   dotnet sln add WealthAccSim.Api
   dotnet sln add WealthAccSim.Core
   dotnet sln add WealthAccSim.Infrastructure
   dotnet sln add WealthAccSim.Tests
   ```

3. Set up project references:
   ```
   WealthAccSim.Api → references Core + Infrastructure
   WealthAccSim.Infrastructure → references Core
   WealthAccSim.Tests → references Api + Core + Infrastructure
   ```

4. Install NuGet packages:

   **WealthAccSim.Api:**
   ```
   Microsoft.AspNetCore.Identity.EntityFrameworkCore
   Npgsql.EntityFrameworkCore.PostgreSQL
   Swashbuckle.AspNetCore
   ```

   **WealthAccSim.Infrastructure:**
   ```
   Microsoft.AspNetCore.Identity.EntityFrameworkCore
   Npgsql.EntityFrameworkCore.PostgreSQL
   ```

   **WealthAccSim.Tests:**
   ```
   Microsoft.AspNetCore.Mvc.Testing
   Microsoft.EntityFrameworkCore.InMemory
   Testcontainers.PostgreSql
   FluentAssertions
   ```

5. Create `docker-compose.yml` in `/src/api` for local PostgreSQL:
   ```yaml
   services:
     db:
       image: postgres:17
       environment:
         POSTGRES_USER: wealth
         POSTGRES_PASSWORD: wealth_dev_123
         POSTGRES_DB: wealthaccsim
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data

   volumes:
     pgdata:
   ```

6. Configure `appsettings.Development.json`:
   ```json
   {
     "ConnectionStrings": {
       "DefaultConnection": "Host=localhost;Port=5432;Database=wealthaccsim;Username=wealth;Password=wealth_dev_123"
     }
   }
   ```

7. Set up minimal `Program.cs` in `WealthAccSim.Api`:
   - Register EF Core with Npgsql provider
   - Register ASP.NET Identity
   - Register Swagger
   - Configure CORS to allow `http://localhost:5173`
   - Map controllers
   - Use HTTPS redirection

8. Verify: `docker compose up -d` starts PostgreSQL, `dotnet run` starts the API, Swagger UI loads at `/swagger`.

**Acceptance criteria:**
- Solution builds with zero errors and zero warnings
- `docker compose up -d` starts PostgreSQL successfully
- API starts and Swagger UI is accessible
- Database connection is verified on startup (no connection errors in logs)

---

## Task 2.2 – Domain Entities (WealthAccSim.Core)

**What:** Define all domain entities, DTOs, interfaces, and the projection service contract.

**Steps:**

1. Create `WealthAccSim.Core/Entities/Portfolio.cs`:
   ```csharp
   public class Portfolio
   {
       public Guid Id { get; set; }
       public string UserId { get; set; } = string.Empty;
       public string Name { get; set; } = string.Empty;
       public DateTime CreatedAt { get; set; }
       public ICollection<Asset> Assets { get; set; } = new List<Asset>();
   }
   ```

2. Create `WealthAccSim.Core/Entities/Asset.cs`:
   ```csharp
   public class Asset
   {
       public Guid Id { get; set; }
       public Guid PortfolioId { get; set; }
       public string Name { get; set; } = string.Empty;
       public string Symbol { get; set; } = string.Empty;
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
       public Portfolio Portfolio { get; set; } = null!;
   }
   ```

3. Create DTOs in `WealthAccSim.Core/DTOs/`:

   **PortfolioDto.cs:**
   ```csharp
   public record PortfolioDto(Guid Id, string Name, DateTime CreatedAt, int AssetCount);
   public record CreatePortfolioDto(string Name);
   public record UpdatePortfolioDto(string Name);
   ```

   **AssetDto.cs:**
   ```csharp
   public record AssetDto(
       Guid Id, Guid PortfolioId, string Name, string Symbol,
       decimal Shares, decimal BuyPrice, decimal CurrentSharePrice,
       decimal CurrentValue,  // computed: Shares × CurrentSharePrice
       decimal DividendYield,
       decimal? PriceAppreciationPct, decimal? DividendGrowthPct,
       decimal? CgtTaxRate, decimal? WithholdingTaxRate,
       bool DeemedDisposalEnabled, bool DripEnabled, decimal AnnualContribution
   );

   public record CreateAssetDto(
       string Name, string Symbol, decimal Shares, decimal BuyPrice,
       decimal CurrentSharePrice, decimal DividendYield,
       decimal? PriceAppreciationPct, decimal? DividendGrowthPct,
       decimal? CgtTaxRate, decimal? WithholdingTaxRate,
       bool DeemedDisposalEnabled, bool DripEnabled, decimal AnnualContribution
   );

   public record UpdateAssetDto(
       string Name, string Symbol, decimal Shares, decimal BuyPrice,
       decimal CurrentSharePrice, decimal DividendYield,
       decimal? PriceAppreciationPct, decimal? DividendGrowthPct,
       decimal? CgtTaxRate, decimal? WithholdingTaxRate,
       bool DeemedDisposalEnabled, bool DripEnabled, decimal AnnualContribution
   );
   ```

   **ProjectionDto.cs:**
   ```csharp
   public record ProjectionRequestDto(
       int Years,
       decimal InflationRate,
       decimal? CgtTaxRate,              // global fallback CGT rate (applied when per-asset rate is null)
       decimal? DividendIncomeTaxRate,   // personal income tax on net dividends
       decimal? DeemedDisposalTaxRate    // exit tax rate; defaults to 0.41 if omitted
   );

   public record DeemedDisposalEventDto(
       string AssetName, string AssetSymbol,
       int LotPurchaseYear,
       decimal Gain, decimal TaxAmount, decimal SharesReduced
   );

   public record YearRowDto(
       int Year, decimal TotalWealth, decimal WealthDelta,
       decimal Dividends, decimal DividendsDelta,
       decimal TaxPaid,                  // WHT + deemed disposal + income tax (CGT excluded)
       decimal UnrealisedCgt,            // paper CGT liability — informational, not in TaxPaid
       decimal DividendIncomeTax,
       decimal DeemedDisposalTax,
       List<DeemedDisposalEventDto> DeemedDisposalEvents,
       decimal AccumWealth, decimal AccumDividends, decimal AccumTaxPaid,
       decimal RealWealth, decimal RealAccumDividends
   );

   public record ProjectionResultDto(List<YearRowDto> Rows);
   ```

   **AuthDto.cs:**
   ```csharp
   public record RegisterDto(string Email, string Password);
   public record LoginDto(string Email, string Password);
   public record UserDto(string Email);
   ```

4. Create repository interfaces in `WealthAccSim.Core/Interfaces/`:

   **IPortfolioRepository.cs:**
   ```csharp
   public interface IPortfolioRepository
   {
       Task<Portfolio?> GetByIdAsync(Guid id, string userId);
       Task<List<Portfolio>> GetAllAsync(string userId);
       Task<Portfolio> CreateAsync(Portfolio portfolio);
       Task UpdateAsync(Portfolio portfolio);
       Task DeleteAsync(Guid id, string userId);
   }
   ```

   **IAssetRepository.cs:**
   ```csharp
   public interface IAssetRepository
   {
       Task<Asset?> GetByIdAsync(Guid id);
       Task<List<Asset>> GetByPortfolioIdAsync(Guid portfolioId);
       Task<Asset> CreateAsync(Asset asset);
       Task UpdateAsync(Asset asset);
       Task DeleteAsync(Guid id);
   }
   ```

**Acceptance criteria:**
- All entities, DTOs, and interfaces compile without errors
- Core project has zero external dependencies (no EF Core, no ASP.NET references)
- DTOs use `record` types for immutability

---

## Task 2.3 – Projection Service (WealthAccSim.Core)

**What:** Port the TypeScript projection engine from Phase 1 to C#. This is the most critical backend component.

**Steps:**

1. Create `WealthAccSim.Core/Services/ProjectionService.cs`.

2. Create internal helper class `ShareLot`:
   ```csharp
   internal class ShareLot
   {
       public decimal Shares { get; set; }
       public decimal CostBase { get; set; }
       public int PurchaseYear { get; set; }
   }
   ```

3. Create internal helper class `AssetSimState`:
   ```csharp
   internal class AssetSimState
   {
       public Guid AssetId { get; set; }
       public List<ShareLot> Lots { get; set; } = new();
       public decimal SharePrice { get; set; }
       public decimal DividendYield { get; set; }
   }
   ```

4. Implement the main method:
   ```csharp
   public class ProjectionService
   {
       public List<YearRowDto> Run(List<Asset> assets, ProjectionRequestDto settings)
   }
   ```

5. **Port the exact logic from Phase 1 Task 1.3.** The algorithm is identical:

   a) **Initialisation:** For each asset, create an `AssetSimState` with one initial lot.

   b) **Year loop (1 → settings.Years):** For each asset sim state:
      - Price appreciation
      - Annual contribution → new lot
      - Deemed disposal: iterate all lots, check `(y - lot.PurchaseYear) > 0 && (y - lot.PurchaseYear) % 8 == 0`, rate = `settings.DeemedDisposalTaxRate ?? 0.41m`, tax = `gain × rate`, sell shares to cover, reset cost base
      - Dividends on shares **before** any DRIP lot: gross → WHT → net → income tax → takeHome
      - DRIP: if `asset.DripEnabled && takeHome > 0` → push new lot; else `cashBalance += takeHome`
      - CGT informational: `effectiveCgtRate = asset.CgtTaxRate ?? settings.CgtTaxRate ?? 0m`; sum lotGain × rate
      - Portfolio value = totalShares × sharePrice (includes DRIP lot)

   c) **Deemed disposal events:** During the disposal loop, for each lot that triggers with `gain > 0`, create a `DeemedDisposalEventDto` capturing `AssetName`, `AssetSymbol`, `LotPurchaseYear`, `Gain`, `TaxAmount`, `SharesReduced`. Collect into a `List<DeemedDisposalEventDto>` per year.

   d) **Aggregate across assets:**
      - `portfolioWealth` = Σ portfolio values; `totalWealth` = `portfolioWealth + cashBalance` (cashBalance persists)
      - `dividends` = Σ net dividends (after WHT)
      - `taxPaid` = Σ (whTax + deemedTax + incomeTax) — **CGT excluded**
      - `unrealisedCgt` = Σ cgtTax — informational only, never in taxPaid or accumTaxPaid
      - `dividendIncomeTax` = Σ assetIncomeTax
      - deltas, accumulations, inflation adjustment

6. **Edge cases (same as Phase 1):**
   - Nullable fields → treat as 0 using `?? 0m`
   - Skip assets with `Shares <= 0`
   - Deemed disposal on negative gain → tax = 0
   - Prevent `lot.Shares` from going below 0
   - `AnnualContribution == 0` → no new lot
   - `Years == 0` → return empty list

7. Use `decimal` for all monetary and rate calculations (not `double`) to avoid floating-point precision issues.

**Acceptance criteria:**
- Method is pure: no database access, no injected dependencies, no side effects
- Uses `decimal` exclusively for money and rates
- Produces identical output to the TypeScript engine for the same inputs (verified in Task 2.10)

---

## Task 2.4 – EF Core Infrastructure (WealthAccSim.Infrastructure)

**What:** Set up the DbContext, entity configurations, and repository implementations.

**Steps:**

1. Create `WealthAccSim.Infrastructure/Data/AppDbContext.cs`:
   ```csharp
   public class AppDbContext : IdentityDbContext
   {
       public DbSet<Portfolio> Portfolios => Set<Portfolio>();
       public DbSet<Asset> Assets => Set<Asset>();

       public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

       protected override void OnModelCreating(ModelBuilder builder)
       {
           base.OnModelCreating(builder);
           builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
       }
   }
   ```

2. Create `WealthAccSim.Infrastructure/Data/Configurations/PortfolioConfiguration.cs`:
   ```csharp
   public class PortfolioConfiguration : IEntityTypeConfiguration<Portfolio>
   {
       public void Configure(EntityTypeBuilder<Portfolio> builder)
       {
           builder.HasKey(p => p.Id);
           builder.Property(p => p.Name).IsRequired().HasMaxLength(200);
           builder.Property(p => p.UserId).IsRequired();
           builder.HasMany(p => p.Assets)
                  .WithOne(a => a.Portfolio)
                  .HasForeignKey(a => a.PortfolioId)
                  .OnDelete(DeleteBehavior.Cascade);
           builder.HasIndex(p => p.UserId);
       }
   }
   ```

3. Create `WealthAccSim.Infrastructure/Data/Configurations/AssetConfiguration.cs`:
   ```csharp
   public class AssetConfiguration : IEntityTypeConfiguration<Asset>
   {
       public void Configure(EntityTypeBuilder<Asset> builder)
       {
           builder.HasKey(a => a.Id);
           builder.Property(a => a.Name).IsRequired().HasMaxLength(200);
           builder.Property(a => a.Symbol).IsRequired().HasMaxLength(20);
           builder.Property(a => a.Shares).HasPrecision(18, 6);
           builder.Property(a => a.BuyPrice).HasPrecision(18, 4);
           builder.Property(a => a.CurrentSharePrice).HasPrecision(18, 4);
           builder.Property(a => a.DividendYield).HasPrecision(10, 6);
           builder.Property(a => a.PriceAppreciationPct).HasPrecision(10, 6);
           builder.Property(a => a.DividendGrowthPct).HasPrecision(10, 6);
           builder.Property(a => a.CgtTaxRate).HasPrecision(10, 6);
           builder.Property(a => a.WithholdingTaxRate).HasPrecision(10, 6);
           builder.Property(a => a.AnnualContribution).HasPrecision(18, 2);
           builder.HasIndex(a => a.PortfolioId);
       }
   }
   ```

4. Create `WealthAccSim.Infrastructure/Repositories/PortfolioRepository.cs`:
   ```csharp
   public class PortfolioRepository : IPortfolioRepository
   ```
   - `GetByIdAsync`: filter by `Id` AND `UserId`, include `Assets`, return null if not found
   - `GetAllAsync`: filter by `UserId`, order by `CreatedAt` desc
   - `CreateAsync`: set `Id = Guid.NewGuid()`, `CreatedAt = DateTime.UtcNow`, add and save
   - `UpdateAsync`: attach, mark as modified, save
   - `DeleteAsync`: find by `Id` AND `UserId`, remove and save (cascade deletes assets)

5. Create `WealthAccSim.Infrastructure/Repositories/AssetRepository.cs`:
   ```csharp
   public class AssetRepository : IAssetRepository
   ```
   - `GetByIdAsync`: find by `Id`, include `Portfolio` for ownership checks
   - `GetByPortfolioIdAsync`: filter by `PortfolioId`, order by `CreatedAt`
   - `CreateAsync`: set `Id = Guid.NewGuid()`, `CreatedAt = UpdatedAt = DateTime.UtcNow`, add and save
   - `UpdateAsync`: set `UpdatedAt = DateTime.UtcNow`, attach, mark modified, save
   - `DeleteAsync`: find by `Id`, remove and save

6. Create the initial migration:
   ```bash
   dotnet ef migrations add InitialCreate -p WealthAccSim.Infrastructure -s WealthAccSim.Api
   ```

7. Verify migration SQL looks correct (check table names, column types, precision, FK constraints).

**Acceptance criteria:**
- Migration creates `Portfolios`, `Assets`, and all Identity tables in PostgreSQL
- `dotnet ef database update` succeeds against the Docker PostgreSQL instance
- Decimal precisions are correct: `(18,6)` for shares, `(18,4)` for prices, `(10,6)` for rates, `(18,2)` for contributions
- Cascade delete: deleting a portfolio removes its assets
- `UserId` index exists on `Portfolios`
- `PortfolioId` index exists on `Assets`

---

## Task 2.5 – Service Registration (Program.cs)

**What:** Wire up all services, repositories, Identity, EF Core, and middleware in `Program.cs`.

**Steps:**

1. Full `Program.cs` configuration:

   ```csharp
   var builder = WebApplication.CreateBuilder(args);

   // Database
   builder.Services.AddDbContext<AppDbContext>(options =>
       options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

   // Identity
   builder.Services.AddIdentity<IdentityUser, IdentityRole>(options =>
   {
       options.Password.RequiredLength = 8;
       options.Password.RequireDigit = true;
       options.Password.RequireUppercase = true;
       options.Password.RequireLowercase = true;
       options.Password.RequireNonAlphanumeric = false;
       options.User.RequireUniqueEmail = true;
       options.SignIn.RequireConfirmedEmail = false;
   })
   .AddEntityFrameworkStores<AppDbContext>()
   .AddDefaultTokenProviders();

   // Cookie auth
   builder.Services.ConfigureApplicationCookie(options =>
   {
       options.Cookie.HttpOnly = true;
       options.Cookie.SameSite = SameSiteMode.Lax;
       options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
       options.SlidingExpiration = true;
       options.ExpireTimeSpan = TimeSpan.FromDays(30);
       options.Events.OnRedirectToLogin = ctx =>
       {
           ctx.Response.StatusCode = 401;
           return Task.CompletedTask;
       };
       options.Events.OnRedirectToAccessDenied = ctx =>
       {
           ctx.Response.StatusCode = 403;
           return Task.CompletedTask;
       };
   });

   // Repositories
   builder.Services.AddScoped<IPortfolioRepository, PortfolioRepository>();
   builder.Services.AddScoped<IAssetRepository, AssetRepository>();

   // Services
   builder.Services.AddSingleton<ProjectionService>();

   // CORS
   builder.Services.AddCors(options =>
   {
       options.AddDefaultPolicy(policy =>
           policy.WithOrigins("http://localhost:5173")
                 .AllowAnyHeader()
                 .AllowAnyMethod()
                 .AllowCredentials());
   });

   builder.Services.AddControllers();
   builder.Services.AddEndpointsApiExplorer();
   builder.Services.AddSwaggerGen();

   var app = builder.Build();

   if (app.Environment.IsDevelopment())
   {
       app.UseSwagger();
       app.UseSwaggerUI();
   }

   app.UseHttpsRedirection();
   app.UseCors();
   app.UseAuthentication();
   app.UseAuthorization();
   app.MapControllers();
   app.Run();
   ```

2. **Important details:**
   - Cookie `OnRedirectToLogin` returns 401 instead of redirecting (this is an API, not MVC)
   - `ProjectionService` is registered as singleton (stateless, no dependencies)
   - CORS allows credentials (needed for cookie auth from the Vue frontend)
   - `AllowCredentials()` requires specific origin, not wildcard

3. Make the `Program` class accessible to the test project by adding to `WealthAccSim.Api.csproj`:
   ```xml
   <ItemGroup>
     <InternalsVisibleTo Include="WealthAccSim.Tests" />
   </ItemGroup>
   ```
   And at the bottom of `Program.cs`:
   ```csharp
   public partial class Program { }
   ```

**Acceptance criteria:**
- API starts without errors
- Swagger UI loads and shows no endpoints yet (controllers not created)
- Unauthenticated requests return 401 (not a redirect)
- CORS headers present on preflight requests from `localhost:5173`

---

## Task 2.6 – Auth Controller

**What:** Implement register, login, logout, and current-user endpoints.

**Steps:**

1. Create `WealthAccSim.Api/Controllers/AuthController.cs`:

   ```csharp
   [ApiController]
   [Route("api/auth")]
   public class AuthController : ControllerBase
   {
       private readonly UserManager<IdentityUser> _userManager;
       private readonly SignInManager<IdentityUser> _signInManager;
   }
   ```

2. **POST `/api/auth/register`:**
   - Accept `RegisterDto` body
   - Create user via `_userManager.CreateAsync(new IdentityUser { UserName = dto.Email, Email = dto.Email }, dto.Password)`
   - If failed, return `400` with Identity error messages
   - If successful, sign in via `_signInManager.SignInAsync(user, isPersistent: true)`
   - Return `200` with `UserDto`

3. **POST `/api/auth/login`:**
   - Accept `LoginDto` body
   - Call `_signInManager.PasswordSignInAsync(dto.Email, dto.Password, isPersistent: true, lockoutOnFailure: false)`
   - If failed, return `401` with `{ "error": "Invalid email or password" }`
   - If successful, return `200` with `UserDto`

4. **POST `/api/auth/logout`:**
   - Require `[Authorize]`
   - Call `_signInManager.SignOutAsync()`
   - Return `200`

5. **GET `/api/auth/me`:**
   - Require `[Authorize]`
   - Return `200` with `UserDto` using `User.FindFirstValue(ClaimTypes.Email)`
   - If not authenticated (shouldn't happen due to `[Authorize]`), return `401`

**Acceptance criteria:**
- Register creates a user in the database and sets an auth cookie
- Login with correct credentials sets an auth cookie
- Login with wrong credentials returns 401
- Logout clears the auth cookie
- `/api/auth/me` returns user email when authenticated, 401 when not
- Duplicate email registration returns 400 with descriptive error
- Password validation enforced (min 8 chars, digit, uppercase)

---

## Task 2.7 – Portfolio Controller

**What:** Implement CRUD endpoints for portfolios, scoped to the authenticated user.

**Steps:**

1. Create `WealthAccSim.Api/Controllers/PortfoliosController.cs`:
   ```csharp
   [ApiController]
   [Route("api/portfolios")]
   [Authorize]
   public class PortfoliosController : ControllerBase
   ```

2. Create a private helper method to extract the user ID:
   ```csharp
   private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
   ```

3. **GET `/api/portfolios`:**
   - Call `_portfolioRepo.GetAllAsync(GetUserId())`
   - Map to `List<PortfolioDto>` (include `AssetCount = p.Assets.Count`)
   - Return `200`

4. **POST `/api/portfolios`:**
   - Accept `CreatePortfolioDto` body
   - Validate: `Name` must not be empty
   - Create `Portfolio` entity with `UserId = GetUserId()`
   - Save via repository
   - Return `201` with `PortfolioDto` and `Location` header

5. **PUT `/api/portfolios/{id}`:**
   - Accept `UpdatePortfolioDto` body
   - Fetch portfolio by `id` AND `GetUserId()` — return `404` if not found
   - Update `Name`
   - Save via repository
   - Return `200` with updated `PortfolioDto`

6. **DELETE `/api/portfolios/{id}`:**
   - Fetch portfolio by `id` AND `GetUserId()` — return `404` if not found
   - Delete via repository (cascades to assets)
   - Return `204`

7. Create a private mapping method:
   ```csharp
   private static PortfolioDto ToDto(Portfolio p) =>
       new(p.Id, p.Name, p.CreatedAt, p.Assets?.Count ?? 0);
   ```

**Acceptance criteria:**
- All endpoints require authentication (return 401 without cookie)
- User A cannot see/edit/delete User B's portfolios (return 404, not 403)
- Creating a portfolio returns 201 with the created resource
- Deleting a portfolio cascades to its assets
- Empty name returns 400

---

## Task 2.8 – Assets Controller

**What:** Implement CRUD endpoints for assets within a portfolio.

**Steps:**

1. Create `WealthAccSim.Api/Controllers/AssetsController.cs`:
   ```csharp
   [ApiController]
   [Authorize]
   public class AssetsController : ControllerBase
   ```

2. Create a private helper to verify portfolio ownership:
   ```csharp
   private async Task<Portfolio?> GetOwnedPortfolioAsync(Guid portfolioId)
   {
       return await _portfolioRepo.GetByIdAsync(portfolioId, GetUserId());
   }
   ```

3. **GET `/api/portfolios/{portfolioId}/assets`:**
   - Verify portfolio ownership — return `404` if not found
   - Fetch assets via `_assetRepo.GetByPortfolioIdAsync(portfolioId)`
   - Map to `List<AssetDto>` (compute `CurrentValue = Shares * CurrentSharePrice`)
   - Return `200`

4. **POST `/api/portfolios/{portfolioId}/assets`:**
   - Verify portfolio ownership — return `404` if not found
   - Accept `CreateAssetDto` body
   - Validate required fields: Name, Symbol non-empty; Shares, BuyPrice, CurrentSharePrice, DividendYield ≥ 0
   - Map to `Asset` entity with `PortfolioId = portfolioId`
   - Save via repository
   - Return `201` with `AssetDto`

5. **PUT `/api/assets/{id}`:**
   - Fetch asset by `id`, include its `Portfolio`
   - Verify `asset.Portfolio.UserId == GetUserId()` — return `404` if not
   - Accept `UpdateAssetDto` body
   - Update all fields on the entity
   - Save via repository
   - Return `200` with updated `AssetDto`

6. **DELETE `/api/assets/{id}`:**
   - Fetch asset by `id`, include its `Portfolio`
   - Verify ownership — return `404` if not
   - Delete via repository
   - Return `204`

7. Create a private mapping method:
   ```csharp
   private static AssetDto ToDto(Asset a) =>
       new(a.Id, a.PortfolioId, a.Name, a.Symbol,
           a.Shares, a.BuyPrice, a.CurrentSharePrice,
           a.Shares * a.CurrentSharePrice,  // CurrentValue
           a.DividendYield,
           a.PriceAppreciationPct, a.DividendGrowthPct,
           a.CgtTaxRate, a.WithholdingTaxRate,
           a.DeemedDisposalEnabled, a.DripEnabled, a.AnnualContribution);
   ```

**Acceptance criteria:**
- All endpoints verify the parent portfolio belongs to the authenticated user
- Creating an asset under another user's portfolio returns 404
- All numeric fields are stored with correct precision
- `CurrentValue` in the DTO is computed, not stored
- Symbol is stored as provided (frontend handles uppercase)

---

## Task 2.9 – Projections Controller

**What:** Implement the stateless projection endpoint that runs the engine against a portfolio's assets.

**Steps:**

1. Create `WealthAccSim.Api/Controllers/ProjectionsController.cs`:
   ```csharp
   [ApiController]
   [Route("api/portfolios/{portfolioId}/projections")]
   [Authorize]
   public class ProjectionsController : ControllerBase
   {
       private readonly IPortfolioRepository _portfolioRepo;
       private readonly IAssetRepository _assetRepo;
       private readonly ProjectionService _projectionService;
   }
   ```

2. **POST `/api/portfolios/{portfolioId}/projections`:**
   - Verify portfolio ownership — return `404` if not found
   - Accept `ProjectionRequestDto` body
   - Validate: `Years` between 1 and 50, `InflationRate` between 0 and 1, optional rate fields between 0 and 1
   - Fetch assets via `_assetRepo.GetByPortfolioIdAsync(portfolioId)`
   - If no assets, return `200` with `ProjectionResultDto(Rows: [])` (empty projection is valid)
   - Call `_projectionService.Run(assets, settings)`
   - Return `200` with `ProjectionResultDto`

3. **Important:** This endpoint does NOT persist anything. It is a pure computation triggered by the request. The same request with the same data always returns the same result.

4. Validate edge case: portfolio exists but has 0 assets → return empty rows, not an error.

**Acceptance criteria:**
- Endpoint returns correct projection data for a portfolio with assets
- Empty portfolio returns 200 with empty rows array
- Invalid years (0, 51, negative) returns 400
- Invalid inflation (negative, > 1) returns 400
- Endpoint is scoped to authenticated user's portfolio
- Response shape matches `ProjectionResultDto` exactly

---

## Task 2.10 – DTO Mapping Helpers

**What:** Centralise all entity ↔ DTO mapping in a single static class to keep controllers thin.

**Steps:**

1. Create `WealthAccSim.Api/Mapping/DtoMapper.cs`:
   ```csharp
   public static class DtoMapper
   {
       public static PortfolioDto ToDto(Portfolio p) => ...;
       public static AssetDto ToDto(Asset a) => ...;
       public static Asset ToEntity(CreateAssetDto dto, Guid portfolioId) => ...;
       public static void ApplyUpdate(Asset entity, UpdateAssetDto dto) => ...;
   }
   ```

2. `ToEntity` sets `Id = Guid.NewGuid()`, `CreatedAt = UpdatedAt = DateTime.UtcNow`, maps all fields from DTO.

3. `ApplyUpdate` mutates an existing entity in-place, sets `UpdatedAt = DateTime.UtcNow`.

4. Refactor the controllers from Tasks 2.7 and 2.8 to use `DtoMapper` instead of inline mapping.

**Acceptance criteria:**
- All mapping logic lives in `DtoMapper`
- Controllers contain no inline mapping
- `ToEntity` correctly generates an Id and timestamps
- `ApplyUpdate` updates `UpdatedAt`

---

## Task 2.11 – Request Validation

**What:** Add input validation for all request DTOs.

**Steps:**

1. Add `System.ComponentModel.DataAnnotations` attributes to all request DTOs:

   **RegisterDto / LoginDto:**
   - `Email`: `[Required]`, `[EmailAddress]`
   - `Password`: `[Required]`, `[MinLength(8)]`

   **CreatePortfolioDto / UpdatePortfolioDto:**
   - `Name`: `[Required]`, `[MaxLength(200)]`

   **CreateAssetDto / UpdateAssetDto:**
   - `Name`: `[Required]`, `[MaxLength(200)]`
   - `Symbol`: `[Required]`, `[MaxLength(20)]`
   - `Shares`: `[Range(0, double.MaxValue)]`
   - `BuyPrice`: `[Range(0, double.MaxValue)]`
   - `CurrentSharePrice`: `[Range(0, double.MaxValue)]`
   - `DividendYield`: `[Range(0, 1)]`
   - All nullable percentage fields: `[Range(0, 1)]` when present
   - `AnnualContribution`: `[Range(0, double.MaxValue)]`

   **ProjectionRequestDto:**
   - `Years`: `[Range(1, 50)]`
   - `InflationRate`: `[Range(0, 1)]`

2. Ensure `[ApiController]` attribute is on all controllers (enables automatic 400 responses for invalid model state).

3. **Note:** All percentage values are stored and transmitted as decimals (e.g. `0.03` for 3%). The frontend is responsible for the human-readable conversion. The API always works with decimals.

**Acceptance criteria:**
- Invalid requests return 400 with descriptive error messages
- Empty required fields return 400
- Out-of-range numbers return 400
- Valid requests pass through without issue

---

## Task 2.12 – Unit Tests (Projection Service)

**What:** Port and expand the Phase 1 test cases to verify the C# projection engine.

**Steps:**

1. Create `WealthAccSim.Tests/ProjectionServiceTests.cs`.

2. Port all 14 test cases from Phase 1 Task 1.12, adapted for C# and `decimal`:

   **Test 1 – Basic growth, no extras:**
   - 1 asset, 100 shares @ €100, 5% appreciation, 0% dividend, no tax, no deemed disposal, no contribution
   - 5 years
   - Assert: year 5 `TotalWealth` ≈ `100 × 100 × 1.05^5` within `0.01m` tolerance

   **Test 2 – Dividend calculation with withholding tax:**
   - 1 asset, 100 shares @ €100, 0% appreciation, 3% yield, 0% growth, 15% withholding
   - 3 years
   - Assert: year 1 `Dividends` = `100 × 100 × 0.03 × 0.85`

   **Test 3 – Deemed disposal fires at year 8 and repeats every 8 years from last trigger:**
   - 1 asset, 100 shares @ €100, 5% appreciation, deemed disposal enabled, no contribution
   - 35 years
   - Assert: years 8, 16, 24, 32 have `DeemedDisposalTax > 0`
   - Assert: all other years have `DeemedDisposalTax == 0`
   - Assert: total shares decrease at each trigger year
   - Assert: year 16 tax is calculated on gains since the year-8 reset price (not original buy price)
   - Assert: year 24 tax is calculated on gains since the year-16 reset price
   - Assert: year 32 tax is calculated on gains since the year-24 reset price

   **Test 4 – Annual contribution lots have independent 8-year cycles with repeated triggers:**
   - 1 asset, 100 shares @ €100, 5% appreciation, deemed disposal enabled, €1,200/yr contribution
   - 25 years
   - Assert: year 8 tax > 0 (initial lot), year 9 tax > 0 (year-1 lot), year 10 tax > 0 (year-2 lot)
   - Assert: year 16 tax > 0 (initial lot 2nd cycle, gain since year-8 reset)
   - Assert: year 17 tax > 0 (year-1 lot 2nd cycle, gain since year-9 reset)
   - Assert: year 24 tax > 0 (initial lot 3rd cycle)

   **Test 5 – Inflation adjustment:**
   - 1 asset, 100 shares @ €100, 5% appreciation, 2.5% inflation, 10 years
   - Assert: `RealWealth < TotalWealth` for every year
   - Assert: year 10 `RealWealth ≈ TotalWealth / 1.025^10`

   **Test 6 – Empty assets:** returns empty list

   **Test 7 – Null optional fields:** no errors, price flat, base yield only

   **Test 8 – Deemed disposal with no gain:** year 8 `DeemedDisposalTax == 0`

3. **Additional C#-specific tests:**

   **Test 15 – Cross-validation with TypeScript engine:**
   - Use the exact test scenario from Phase 1 Task 1.11 (VWCE, 100 shares, all params)
   - Hardcode the expected values from the TypeScript engine output for years 1, 8, 9, 16, 20
   - Assert the C# engine matches within `0.01m` tolerance

   **Test 16 – Multiple assets aggregation:**
   - 2 assets with different parameters
   - Assert: `TotalWealth` includes portfolio value + accumulated cash from non-DRIP assets
   - Assert: `Dividends` = sum of both assets' net dividends
   - Assert: `TaxPaid` = WHT + deemed disposal + income tax (no CGT)
   - Assert: `UnrealisedCgt` = sum of informational CGT from both assets

4. Use `FluentAssertions` for readable assertions:
   ```csharp
   result[7].DeemedDisposalTax.Should().BeGreaterThan(0m);
   result[7].TotalWealth.Should().BeApproximately(expectedValue, 0.01m);
   ```

**Acceptance criteria:**
- All 16 tests pass
- `dotnet test` exits with code 0
- Tests run in < 5 seconds

---

## Task 2.13 – Integration Tests

**What:** Test the full API flow end-to-end using `WebApplicationFactory` with a real PostgreSQL instance via Testcontainers.

**Steps:**

1. Create `WealthAccSim.Tests/IntegrationTests/TestWebApplicationFactory.cs`:
   ```csharp
   public class TestWebApplicationFactory : WebApplicationFactory<Program>, IAsyncLifetime
   {
       private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
           .WithImage("postgres:17")
           .Build();

       protected override void ConfigureWebHost(IWebHostBuilder builder)
       {
           builder.ConfigureServices(services =>
           {
               // Remove existing DbContext registration
               // Add new one pointing to Testcontainers PostgreSQL
           });
       }

       public async Task InitializeAsync() => await _postgres.StartAsync();
       public async Task DisposeAsync() => await _postgres.DisposeAsync();
   }
   ```

2. Create `WealthAccSim.Tests/IntegrationTests/AuthTests.cs`:
   - Test: Register → 200, cookie set
   - Test: Register duplicate email → 400
   - Test: Register weak password → 400
   - Test: Login with correct credentials → 200, cookie set
   - Test: Login with wrong password → 401
   - Test: `/api/auth/me` without cookie → 401
   - Test: `/api/auth/me` with cookie → 200, returns email
   - Test: Logout → 200, subsequent `/api/auth/me` → 401

3. Create `WealthAccSim.Tests/IntegrationTests/PortfolioTests.cs`:
   - Test: Create portfolio → 201
   - Test: List portfolios → returns only own portfolios
   - Test: Update portfolio → 200, name changed
   - Test: Delete portfolio → 204, subsequent GET → empty
   - Test: Access other user's portfolio → 404
   - Test: All endpoints without auth → 401

4. Create `WealthAccSim.Tests/IntegrationTests/AssetTests.cs`:
   - Test: Create asset under own portfolio → 201
   - Test: Create asset under other user's portfolio → 404
   - Test: List assets → correct list
   - Test: Update asset → 200, fields changed
   - Test: Delete asset → 204
   - Test: Invalid asset data (empty name, negative shares) → 400

5. Create `WealthAccSim.Tests/IntegrationTests/ProjectionTests.cs`:
   - Test: Run projection on portfolio with 1 asset → 200, correct row count
   - Test: Run projection on empty portfolio → 200, empty rows
   - Test: Run projection on other user's portfolio → 404
   - Test: Invalid settings (years=0, inflation=2.0) → 400

6. Create a helper for authenticated requests:
   ```csharp
   private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
   {
       var client = _factory.CreateClient();
       await client.PostAsJsonAsync("/api/auth/register", new { email, password });
       // Cookie is automatically stored by the HttpClient handler
       return client;
   }
   ```

**Acceptance criteria:**
- All integration tests pass against a real PostgreSQL instance (Testcontainers)
- Auth isolation is verified (user A cannot access user B's data)
- Invalid input returns 400 with error details
- `dotnet test` runs all unit + integration tests and exits with code 0

---

## Task 2.14 – API Documentation & HTTP Request Files

**What:** Create `.http` files for manual testing and Swagger configuration.

**Steps:**

1. Create `WealthAccSim.Api/requests/auth.http`:
   ```http
   ### Register
   POST https://localhost:5001/api/auth/register
   Content-Type: application/json

   { "email": "test@example.com", "password": "Test1234" }

   ### Login
   POST https://localhost:5001/api/auth/login
   Content-Type: application/json

   { "email": "test@example.com", "password": "Test1234" }

   ### Me
   GET https://localhost:5001/api/auth/me

   ### Logout
   POST https://localhost:5001/api/auth/logout
   ```

2. Create `WealthAccSim.Api/requests/portfolios.http`:
   ```http
   ### Create Portfolio
   POST https://localhost:5001/api/portfolios
   Content-Type: application/json

   { "name": "My Portfolio" }

   ### List Portfolios
   GET https://localhost:5001/api/portfolios

   ### Update Portfolio
   PUT https://localhost:5001/api/portfolios/{{portfolioId}}
   Content-Type: application/json

   { "name": "Renamed Portfolio" }

   ### Delete Portfolio
   DELETE https://localhost:5001/api/portfolios/{{portfolioId}}
   ```

3. Create `WealthAccSim.Api/requests/assets.http` with CRUD examples including all fields.

4. Create `WealthAccSim.Api/requests/projections.http`:
   ```http
   ### Run Projection
   POST https://localhost:5001/api/portfolios/{{portfolioId}}/projections
   Content-Type: application/json

   { "years": 20, "inflationRate": 0.025 }
   ```

5. Ensure Swagger is configured with:
   - API title: "Wealth Accumulation Simulator API"
   - Version: "v1"
   - All endpoints visible with request/response schemas

**Acceptance criteria:**
- `.http` files can be executed in Rider/VS Code REST Client
- Swagger UI shows all endpoints with correct schemas
- Full CRUD + projection flow can be tested end-to-end via either method
