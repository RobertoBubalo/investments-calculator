export function useFormatters() {
  function formatCurrency(value: number): string {
    return '€' + value.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatPercent(value: number): string {
    return (value * 100).toFixed(2) + '%'
  }

  function formatDelta(value: number): string {
    const prefix = value >= 0 ? '+' : ''
    return prefix + formatCurrency(value)
  }

  return { formatCurrency, formatPercent, formatDelta }
}
