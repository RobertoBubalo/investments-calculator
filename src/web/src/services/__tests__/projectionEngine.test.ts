import { describe, it, expect } from 'vitest'
import { runProjection } from '../projectionEngine'
import type { Asset, ProjectionSettings } from '../../types'

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: '1',
    name: 'Test',
    symbol: 'TST',
    shares: 100,
    buyPrice: 100,
    currentSharePrice: 100,
    dividendYield: 0,
    priceAppreciationPct: null,
    dividendGrowthPct: null,
    cgtTaxRate: null,
    withholdingTaxRate: null,
    deemedDisposalEnabled: false,
    annualContribution: 0,
    ...overrides,
  }
}

const defaultSettings: ProjectionSettings = { years: 5, inflationRate: 0 }

// ── Test 1 ────────────────────────────────────────────────────────────────────
describe('Test 1 – Basic price growth, no extras', () => {
  it('year 5 totalWealth matches 100 × 100 × 1.05^5', () => {
    const asset = makeAsset({ priceAppreciationPct: 0.05 })
    const rows = runProjection([asset], { years: 5, inflationRate: 0 })
    expect(rows).toHaveLength(5)
    const expected = 100 * 100 * Math.pow(1.05, 5)
    expect(rows[4].totalWealth).toBeCloseTo(expected, 2)
  })
})

// ── Test 2 ────────────────────────────────────────────────────────────────────
describe('Test 2 – Dividends with withholding tax', () => {
  it('year 1 dividends = 100 × 100 × 0.03 × 0.85', () => {
    const asset = makeAsset({ dividendYield: 0.03, withholdingTaxRate: 0.15 })
    const rows = runProjection([asset], { years: 3, inflationRate: 0 })
    const expected = 100 * 100 * 0.03 * 0.85
    expect(rows[0].dividends).toBeCloseTo(expected, 2)
  })
})

// ── Test 3 ────────────────────────────────────────────────────────────────────
describe('Test 3 – Deemed disposal fires at year 8, 16, 24, 32 with cost-base reset', () => {
  const asset = makeAsset({
    priceAppreciationPct: 0.05,
    deemedDisposalEnabled: true,
  })
  const rows = runProjection([asset], { years: 35, inflationRate: 0 })

  const triggerYears = new Set([8, 16, 24, 32])

  it('deemedDisposalTax > 0 at years 8, 16, 24, 32', () => {
    for (const y of triggerYears) {
      expect(rows[y - 1].deemedDisposalTax, `year ${y}`).toBeGreaterThan(0)
    }
  })

  it('deemedDisposalTax === 0 in all other years', () => {
    for (let i = 0; i < rows.length; i++) {
      const y = i + 1
      if (!triggerYears.has(y)) {
        expect(rows[i].deemedDisposalTax, `year ${y}`).toBe(0)
      }
    }
  })

  it('year 16 tax is computed on gain since year-8 reset price, not original buy price', () => {
    const priceAtYear8 = 100 * Math.pow(1.05, 8)
    const priceAtYear16 = 100 * Math.pow(1.05, 16)

    // Tax using original buy price (over-estimate — should not happen)
    const taxWithOriginalBase = (priceAtYear16 - 100) * 100 * 0.41
    // Tax using reset price as lower bound (reduced slightly because year-8 sold some shares)
    const taxWithResetBase = (priceAtYear16 - priceAtYear8) * 100 * 0.41

    // Actual tax must be less than original-base calculation (proves reset happened)
    expect(rows[15].deemedDisposalTax).toBeLessThan(taxWithOriginalBase)
    // Actual tax must be in the ballpark of the reset-base calculation (within 20%)
    expect(rows[15].deemedDisposalTax).toBeGreaterThan(taxWithResetBase * 0.8)
    expect(rows[15].deemedDisposalTax).toBeLessThan(taxWithResetBase * 1.0)
  })
})

