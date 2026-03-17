<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js'
import type { YearRow } from '@/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const props = defineProps<{ rows: YearRow[] }>()

const chartData = computed(() => ({
  labels: props.rows.map((r) => `Year ${r.year}`),
  datasets: [
    {
      label: 'Accumulated Wealth (Nominal)',
      data: props.rows.map((r) => r.accumWealth),
      borderColor: '#1976D2',
      backgroundColor: 'rgba(25, 118, 210, 0.1)',
      borderWidth: 2,
      borderDash: [],
      tension: 0.1,
    },
    {
      label: 'Accumulated Wealth (Real)',
      data: props.rows.map((r) => r.realWealth),
      borderColor: '#1976D2',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [6, 3],
      tension: 0.1,
    },
    {
      label: 'Accumulated Dividends',
      data: props.rows.map((r) => r.accumDividends),
      borderColor: '#4CAF50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      borderWidth: 2,
      borderDash: [],
      tension: 0.1,
    },
    {
      label: 'Accumulated Tax Paid',
      data: props.rows.map((r) => r.accumTaxPaid),
      borderColor: '#F44336',
      backgroundColor: 'rgba(244, 67, 54, 0.1)',
      borderWidth: 2,
      borderDash: [],
      tension: 0.1,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: 16 / 9,
  interaction: {
    mode: 'index' as const,
    intersect: false,
  },
  plugins: {
    legend: { position: 'top' as const },
    tooltip: {
      callbacks: {
        label: (context: TooltipItem<'line'>) => {
          const label = context.dataset.label ?? ''
          const value = context.parsed.y ?? 0
          return `${label}: €${value.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        callback: (value: string | number) =>
          '€' + Number(value).toLocaleString('en-IE', { maximumFractionDigits: 0 }),
      },
    },
  },
}
</script>

<template>
  <v-card v-if="rows.length > 0" class="mt-4">
    <v-card-title>Projection Chart</v-card-title>
    <v-card-text>
      <Line :data="chartData" :options="chartOptions" />
    </v-card-text>
  </v-card>
</template>
