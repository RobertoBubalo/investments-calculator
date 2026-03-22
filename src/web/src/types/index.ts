export interface Asset {
  id: string
  name: string
  symbol: string
  shares: number
  buyPrice: number
  currentSharePrice: number
  dividendYield: number // as decimal, e.g. 0.03 = 3%
  priceAppreciationPct: number | null
  dividendGrowthPct: number | null
  cgtTaxRate: number | null
  withholdingTaxRate: number | null
  deemedDisposalEnabled: boolean
  dripEnabled: boolean // true = reinvest dividends as shares; false = accumulate as cash
  annualContribution: number
}

export interface ProjectionSettings {
  years: number
  inflationRate: number // as decimal, e.g. 0.025 = 2.5%
  cgtTaxRate?: number // global fallback CGT rate, e.g. 0.33 = 33%
  dividendIncomeTaxRate?: number // personal income tax on dividends, e.g. 0.40 = 40%
  deemedDisposalTaxRate?: number // exit tax rate on deemed disposal gains, defaults to 0.41
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
  sharesReduced: number // shares sold to cover the tax
}

export interface YearRow {
  year: number
  totalWealth: number
  wealthDelta: number
  dividends: number
  dividendsDelta: number
  taxPaid: number          // actual cash taxes: WHT + deemed disposal + dividend income tax
  unrealisedCgt: number    // paper CGT liability if sold today (informational, not included in taxPaid)
  dividendIncomeTax: number
  deemedDisposalTax: number
  deemedDisposalEvents: DeemedDisposalEvent[]
  accumWealth: number
  accumDividends: number
  accumTaxPaid: number
  realWealth: number
  realAccumDividends: number
}