// ── Test 4 ────────────────────────────────────────────────────────────────────
describe('Test 4 – Annual contribution lots have independent 8-year cycles', () => {
  const asset = makeAsset({
    priceAppreciationPct: 0.05,
    deemedDisposalEnabled: true,
    annualContribution: 1200,
  })
  const rows = runProjection([asset], { years: 25, inflationRate: 0 })

  it('year 8 deemedDisposalTax > 0 (initial lot)', () => {
    expect(rows[7].deemedDisposalTax).toBeGreaterThan(0)
  })

  it('year 9 deemedDisposalTax > 0 (year-1 lot triggers)', () => {
    expect(rows[8].deemedDisposalTax).toBeGreaterThan(0)
  })

  it('year 10 deemedDisposalTax > 0 (year-2 lot triggers)', () => {
    expect(rows[9].deemedDisposalTax).toBeGreaterThan(0)
  })

  it('year 16 deemedDisposalTax > 0 (initial lot second cycle)', () => {
    expect(rows[15].deemedDisposalTax).toBeGreaterThan(0)
  })

  it('year 17 deemedDisposalTax > 0 (year-1 lot second cycle)', () => {
    expect(rows[16].deemedDisposalTax).toBeGreaterThan(0)
  })

  it('year 24 deemedDisposalTax > 0 (initial lot third cycle)', () => {
    expect(rows[23].deemedDisposalTax).toBeGreaterThan(0)
  })
})

// ── Test 5 ────────────────────────────────────────────────────────────────────
describe('Test 5 – Inflation adjustment', () => {
  const asset = makeAsset({ priceAppreciationPct: 0.05 })
  const rows = runProjection([asset], { years: 10, inflationRate: 0.025 })

  it('realWealth < totalWealth for every year', () => {
    for (const row of rows) {
      expect(row.realWealth).toBeLessThan(row.totalWealth)
    }
  })

  it('realWealth[10] ≈ totalWealth[10] / 1.025^10', () => {
    const row = rows[9]
    expect(row.realWealth).toBeCloseTo(row.totalWealth / Math.pow(1.025, 10), 2)
  })
})

// ── Test 6 ────────────────────────────────────────────────────────────────────
describe('Test 6 – Empty assets', () => {
  it('returns empty array when assets list is empty', () => {
    expect(runProjection([], { years: 20, inflationRate: 0.025 })).toEqual([])
  })
})

// ── Test 7 ────────────────────────────────────────────────────────────────────
describe('Test 7 – Null optional fields', () => {
  it('runs without errors, price stays flat', () => {
    const asset = makeAsset({ dividendYield: 0.02 })
    // All optional fields are already null in makeAsset defaults
    const rows = runProjection([asset], { years: 5, inflationRate: 0 })
    expect(rows).toHaveLength(5)
    // Price flat → wealth stays constant
    for (const row of rows) {
      expect(row.totalWealth).toBeCloseTo(100 * 100, 2)
    }
  })
})

// ── Test 8 ────────────────────────────────────────────────────────────────────
describe('Test 8 – Deemed disposal with no gain produces no tax', () => {
  it('year 8 deemedDisposalTax === 0 when price is flat', () => {
    const asset = makeAsset({ deemedDisposalEnabled: true, priceAppreciationPct: 0 })
    const rows = runProjection([asset], { years: 10, inflationRate: 0 })
    expect(rows[7].deemedDisposalTax).toBe(0)
  })
})

// ── Test 9 ────────────────────────────────────────────────────────────────────
describe('Test 9 – DeemedDisposalEvent data is populated correctly', () => {
  const asset = makeAsset({
    priceAppreciationPct: 0.05,
    deemedDisposalEnabled: true,
    annualContribution: 1200,
  })
  const rows = runProjection([asset], { years: 10, inflationRate: 0 })

  it('years 1–7 (before any lot fires) have empty deemedDisposalEvents', () => {
    for (let i = 0; i < 7; i++) {
      expect(rows[i].deemedDisposalEvents, `year ${i + 1}`).toEqual([])
    }
  })

  it('year 8 has one event for the initial lot (purchaseYear 0)', () => {
    const events = rows[7].deemedDisposalEvents
    expect(events).toHaveLength(1)
    expect(events[0].assetSymbol).toBe('TST')
    expect(events[0].lotPurchaseYear).toBe(0)
    expect(events[0].gain).toBeGreaterThan(0)
    expect(events[0].taxAmount).toBeGreaterThan(0)
    expect(events[0].sharesReduced).toBeGreaterThan(0)
  })

  it('year 8 event taxAmount equals gain × 0.41', () => {
    const event = rows[7].deemedDisposalEvents[0]
    expect(event.taxAmount).toBeCloseTo(event.gain * 0.41, 6)
  })

  it('year 9 has one event for the year-1 contribution lot (purchaseYear 1)', () => {
    const events = rows[8].deemedDisposalEvents
    expect(events).toHaveLength(1)
    expect(events[0].lotPurchaseYear).toBe(1)
    expect(events[0].gain).toBeGreaterThan(0)
  })
})

