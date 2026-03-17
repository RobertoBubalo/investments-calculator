<script setup lang="ts">
import { ref } from 'vue'
import type { YearRow } from '@/types'
import { useFormatters } from '@/composables/useFormatters'

defineProps<{ rows: YearRow[] }>()

const { formatCurrency, formatDelta } = useFormatters()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const expanded = ref<any[]>([])

const headers = [
  { title: '', key: 'data-table-expand', width: '40px', sortable: false },
  { title: 'Year', key: 'year', width: '60px' },
  { title: 'Total Wealth', key: 'totalWealth' },
  { title: 'Δ Wealth', key: 'wealthDelta' },
  { title: 'Dividends', key: 'dividends' },
  { title: 'Δ Dividends', key: 'dividendsDelta' },
  { title: 'Tax Paid', key: 'taxPaid' },
  { title: 'CGT Liability', key: 'unrealisedCgt' },
  { title: 'Div. Income Tax', key: 'dividendIncomeTax' },
  { title: 'Deemed Disposal Tax', key: 'deemedDisposalTax' },
  { title: 'Accum. Wealth', key: 'accumWealth' },
  { title: 'Accum. Dividends', key: 'accumDividends' },
  { title: 'Accum. Tax', key: 'accumTaxPaid' },
  { title: 'Real Wealth', key: 'realWealth' },
]

function deltaClass(value: number): string {
  if (value > 0) return 'text-success'
  if (value < 0) return 'text-error'
  return ''
}
</script>

<template>
  <v-card v-if="rows.length > 0" class="mt-4">
    <v-card-title>Projection Results</v-card-title>
    <v-data-table
      :headers="headers"
      :items="rows"
      item-value="year"
      density="compact"
      :items-per-page="-1"
      fixed-header
      height="500"
      hide-default-footer
      show-expand
      v-model:expanded="expanded"
      :expand-on-click="false"
    >
      <!-- Custom expand toggle: only show for rows with disposal events -->
      <!-- eslint-disable-next-line @typescript-eslint/no-explicit-any -->
      <template #item.data-table-expand="{ item, internalItem, toggleExpand, isExpanded }: any">
        <v-btn
          v-if="item.deemedDisposalEvents.length > 0"
          :icon="isExpanded(internalItem) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
          size="x-small"
          variant="text"
          color="warning"
          @click.stop="toggleExpand(internalItem)"
        />
        <span v-else class="text-medium-emphasis pl-2">—</span>
      </template>

      <template #item.totalWealth="{ item }">{{ formatCurrency(item.totalWealth) }}</template>
      <template #item.wealthDelta="{ item }">
        <span :class="deltaClass(item.wealthDelta)">{{ formatDelta(item.wealthDelta) }}</span>
      </template>
      <template #item.dividends="{ item }">{{ formatCurrency(item.dividends) }}</template>
      <template #item.dividendsDelta="{ item }">
        <span :class="deltaClass(item.dividendsDelta)">{{ formatDelta(item.dividendsDelta) }}</span>
      </template>
      <template #item.taxPaid="{ item }">{{ formatCurrency(item.taxPaid) }}</template>
      <template #item.unrealisedCgt="{ item }">
        <span v-if="item.unrealisedCgt > 0">{{ formatCurrency(item.unrealisedCgt) }}</span>
        <span v-else class="text-medium-emphasis">—</span>
      </template>
      <template #item.dividendIncomeTax="{ item }">
        <span v-if="item.dividendIncomeTax > 0">{{ formatCurrency(item.dividendIncomeTax) }}</span>
        <span v-else class="text-medium-emphasis">—</span>
      </template>
      <template #item.deemedDisposalTax="{ item }">
        <span v-if="item.deemedDisposalTax > 0">{{ formatCurrency(item.deemedDisposalTax) }}</span>
        <span v-else class="text-medium-emphasis">—</span>
      </template>
      <template #item.accumWealth="{ item }">{{ formatCurrency(item.accumWealth) }}</template>
      <template #item.accumDividends="{ item }">{{ formatCurrency(item.accumDividends) }}</template>
      <template #item.accumTaxPaid="{ item }">{{ formatCurrency(item.accumTaxPaid) }}</template>
      <template #item.realWealth="{ item }">{{ formatCurrency(item.realWealth) }}</template>

      <!-- Expanded row: per-lot breakdown -->
      <template #expanded-row="{ item }">
        <tr>
          <td :colspan="headers.length" class="pa-0">
            <v-sheet color="amber-lighten-5" class="px-6 py-3">
              <div class="text-caption text-medium-emphasis font-weight-medium mb-2">
                Deemed Disposal Events – Year {{ item.year }}
              </div>
              <v-table density="compact">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Lot purchased</th>
                    <th>Unrealised Gain</th>
                    <th>Tax Paid (41%)</th>
                    <th>Shares Sold</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(event, idx) in item.deemedDisposalEvents" :key="idx">
                    <td>
                      <span class="font-weight-medium">{{ event.assetSymbol }}</span>
                      <span class="text-medium-emphasis ml-1 text-caption">{{ event.assetName }}</span>
                    </td>
                    <td>Year {{ event.lotPurchaseYear }}</td>
                    <td>{{ formatCurrency(event.gain) }}</td>
                    <td class="text-error">{{ formatCurrency(event.taxAmount) }}</td>
                    <td>{{ event.sharesReduced.toFixed(4) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-sheet>
          </td>
        </tr>
      </template>
    </v-data-table>
  </v-card>
</template>
