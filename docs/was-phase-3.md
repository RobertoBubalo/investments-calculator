# Phase 3 – Frontend Integration

**Goal:** Wire the Vue frontend to the real .NET API. Add authentication pages, replace in-memory state with API-backed persistence, and make the full flow work end-to-end.

**Deliverable:** A fully integrated app. User can register, log in, create a portfolio, manage assets, run projections, and see results in table + chart form — all persisted via the API.

**Prerequisites:** Phase 1 (working frontend POC) and Phase 2 (working API with all endpoints verified via Swagger/tests).

---

## Task 3.1 – API Client Layer

**What:** Create a typed HTTP client that maps 1:1 to the backend endpoints, with centralised error handling and cookie-based auth.

**Steps:**

1. Create `src/services/api.ts`.

2. Create a base fetch wrapper:
   ```typescript
   const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:5001'

   async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
     const response = await fetch(`${BASE_URL}${path}`, {
       ...options,
       credentials: 'include',  // always send cookie
       headers: {
         'Content-Type': 'application/json',
         ...options.headers,
       },
     })

     if (response.status === 401) {
       // Redirect to login — use router or emit event
       window.location.href = '/login'
       throw new ApiError('Unauthorized', 401)
     }

     if (!response.ok) {
       const body = await response.json().catch(() => null)
       throw new ApiError(body?.message || response.statusText, response.status, body)
     }

     if (response.status === 204) return undefined as T
     return response.json()
   }
   ```

3. Create a custom error class:
   ```typescript
   export class ApiError extends Error {
     constructor(
       message: string,
       public status: number,
       public body?: unknown
     ) {
       super(message)
     }
   }
   ```

4. Export namespaced API methods:

   ```typescript
   export const auth = {
     register: (email: string, password: string) =>
       request<UserDto>('/api/auth/register', {
         method: 'POST',
         body: JSON.stringify({ email, password }),
       }),

     login: (email: string, password: string) =>
       request<UserDto>('/api/auth/login', {
         method: 'POST',
         body: JSON.stringify({ email, password }),
       }),

     logout: () =>
       request<void>('/api/auth/logout', { method: 'POST' }),

     me: () =>
       request<UserDto>('/api/auth/me'),
   }

   export const portfolios = {
     list: () =>
       request<PortfolioDto[]>('/api/portfolios'),

     create: (name: string) =>
       request<PortfolioDto>('/api/portfolios', {
         method: 'POST',
         body: JSON.stringify({ name }),
       }),

     update: (id: string, name: string) =>
       request<PortfolioDto>(`/api/portfolios/${id}`, {
         method: 'PUT',
         body: JSON.stringify({ name }),
       }),

     delete: (id: string) =>
       request<void>(`/api/portfolios/${id}`, { method: 'DELETE' }),
   }

   export const assets = {
     list: (portfolioId: string) =>
       request<AssetDto[]>(`/api/portfolios/${portfolioId}/assets`),

     create: (portfolioId: string, data: CreateAssetDto) =>
       request<AssetDto>(`/api/portfolios/${portfolioId}/assets`, {
         method: 'POST',
         body: JSON.stringify(data),
       }),

     update: (id: string, data: UpdateAssetDto) =>
       request<AssetDto>(`/api/assets/${id}`, {
         method: 'PUT',
         body: JSON.stringify(data),
       }),

     delete: (id: string) =>
       request<void>(`/api/assets/${id}`, { method: 'DELETE' }),
   }

   export const projections = {
     run: (portfolioId: string, settings: ProjectionRequestDto) =>
       request<ProjectionResultDto>(`/api/portfolios/${portfolioId}/projections`, {
         method: 'POST',
         body: JSON.stringify(settings),
       }),
   }
   ```

5. Create `.env.development`:
   ```
   VITE_API_BASE_URL=https://localhost:5001
   ```

**Acceptance criteria:**
- All API methods are typed with request and response DTOs
- `credentials: 'include'` is set on every request
- 401 responses redirect to `/login`
- Non-OK responses throw `ApiError` with status and body
- 204 responses return without attempting to parse JSON

---

## Task 3.2 – API Response Types

