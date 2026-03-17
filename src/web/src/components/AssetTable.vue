<script setup lang="ts">
import type { Asset } from '@/types'
import { useFormatters } from '@/composables/useFormatters'

defineProps<{ assets: Asset[] }>()
const emit = defineEmits<{
  edit: [asset: Asset]
  delete: [assetId: string]
  add: []
}>()

const { formatCurrency, formatPercent } = useFormatters()

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Symbol', key: 'symbol' },
  { title: 'Shares', key: 'shares' },
  { title: 'Buy Price', key: 'buyPrice' },
  { title: 'Current Price', key: 'currentSharePrice' },
  { title: 'Current Value', key: 'currentValue' },
  { title: 'Dividend Yield', key: 'dividendYield' },
  { title: 'Deemed Disposal', key: 'deemedDisposalEnabled' },
  { title: 'Actions', key: 'actions', sortable: false },
]
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center justify-space-between pa-4">
      <span>Assets</span>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('add')">Add Asset</v-btn>
    </v-card-title>

    <template v-if="assets.length === 0">
      <v-card-text class="text-center py-12">
        <v-icon size="64" color="grey-lighten-1">mdi-chart-line</v-icon>
        <div class="text-h6 text-grey mt-4">No assets yet</div>
        <div class="text-body-2 text-grey-lighten-1 mb-4">Add your first asset to get started</div>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="emit('add')">Add Asset</v-btn>
      </v-card-text>
    </template>

    <template v-else>
      <v-data-table :headers="headers" :items="assets" item-value="id" density="compact">
        <template #item.symbol="{ item }">
          <span class="font-weight-medium text-uppercase">{{ item.symbol }}</span>
        </template>
        <template #item.shares="{ item }">
          {{ item.shares.toFixed(2) }}
        </template>
        <template #item.buyPrice="{ item }">
          {{ formatCurrency(item.buyPrice) }}
        </template>
        <template #item.currentSharePrice="{ item }">
          {{ formatCurrency(item.currentSharePrice) }}
        </template>
        <template #item.currentValue="{ item }">
          {{ formatCurrency(item.shares * item.currentSharePrice) }}
        </template>
        <template #item.dividendYield="{ item }">
          {{ formatPercent(item.dividendYield) }}
        </template>
        <template #item.deemedDisposalEnabled="{ item }">
          <v-chip
            :color="item.deemedDisposalEnabled ? 'warning' : 'default'"
            size="small"
            variant="tonal"
          >
            {{ item.deemedDisposalEnabled ? 'Yes' : 'No' }}
          </v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-btn
            icon="mdi-pencil"
            size="small"
            variant="text"
            color="primary"
            @click="emit('edit', item)"
          />
          <v-btn
            icon="mdi-delete"
            size="small"
            variant="text"
            color="error"
            @click="emit('delete', item.id)"
          />
        </template>
      </v-data-table>
    </template>
  </v-card>
</template>