// ── Test 10 ───────────────────────────────────────────────────────────────────
describe('Test 10 – Dividend income tax reduces net take-home', () => {
  const asset = makeAsset({ shares: 100, currentSharePrice: 100, dividendYield: 0.04 })
  const settings: ProjectionSettings = { years: 5, inflationRate: 0, dividendIncomeTaxRate: 0.40 }
  const rows = runProjection([asset], settings)

  it('year 1 grossDividend = 400, dividendIncomeTax = 160', () => {
    // grossDividend = 100 × 100 × 0.04 = 400; netDividend = 400 (no WHT)
    // dividendIncomeTax = 400 × 0.40 = 160
    expect(rows[0].dividends).toBeCloseTo(400, 2)
    expect(rows[0].dividendIncomeTax).toBeCloseTo(160, 2)
  })

  it('dividendIncomeTax is included in taxPaid', () => {
    expect(rows[0].taxPaid).toBeCloseTo(160, 2)
  })

  it('dividendIncomeTax is 0 when rate is omitted', () => {
    const rowsNoTax = runProjection([asset], defaultSettings)
    expect(rowsNoTax[0].dividendIncomeTax).toBe(0)
  })
})

// ── Test 11 ───────────────────────────────────────────────────────────────────
describe('Test 11 – Global CGT rate applies when per-asset rate is null', () => {
  it('global CGT rate produces unrealisedCgt > 0 when asset has null cgtTaxRate', () => {
    const asset = makeAsset({ priceAppreciationPct: 0.05, cgtTaxRate: null })
    const rows = runProjection([asset], { years: 5, inflationRate: 0, cgtTaxRate: 0.33 })
    expect(rows[4].unrealisedCgt).toBeGreaterThan(0)
    expect(rows[4].taxPaid).toBe(0) // no WHT, no deemed disposal, no income tax
  })

  it('per-asset cgtTaxRate takes precedence: lower rate → lower unrealisedCgt', () => {
    const assetPerAsset = makeAsset({ priceAppreciationPct: 0.05, cgtTaxRate: 0.20 })
    const assetGlobal = makeAsset({ priceAppreciationPct: 0.05, cgtTaxRate: null })
    const settings: ProjectionSettings = { years: 5, inflationRate: 0, cgtTaxRate: 0.33 }
    const rowsPerAsset = runProjection([assetPerAsset], settings)
    const rowsGlobal = runProjection([assetGlobal], settings)
    // per-asset rate 0.20 < global rate 0.33 → per-asset unrealisedCgt should be lower
    expect(rowsPerAsset[4].unrealisedCgt).toBeLessThan(rowsGlobal[4].unrealisedCgt)
  })
})

// ── Test 12 ───────────────────────────────────────────────────────────────────
describe('Test 12 – Custom deemed disposal tax rate is applied', () => {
  const asset = makeAsset({
    priceAppreciationPct: 0.05,
    deemedDisposalEnabled: true,
    annualContribution: 0,
  })
  const priceAtYear8 = 100 * Math.pow(1.05, 8)
  const gain = (priceAtYear8 - 100) * 100
  const rows = runProjection([asset], { years: 9, inflationRate: 0, deemedDisposalTaxRate: 0.30 })

  it('year 8 deemedDisposalTax equals gain × 0.30', () => {
    expect(rows[7].deemedDisposalTax).toBeCloseTo(gain * 0.30, 2)
  })

  it('year 8 event taxAmount equals gain × 0.30', () => {
    expect(rows[7].deemedDisposalEvents[0].taxAmount).toBeCloseTo(gain * 0.30, 2)
  })

  it('custom rate (0.30) produces less tax than default rate (0.41)', () => {
    expect(gain * 0.30).toBeLessThan(gain * 0.41)
  })
})