**What:** Add TypeScript types mirroring the backend DTOs, kept separate from the existing frontend-only types.

**Steps:**

1. Create `src/types/api.ts`:

   ```typescript
   export interface UserDto {
     email: string
   }

   export interface PortfolioDto {
     id: string
     name: string
     createdAt: string
     assetCount: number
   }

   export interface AssetDto {
     id: string
     portfolioId: string
     name: string
     symbol: string
     shares: number
     buyPrice: number
     currentSharePrice: number
     currentValue: number
     dividendYield: number
     priceAppreciationPct: number | null
     dividendGrowthPct: number | null
     cgtTaxRate: number | null
     withholdingTaxRate: number | null
     deemedDisposalEnabled: boolean
     annualContribution: number
   }

   export interface CreateAssetDto {
     name: string
     symbol: string
     shares: number
     buyPrice: number
     currentSharePrice: number
     dividendYield: number
     priceAppreciationPct: number | null
     dividendGrowthPct: number | null
     cgtTaxRate: number | null
     withholdingTaxRate: number | null
     deemedDisposalEnabled: boolean
     annualContribution: number
   }

   export interface UpdateAssetDto extends CreateAssetDto {}

   export interface ProjectionRequestDto {
     years: number
     inflationRate: number
   }

   export interface DeemedDisposalEventDto {
     assetName: string
     assetSymbol: string
     lotPurchaseYear: number
     gain: number
     taxAmount: number
     sharesReduced: number
   }

   export interface YearRowDto {
     year: number
     totalWealth: number
     wealthDelta: number
     dividends: number
     dividendsDelta: number
     taxPaid: number
     deemedDisposalTax: number
     deemedDisposalEvents: DeemedDisposalEventDto[]
     accumWealth: number
     accumDividends: number
     accumTaxPaid: number
     realWealth: number
     realAccumDividends: number
   }

   export interface ProjectionResultDto {
     rows: YearRowDto[]
   }
   ```

2. **Important:** All percentage/rate values in API types are decimals (e.g. `0.03` for 3%), matching the backend. The frontend form components handle the conversion to/from display percentages. These types represent the wire format.

3. Update the existing `src/types/index.ts` to import and re-export from `api.ts` where types overlap, or keep them separate if the local `Asset` type diverges from `AssetDto`. Prefer using `AssetDto` directly going forward.

