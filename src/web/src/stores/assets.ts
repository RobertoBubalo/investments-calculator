import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Asset } from '@/types'

export const useAssetStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([])

  function addAsset(asset: Omit<Asset, 'id'>) {
    assets.value.push({ ...asset, id: crypto.randomUUID() })
  }

  function updateAsset(id: string, data: Partial<Asset>) {
    const idx = assets.value.findIndex((a) => a.id === id)
    if (idx !== -1) assets.value[idx] = { ...assets.value[idx], ...data }
  }

  function deleteAsset(id: string) {
    assets.value = assets.value.filter((a) => a.id !== id)
  }

  // Seed with example data in dev
  if (import.meta.env.DEV && assets.value.length === 0) {
    addAsset({
      name: 'Vanguard FTSE All-World',
      symbol: 'VWCE',
      shares: 100,
      buyPrice: 100,
      currentSharePrice: 100,
      dividendYield: 0.03,
      priceAppreciationPct: 0.05,
      dividendGrowthPct: 0.01,
      cgtTaxRate: 0.33,
      withholdingTaxRate: 0.15,
      deemedDisposalEnabled: true,
      annualContribution: 1200,
    })
    addAsset({
      name: 'iShares Core S&P 500',
      symbol: 'CSPX',
      shares: 50,
      buyPrice: 450,
      currentSharePrice: 450,
      dividendYield: 0.013,
      priceAppreciationPct: 0.07,
      dividendGrowthPct: 0.02,
      cgtTaxRate: 0.33,
      withholdingTaxRate: 0.15,
      deemedDisposalEnabled: true,
      annualContribution: 600,
    })
  }

  return { assets, addAsset, updateAsset, deleteAsset }
})
