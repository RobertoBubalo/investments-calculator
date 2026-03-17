<script setup lang="ts">
import { ref } from 'vue'
import type { ProjectionSettings } from '@/types'

const emit = defineEmits<{
  'run-projection': [settings: ProjectionSettings]
}>()

const years = ref(20)
const inflationDisplay = ref('2.5')
const cgtDisplay = ref('')
const incomeTaxDisplay = ref('')
const deemedDisposalDisplay = ref('41')

function onRun() {
  emit('run-projection', {
    years: years.value,
    inflationRate: parseFloat(inflationDisplay.value) / 100 || 0,
    cgtTaxRate: parseFloat(cgtDisplay.value) / 100 || 0,
    dividendIncomeTaxRate: parseFloat(incomeTaxDisplay.value) / 100 || 0,
    deemedDisposalTaxRate: parseFloat(deemedDisposalDisplay.value) / 100 || 0,
  })
}
</script>

<template>
  <v-card title="Projection Settings" class="mt-4">
    <v-card-text>
      <v-row align="center">
        <v-col cols="12" sm="6">
          <div class="d-flex align-center gap-4">
            <span class="text-body-2 text-medium-emphasis" style="white-space: nowrap">
              Years: <strong>{{ years }}</strong>
            </span>
            <v-slider
              v-model="years"
              min="1"
              max="50"
              step="1"
              thumb-label
              hide-details
              color="primary"
            />
          </div>
        </v-col>
        <v-col cols="12" sm="2">
          <v-text-field
            v-model="inflationDisplay"
            label="Inflation Rate"
            type="number"
            suffix="%"
            min="0"
            max="30"
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="2">
          <v-text-field
            v-model="cgtDisplay"
            label="CGT Rate"
            type="number"
            suffix="%"
            min="0"
            max="100"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="0"
          />
        </v-col>
        <v-col cols="12" sm="2">
          <v-text-field
            v-model="incomeTaxDisplay"
            label="Dividend Income Tax"
            type="number"
            suffix="%"
            min="0"
            max="100"
            density="compact"
            variant="outlined"
            hide-details
            placeholder="0"
          />
        </v-col>
        <v-col cols="12" sm="2">
          <v-text-field
            v-model="deemedDisposalDisplay"
            label="Deemed Disposal Tax"
            type="number"
            suffix="%"
            min="0"
            max="100"
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="2">
          <v-btn color="primary" block @click="onRun">Run Projection</v-btn>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>