**Acceptance criteria:**
- All types match the backend DTOs exactly (field names use camelCase as returned by ASP.NET's default JSON serialisation)
- Types are importable from `@/types/api`
- No `any` types used

---

## Task 3.3 – Auth Store

**What:** Create a Pinia store that manages authentication state and provides login/register/logout actions.

**Steps:**

1. Create `src/stores/auth.ts`:

   ```typescript
   export const useAuthStore = defineStore('auth', () => {
     const user = ref<UserDto | null>(null)
     const loading = ref(false)
     const error = ref<string | null>(null)
     const isAuthenticated = computed(() => user.value !== null)

     async function fetchUser() {
       try {
         user.value = await auth.me()
       } catch {
         user.value = null
       }
     }

     async function login(email: string, password: string) {
       loading.value = true
       error.value = null
       try {
         user.value = await auth.login(email, password)
       } catch (e) {
         error.value = e instanceof ApiError && e.status === 401
           ? 'Invalid email or password'
           : 'Something went wrong. Please try again.'
         throw e
       } finally {
         loading.value = false
       }
     }

     async function register(email: string, password: string) {
       loading.value = true
       error.value = null
       try {
         user.value = await auth.register(email, password)
       } catch (e) {
         if (e instanceof ApiError && e.body) {
           // Extract Identity validation errors
           error.value = extractIdentityErrors(e.body)
         } else {
           error.value = 'Something went wrong. Please try again.'
         }
         throw e
       } finally {
         loading.value = false
       }
     }

     async function logout() {
       await auth.logout()
       user.value = null
     }

     return { user, loading, error, isAuthenticated, fetchUser, login, register, logout }
   })
   ```

2. Create a helper `extractIdentityErrors(body: unknown): string` that parses ASP.NET Identity error responses (which can vary in shape) into a human-readable string. Handle both `{ errors: { field: [messages] } }` and `{ errors: [{ code, description }] }` formats.

3. Call `fetchUser()` on app initialisation. In `App.vue` or `main.ts`:
   ```typescript
   const authStore = useAuthStore()
   await authStore.fetchUser()
   ```
   This silently checks if the user already has a valid session cookie. If not, `user` stays null.

**Acceptance criteria:**
- `isAuthenticated` is reactive and reflects current auth state
- `login()` sets user on success, sets error on failure
- `register()` handles Identity validation errors (duplicate email, weak password)
- `logout()` clears user state
- `fetchUser()` silently succeeds or fails without throwing

---

## Task 3.4 – Router and Navigation Guards

**What:** Set up Vue Router with all routes and authentication guards.

**Steps:**

1. Update `src/router/index.ts` with the following routes:

   ```typescript
   const routes = [
     {
       path: '/login',
       name: 'login',
       component: () => import('@/views/LoginView.vue'),
       meta: { guest: true },
     },
     {
       path: '/register',
       name: 'register',
       component: () => import('@/views/RegisterView.vue'),
       meta: { guest: true },
     },
     {
       path: '/portfolios',
       name: 'portfolios',
       component: () => import('@/views/PortfoliosView.vue'),
       meta: { requiresAuth: true },
     },
     {
       path: '/portfolios/:id',
       name: 'portfolio',
       component: () => import('@/views/PortfolioDetailView.vue'),
       meta: { requiresAuth: true },
     },
     {
       path: '/portfolios/:id/projections',
       name: 'projections',
       component: () => import('@/views/ProjectionsView.vue'),
       meta: { requiresAuth: true },
     },
     {
       path: '/',
       redirect: '/portfolios',
     },
   ]
   ```

2. Add a global `beforeEach` navigation guard:
   ```typescript
   router.beforeEach(async (to) => {
     const authStore = useAuthStore()

     // If we haven't checked auth yet, do it now
     if (authStore.user === null && !authStore._hasChecked) {
       await authStore.fetchUser()
     }

     if (to.meta.requiresAuth && !authStore.isAuthenticated) {
       return { name: 'login', query: { redirect: to.fullPath } }
     }

     if (to.meta.guest && authStore.isAuthenticated) {
       return { name: 'portfolios' }
     }
   })
   ```

3. Add a `_hasChecked` flag to the auth store (set to `true` after `fetchUser()` completes, whether success or failure) to avoid re-checking on every navigation.

4. **Guest routes** (`/login`, `/register`): if already authenticated, redirect to `/portfolios`.

5. **Auth routes** (everything else): if not authenticated, redirect to `/login` with a `redirect` query param so the user can be sent back after login.

**Acceptance criteria:**
- Unauthenticated users are redirected to `/login` when accessing protected routes
- Authenticated users are redirected away from `/login` and `/register`
- After login, user is redirected to the originally requested page (via `redirect` query param)
- Navigation guard checks auth once and caches the result

---

## Task 3.5 – Login Page

**What:** Build the login page.

**Steps:**

1. Create `src/views/LoginView.vue`.

2. Layout: centred `v-card` with `max-width="450"` containing:
   - Card title: "Sign in"
   - `v-text-field` for email (type email, required, `autocomplete="email"`)
   - `v-text-field` for password (type password, required, `autocomplete="current-password"`, append-inner-icon toggle for show/hide)
   - `v-alert` for error messages (type error, shown when `authStore.error` is set)
   - "Sign in" `v-btn` (colour primary, block, loading state bound to `authStore.loading`)
   - Text link below: "Don't have an account? Register" → navigates to `/register`

3. On submit:
   - Call `authStore.login(email, password)`
   - On success, navigate to `route.query.redirect || '/portfolios'`
   - On failure, error is displayed via the store's reactive `error` ref

4. Form should submit on Enter key press.

5. Disable the submit button while `loading` is true.

**Acceptance criteria:**
- Successful login redirects to portfolios (or redirect target)
- Failed login shows error message in alert
- Password visibility toggle works
- Form validates that both fields are non-empty before submitting
- Button shows loading spinner during API call
- Enter key submits the form

---

## Task 3.6 – Register Page

**What:** Build the registration page.

**Steps:**

1. Create `src/views/RegisterView.vue`.

2. Layout: same centred card pattern as login, with:
   - Card title: "Create account"
   - `v-text-field` for email (type email, required, `autocomplete="email"`)
   - `v-text-field` for password (type password, required, `autocomplete="new-password"`, append-inner-icon toggle)
   - `v-text-field` for confirm password (type password, required, must match password)
   - `v-alert` for error messages
   - "Create account" `v-btn` (colour primary, block, loading state)
   - Text link: "Already have an account? Sign in" → `/login`

3. Client-side validation before submit:
   - Email is non-empty and valid format
   - Password is at least 8 characters
   - Confirm password matches password
   - If validation fails, show inline error (Vuetify `:rules` prop)

4. On submit:
   - Call `authStore.register(email, password)`
   - On success, navigate to `/portfolios`
   - On failure, show server-side error (e.g. "Email already taken", "Password too weak")

**Acceptance criteria:**
- Confirm password mismatch shows validation error before submit
- Password length validation works client-side
- Server errors (duplicate email, weak password) display correctly
- Successful registration logs the user in and redirects

---

## Task 3.7 – App Shell and Navigation

**What:** Update the app shell with proper navigation, user info, and logout.

**Steps:**

1. Update `App.vue`:

   ```vue
   <template>
     <v-app>
       <v-app-bar flat>
         <v-app-bar-title>Wealth Accumulation Simulator</v-app-bar-title>
         <template v-if="authStore.isAuthenticated" #append>
           <span class="text-body-2 mr-4">{{ authStore.user?.email }}</span>
           <v-btn variant="text" @click="handleLogout">Logout</v-btn>
         </template>
       </v-app-bar>

       <v-main>
         <v-container>
           <router-view />
         </v-container>
       </v-main>
     </v-app>
   </template>
   ```

2. `handleLogout`:
   - Call `authStore.logout()`
   - Navigate to `/login`

3. Add breadcrumb-style navigation on protected pages. Create a composable `src/composables/useBreadcrumbs.ts`:
   ```typescript
   // Returns breadcrumb items based on current route
   // /portfolios → [Portfolios]
   // /portfolios/:id → [Portfolios, Portfolio Name]
   // /portfolios/:id/projections → [Portfolios, Portfolio Name, Projections]
   ```

4. Add a `v-breadcrumbs` component below the app bar on protected routes, using the composable. Portfolio name should be fetched from the portfolio store (Task 3.8).

**Acceptance criteria:**
- App bar shows title on all pages
- User email and logout button shown only when authenticated
- Logout clears state and redirects to login
- Breadcrumbs reflect the current route hierarchy
- Breadcrumb links navigate correctly

---

## Task 3.8 – Portfolio Store and List View

**What:** Create a Pinia store for portfolios and the portfolio list page.

**Steps:**

1. Create `src/stores/portfolio.ts`:

   ```typescript
   export const usePortfolioStore = defineStore('portfolio', () => {
     const items = ref<PortfolioDto[]>([])
     const current = ref<PortfolioDto | null>(null)
     const loading = ref(false)

     async function fetchAll() {
       loading.value = true
       try {
         items.value = await portfolios.list()
       } finally {
         loading.value = false
       }
     }

     async function create(name: string) {
       const portfolio = await portfolios.create(name)
       items.value.unshift(portfolio)
       return portfolio
     }

     async function update(id: string, name: string) {
       const updated = await portfolios.update(id, name)
       const idx = items.value.findIndex(p => p.id === id)
       if (idx !== -1) items.value[idx] = updated
       if (current.value?.id === id) current.value = updated
       return updated
     }

     async function remove(id: string) {
       await portfolios.delete(id)
       items.value = items.value.filter(p => p.id !== id)
       if (current.value?.id === id) current.value = null
     }

     async function fetchOne(id: string) {
       // Use cached if available, otherwise fetch all and find
       let found = items.value.find(p => p.id === id)
       if (!found) {
         await fetchAll()
         found = items.value.find(p => p.id === id)
       }
       current.value = found ?? null
       return current.value
     }

     return { items, current, loading, fetchAll, create, update, remove, fetchOne }
   })
   ```

2. Create `src/views/PortfoliosView.vue`:

   - On mount, call `portfolioStore.fetchAll()`
   - Show a `v-progress-linear` while loading
   - Display portfolios as `v-card` items in a `v-row` / `v-col` grid (2–3 columns):
     - Each card shows: portfolio name, asset count, created date
     - Click on card → navigate to `/portfolios/:id`
     - Each card has an overflow menu (`v-menu` with `v-btn` icon) with "Rename" and "Delete" options
   - "Create Portfolio" `v-btn` at the top → opens a `v-dialog` with a single `v-text-field` for name
   - Rename → opens the same dialog, pre-filled with current name
   - Delete → opens a `v-dialog` confirmation: "Delete portfolio '{name}' and all its assets? This cannot be undone."

3. Empty state: when no portfolios exist, show a centred message "No portfolios yet" with a "Create your first portfolio" button.

**Acceptance criteria:**
- Portfolios load on mount and display in cards
- Create portfolio adds it to the list without full reload
- Rename updates the card in-place
- Delete removes the card and shows confirmation first
- Empty state displays when no portfolios exist
- Clicking a card navigates to the portfolio detail

---

## Task 3.9 – Asset Store

**What:** Create a Pinia store for assets, replacing the Phase 1 in-memory store.

**Steps:**

1. Create `src/stores/assets.ts`:

   ```typescript
   export const useAssetStore = defineStore('assets', () => {
     const items = ref<AssetDto[]>([])
     const loading = ref(false)
     const currentPortfolioId = ref<string | null>(null)

     async function fetchAll(portfolioId: string) {
       loading.value = true
       currentPortfolioId.value = portfolioId
       try {
         items.value = await assets.list(portfolioId)
       } finally {
         loading.value = false
       }
     }

     async function create(portfolioId: string, data: CreateAssetDto) {
       const asset = await assets.create(portfolioId, data)
       items.value.push(asset)
       return asset
     }

     async function update(id: string, data: UpdateAssetDto) {
       const updated = await assets.update(id, data)
       const idx = items.value.findIndex(a => a.id === id)
       if (idx !== -1) items.value[idx] = updated
       return updated
     }

     async function remove(id: string) {
       await assets.delete(id)
       items.value = items.value.filter(a => a.id !== id)
     }

     function clear() {
       items.value = []
       currentPortfolioId.value = null
     }

     return { items, loading, currentPortfolioId, fetchAll, create, update, remove, clear }
   })
   ```

2. **Important:** The `CreateAssetDto` and `UpdateAssetDto` sent to the API use decimal rates (e.g. `0.03`). The form components from Phase 1 handle the conversion from display percentages. Ensure the store passes values through without additional conversion.

**Acceptance criteria:**
- `fetchAll` loads assets for a specific portfolio
- CRUD operations update the reactive `items` array without requiring a full refresh
- `clear()` resets state (used when navigating away from a portfolio)

---

## Task 3.10 – Portfolio Detail View (Asset Management)

**What:** Rewire the Phase 1 asset management UI to use the API-backed store and embed it in the portfolio detail route.

**Steps:**

1. Create `src/views/PortfolioDetailView.vue`.

2. On mount:
   - Extract `id` from `route.params`
   - Call `portfolioStore.fetchOne(id)` to get portfolio name (for breadcrumbs)
   - Call `assetStore.fetchAll(id)` to load assets
   - Show `v-progress-linear` while loading

3. Reuse the `AssetTable` component from Phase 1 (Task 1.5):
   - Bind `:assets="assetStore.items"`
   - On edit event → open `AssetFormDialog` in edit mode
   - On delete event → show confirmation dialog, then call `assetStore.remove(id)`

4. Reuse the `AssetFormDialog` component from Phase 1 (Task 1.6):
   - On save in **create mode** → call `assetStore.create(portfolioId, data)`
   - On save in **edit mode** → call `assetStore.update(assetId, data)`
   - The form still handles percentage ↔ decimal conversion internally
   - Add loading state to the save button (disable during API call)
   - On error → show error in a `v-alert` inside the dialog

5. Add a `v-btn` to navigate to projections: "Run Projections →" at the bottom of the page, navigates to `/portfolios/:id/projections`.

6. Add toast notifications:
   - Asset created: "Asset added successfully"
   - Asset updated: "Asset updated"
   - Asset deleted: "Asset deleted"
   - Error: "Failed to save asset. Please try again."

7. Create a composable `src/composables/useSnackbar.ts`:
   ```typescript
   const snackbar = ref({ show: false, text: '', color: 'success' })

   function showSuccess(text: string) { ... }
   function showError(text: string) { ... }
   ```
   Provide via `provide`/`inject` or a simple Pinia store. Render the `v-snackbar` in `App.vue`.

8. On unmount (leaving the portfolio), call `assetStore.clear()`.

**Acceptance criteria:**
- Assets load from the API on mount
- Add/edit/delete work through the API and update the table reactively
- Loading states visible during API calls
- Toast notifications appear on success/failure
- Navigating away clears asset state
- Link to projections view is visible

---

## Task 3.11 – Projections View

**What:** Rewire the projection UI to call the backend and display results.

**Steps:**

1. Create `src/views/ProjectionsView.vue`.

2. On mount:
   - Extract `id` from `route.params`
   - Call `portfolioStore.fetchOne(id)` (for breadcrumbs/context)
   - Call `assetStore.fetchAll(id)` (to show asset count / context)

3. Reuse the `ProjectionControls` component from Phase 1 (Task 1.7):
   - On `run-projection` event:
     ```typescript
     async function handleRunProjection(settings: ProjectionSettings) {
       projectionLoading.value = true
       try {
         const result = await projections.run(portfolioId, {
           years: settings.years,
           inflationRate: settings.inflationRate,
         })
         projectionRows.value = result.rows
       } catch {
         showError('Failed to run projection')
       } finally {
         projectionLoading.value = false
       }
     }
     ```

4. Show a `v-progress-linear` (indeterminate) while the projection is loading.

5. Reuse the `ProjectionTable` component from Phase 1 (Task 1.8):
   - Bind `:rows="projectionRows"`
   - Use `YearRowDto` type (from API types) — the shape is identical to the Phase 1 `YearRow`

6. Reuse the `ProjectionChart` component from Phase 1 (Task 1.9):
   - Bind `:rows="projectionRows"`

7. Show an info banner if the portfolio has no assets: "Add assets to your portfolio before running projections." with a link back to the portfolio detail page.

8. Add a "Back to Portfolio" link/button at the top.

9. State:
   ```typescript
   const projectionRows = ref<YearRowDto[]>([])
   const projectionLoading = ref(false)
   ```

**Acceptance criteria:**
- Clicking "Run Projection" calls the backend endpoint
- Loading indicator shown during API call
- Table and chart render with API response data
- Empty portfolio shows informational message instead of controls
- Error during projection shows toast notification
- Back navigation works

---

## Task 3.12 – Snackbar Notification System

**What:** Implement a global notification system for success/error toasts.

**Steps:**

1. Create `src/stores/snackbar.ts`:
   ```typescript
   export const useSnackbarStore = defineStore('snackbar', () => {
     const visible = ref(false)
     const text = ref('')
     const color = ref<'success' | 'error' | 'info'>('success')
     const timeout = ref(3000)

     function show(message: string, type: 'success' | 'error' | 'info' = 'success') {
       text.value = message
       color.value = type
       timeout.value = type === 'error' ? 5000 : 3000
       visible.value = true
     }

     function showSuccess(message: string) { show(message, 'success') }
     function showError(message: string) { show(message, 'error') }

     return { visible, text, color, timeout, show, showSuccess, showError }
   })
   ```

2. Add the `v-snackbar` to `App.vue`:
   ```vue
   <v-snackbar
     v-model="snackbarStore.visible"
     :color="snackbarStore.color"
     :timeout="snackbarStore.timeout"
     location="bottom right"
   >
     {{ snackbarStore.text }}
   </v-snackbar>
   ```

3. Update all views from Tasks 3.8, 3.10, 3.11 to use `snackbarStore.showSuccess()` and `snackbarStore.showError()` instead of inline snackbar state.

**Acceptance criteria:**
- Success messages appear as green snackbar, bottom-right, auto-dismiss after 3s
- Error messages appear as red snackbar, auto-dismiss after 5s
- Only one snackbar visible at a time (new one replaces old)
- All CRUD and projection operations show appropriate notifications

---

## Task 3.13 – Error Handling Refinement

**What:** Handle edge cases and improve the user experience around errors and loading states.

**Steps:**

1. **API client 401 handling update:**
   - Instead of hard redirecting on 401, set `authStore.user = null` and let the router guard handle the redirect.
   - This avoids the redirect happening for the `/api/auth/me` check on app init.
   - Update `src/services/api.ts`:
     ```typescript
     if (response.status === 401) {
       const authStore = useAuthStore()
       authStore.user = null
       throw new ApiError('Unauthorized', 401)
     }
     ```
   - The router guard will catch the unauthenticated state on next navigation.

2. **Network error handling:**
   - Wrap the `fetch` call in a try/catch for network failures (server down, no connectivity):
     ```typescript
     try {
       const response = await fetch(...)
     } catch (e) {
       throw new ApiError('Network error. Please check your connection.', 0)
     }
     ```

3. **Stale data on navigation:**
   - When navigating to `/portfolios/:id`, if the portfolio is not found (404 from API), redirect to `/portfolios` and show error toast: "Portfolio not found."
   - Same for `/portfolios/:id/projections` — if portfolio ID is invalid.

4. **Loading skeletons:**
   - Add `v-skeleton-loader` to the portfolio list page (type "card") while portfolios are loading.
   - Add `v-skeleton-loader` to the asset table (type "table") while assets are loading.
   - These replace the `v-progress-linear` for a better UX.

5. **Retry on failure:**
   - On projection failure, keep the "Run Projection" button enabled so the user can retry.
   - On asset list failure, show an inline error with a "Retry" button.

**Acceptance criteria:**
- 401 during normal use redirects to login without errors
- Network failures show a user-friendly message
- Invalid portfolio IDs redirect gracefully
- Loading skeletons appear while data is being fetched
- Retry is possible after failures

---

## Task 3.14 – End-to-End Smoke Test

**What:** Manual verification of the full integrated flow.

**Steps:**

1. Start the Docker PostgreSQL container: `docker compose up -d`
2. Start the API: `cd src/api/WealthAccSim.Api && dotnet run`
3. Start the frontend: `cd src/web && npm run dev`

4. **Test the following flow:**

   a) **Register:** Navigate to `/register`. Create account with `test@test.com` / `Test1234`. Verify redirect to `/portfolios`.

   b) **Create portfolio:** Click "Create Portfolio", enter "Test Portfolio". Verify card appears.

   c) **Add assets:** Click the portfolio card. Add an asset:
      - Name: VWCE, Symbol: VWCE, Shares: 100, Buy: €100, Current: €105
      - Dividend Yield: 2%, Price Appreciation: 5%, Withholding: 15%
      - Deemed Disposal: enabled, Annual Contribution: €1,200
      - Verify asset appears in table with correct values.

   d) **Edit asset:** Click edit, change shares to 150. Verify table updates.

   e) **Run projection:** Navigate to projections. Set 20 years, 2.5% inflation. Click run.
      - Verify table shows 20 rows
      - Verify deemed disposal tax appears in years 8 and 16
      - Verify chart renders with all 4 lines
      - Verify accumulated values increase year over year

   f) **Logout:** Click logout. Verify redirect to `/login`. Verify `/portfolios` is inaccessible.

   g) **Login:** Log back in with the same credentials. Verify portfolios and assets are persisted.

   h) **Second user isolation:** Register a second account. Verify it sees no portfolios. Create a portfolio. Log back as first user and verify the second user's data is not visible.

5. **Browser tests:**
   - Refresh the page while on `/portfolios/:id` — verify it reloads correctly (auth cookie persists).
   - Open `/portfolios` in a private/incognito window — verify redirect to `/login`.

**Acceptance criteria:**
- All steps in the flow complete without errors
- Data persists across page refreshes
- Data is isolated between users
- Auth cookie survives page refresh
- No console errors in the browser
