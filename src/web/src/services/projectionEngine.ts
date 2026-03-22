import type { Asset, AssetSimState, DeemedDisposalEvent, ProjectionSettings, YearRow } from '@/types'

export function runProjection(assets: Asset[], settings: ProjectionSettings): YearRow[] {
  if (settings.years === 0 || assets.length === 0) return []

  // Filter out zero-share assets
  const activeAssets = assets.filter((a) => a.shares > 0)
  if (activeAssets.length === 0) return []

  // Initialise sim state for each asset (year 0)
  const simStates: AssetSimState[] = activeAssets.map((asset) => ({
    assetId: asset.id,
    lots: [{ shares: asset.shares, costBase: asset.buyPrice, purchaseYear: 0 }],
    sharePrice: asset.currentSharePrice,
    dividendYield: asset.dividendYield,
  }))

  const deemedDisposalRate = settings.deemedDisposalTaxRate ?? 0.41

  const rows: YearRow[] = []
  let prevTotalWealth = activeAssets.reduce(
    (sum, a) => sum + a.shares * a.currentSharePrice,
    0,
  )
  let prevDividends = 0
  let accumDividends = 0
  let accumTaxPaid = 0
  let cashBalance = 0 // accumulated take-home dividends from non-DRIP assets

  for (let y = 1; y <= settings.years; y++) {
    let portfolioWealth = 0
    let dividends = 0
    let taxPaid = 0
    let unrealisedCgt = 0
    let dividendIncomeTax = 0
    let deemedDisposalTax = 0
    const deemedDisposalEvents: DeemedDisposalEvent[] = []

    for (let i = 0; i < activeAssets.length; i++) {
      const asset = activeAssets[i]
      const sim = simStates[i]

      // a) Price appreciation
      sim.sharePrice *= 1 + (asset.priceAppreciationPct ?? 0)

      // b) Annual contribution → new lot
      if (asset.annualContribution > 0) {
        const newShares = asset.annualContribution / sim.sharePrice
        sim.lots.push({ shares: newShares, costBase: sim.sharePrice, purchaseYear: y })
      }

      // c) Deemed disposal
      let assetDeemedTax = 0
      if (asset.deemedDisposalEnabled) {
        for (const lot of sim.lots) {
          const yearsHeld = y - lot.purchaseYear
          if (yearsHeld > 0 && yearsHeld % 8 === 0) {
            const gain = (sim.sharePrice - lot.costBase) * lot.shares
            if (gain > 0) {
              const tax = gain * deemedDisposalRate
              const sharesToSell = tax / sim.sharePrice
              lot.shares = Math.max(0, lot.shares - sharesToSell)
              lot.costBase = sim.sharePrice
              assetDeemedTax += tax
              deemedDisposalEvents.push({
                assetName: asset.name,
                assetSymbol: asset.symbol,
                lotPurchaseYear: lot.purchaseYear,
                gain,
                taxAmount: tax,
                sharesReduced: sharesToSell,
              })
            } else {
              // Reset cost base even with no gain
              lot.costBase = sim.sharePrice
            }
          }
        }
      }

      // d) Dividends — based on shares held before any DRIP reinvestment
      const totalSharesForDiv = sim.lots.reduce((sum, lot) => sum + lot.shares, 0)
      sim.dividendYield *= 1 + (asset.dividendGrowthPct ?? 0)
      const grossDividend = totalSharesForDiv * sim.sharePrice * sim.dividendYield
      const whTax = grossDividend * (asset.withholdingTaxRate ?? 0)
      const netDividend = grossDividend - whTax
      const assetIncomeTax = netDividend * (settings.dividendIncomeTaxRate ?? 0)
      const takeHome = netDividend - assetIncomeTax

      // e) DRIP or cash accumulation
      if (asset.dripEnabled && takeHome > 0) {
        sim.lots.push({ shares: takeHome / sim.sharePrice, costBase: sim.sharePrice, purchaseYear: y })
      } else {
        cashBalance += takeHome
      }

      // f) CGT (unrealised, informational) — uses all lots including any DRIP lot just added
      const effectiveCgtRate = asset.cgtTaxRate ?? (settings.cgtTaxRate ?? 0)
      let cgtTax = 0
      for (const lot of sim.lots) {
        const lotGain = (sim.sharePrice - lot.costBase) * lot.shares
        if (lotGain > 0) {
          cgtTax += lotGain * effectiveCgtRate
        }
      }

      // g) Portfolio value — uses all lots including any DRIP lot
      const totalShares = sim.lots.reduce((sum, lot) => sum + lot.shares, 0)
      const portfolioValue = totalShares * sim.sharePrice

      portfolioWealth += portfolioValue
      dividends += netDividend
      taxPaid += whTax + assetDeemedTax + assetIncomeTax
      unrealisedCgt += cgtTax
      dividendIncomeTax += assetIncomeTax
      deemedDisposalTax += assetDeemedTax
    }

    const totalWealth = portfolioWealth + cashBalance

    accumDividends += dividends
    accumTaxPaid += taxPaid

    rows.push({
      year: y,
      totalWealth,
      wealthDelta: totalWealth - prevTotalWealth,
      dividends,
      dividendsDelta: dividends - prevDividends,
      taxPaid,
      unrealisedCgt,
      dividendIncomeTax,
      deemedDisposalTax,
      deemedDisposalEvents,
      accumWealth: totalWealth,
      accumDividends,
      accumTaxPaid,
      realWealth: totalWealth / Math.pow(1 + settings.inflationRate, y),
      realAccumDividends: accumDividends / Math.pow(1 + settings.inflationRate, y),
    })

    prevTotalWealth = totalWealth
    prevDividends = dividends
  }

  return rows
}
