<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Asset } from '@/types'

const props = defineProps<{
  modelValue: boolean
  asset: Asset | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [asset: Omit<Asset, 'id'>]
}>()

// Form state — all percentage fields stored as display values (e.g. 3 for 3%)
const form = ref<{
  name: string
  symbol: string
  shares: string
  buyPrice: string
  currentSharePrice: string
  dividendYield: string
  priceAppreciationPct: string
  dividendGrowthPct: string
  cgtTaxRate: string
  withholdingTaxRate: string
  deemedDisposalEnabled: boolean
  dripEnabled: boolean
  annualContribution: string
}>({
  name: '',
  symbol: '',
  shares: '',
  buyPrice: '',
  currentSharePrice: '',
  dividendYield: '',
  priceAppreciationPct: '',
  dividendGrowthPct: '',
  cgtTaxRate: '',
  withholdingTaxRate: '',
  deemedDisposalEnabled: false,
  dripEnabled: false,
  annualContribution: '0',
})

const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

function toDisplay(decimal: number | null): string {
  if (decimal === null) return ''
  return (decimal * 100).toString()
}

function toDecimal(display: string): number | null {
  if (display === '' || display === null) return null
  const n = parseFloat(display)
  return isNaN(n) ? null : n / 100
}

function resetForm() {
  if (props.asset) {
    form.value = {
      name: props.asset.name,
      symbol: props.asset.symbol,
      shares: props.asset.shares.toString(),
      buyPrice: props.asset.buyPrice.toString(),
      currentSharePrice: props.asset.currentSharePrice.toString(),
      dividendYield: toDisplay(props.asset.dividendYield) ?? '',
      priceAppreciationPct: toDisplay(props.asset.priceAppreciationPct) ?? '',
      dividendGrowthPct: toDisplay(props.asset.dividendGrowthPct) ?? '',
      cgtTaxRate: toDisplay(props.asset.cgtTaxRate) ?? '',
      withholdingTaxRate: toDisplay(props.asset.withholdingTaxRate) ?? '',
      deemedDisposalEnabled: props.asset.deemedDisposalEnabled,
      dripEnabled: props.asset.dripEnabled,
      annualContribution: props.asset.annualContribution.toString(),
    }
  } else {
    form.value = {
      name: '',
      symbol: '',
      shares: '',
      buyPrice: '',
      currentSharePrice: '',
      dividendYield: '',
      priceAppreciationPct: '',
      dividendGrowthPct: '',
      cgtTaxRate: '',
      withholdingTaxRate: '',
      deemedDisposalEnabled: false,
      dripEnabled: false,
      annualContribution: '0',
    }
  }
}

watch(() => props.modelValue, (open) => {
  if (open) resetForm()
})

async function onSave() {
  const result = await formRef.value?.validate()
  if (!result?.valid) return

  emit('save', {
    name: form.value.name,
    symbol: form.value.symbol.toUpperCase(),
    shares: parseFloat(form.value.shares),
    buyPrice: parseFloat(form.value.buyPrice),
    currentSharePrice: parseFloat(form.value.currentSharePrice),
    dividendYield: toDecimal(form.value.dividendYield) ?? 0,
    priceAppreciationPct: toDecimal(form.value.priceAppreciationPct),
    dividendGrowthPct: toDecimal(form.value.dividendGrowthPct),
    cgtTaxRate: toDecimal(form.value.cgtTaxRate),
    withholdingTaxRate: toDecimal(form.value.withholdingTaxRate),
    deemedDisposalEnabled: form.value.deemedDisposalEnabled,
    dripEnabled: form.value.dripEnabled,
    annualContribution: parseFloat(form.value.annualContribution) || 0,
  })
  emit('update:modelValue', false)
}

function onCancel() {
  emit('update:modelValue', false)
}

// Validation rules
const required = (v: string) => !!v || 'Required'
const nonNegative = (v: string) => {
  if (v === '' || v === null) return true
  return parseFloat(v) >= 0 || 'Must be ≥ 0'
}
const percentage = (v: string) => {
  if (v === '' || v === null) return true
  const n = parseFloat(v)
  return (!isNaN(n) && n >= 0 && n <= 100) || 'Must be between 0 and 100'
}
const positiveRequired = (v: string) => {
  const n = parseFloat(v)
  return (!isNaN(n) && n >= 0) || 'Must be a number ≥ 0'
}
</script>

<template>
  <v-dialog :model-value="modelValue" max-width="600" @update:model-value="emit('update:modelValue', $event)">
    <v-card :title="asset ? 'Edit Asset' : 'Add Asset'">
      <v-card-text>
        <v-form ref="formRef">
          <div class="text-subtitle-2 text-medium-emphasis mb-2">Required</div>
          <v-row dense>
            <v-col cols="12" sm="8">
              <v-text-field
                v-model="form.name"
                label="Name"
                :rules="[required]"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.symbol"
                label="Symbol"
                :rules="[required]"
                variant="outlined"
                density="compact"
                style="text-transform: uppercase"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.shares"
                label="Shares"
                type="number"
                :rules="[required, positiveRequired]"
                variant="outlined"
                density="compact"
                min="0"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.buyPrice"
                label="Buy Price"
                type="number"
                :rules="[required, positiveRequired]"
                prefix="€"
                variant="outlined"
                density="compact"
                min="0"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.currentSharePrice"
                label="Current Share Price"
                type="number"
                :rules="[required, positiveRequired]"
                prefix="€"
                variant="outlined"
                density="compact"
                min="0"
              />
            </v-col>
            <v-col cols="12" sm="4">
              <v-text-field
                v-model="form.dividendYield"
                label="Dividend Yield"
                type="number"
                :rules="[required, percentage]"
                suffix="%"
                variant="outlined"
                density="compact"
                min="0"
                max="100"
              />
            </v-col>
          </v-row>

          <v-expansion-panels variant="accordion" class="mt-2">
            <v-expansion-panel title="Advanced (Optional)">
              <v-expansion-panel-text>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model="form.priceAppreciationPct"
                      label="Price Appreciation % / yr"
                      type="number"
                      :rules="[percentage]"
                      suffix="%"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model="form.dividendGrowthPct"
                      label="Dividend Growth % / yr"
                      type="number"
                      :rules="[percentage]"
                      suffix="%"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model="form.cgtTaxRate"
                      label="CGT Rate %"
                      type="number"
                      :rules="[percentage]"
                      suffix="%"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model="form.withholdingTaxRate"
                      label="Withholding Tax Rate %"
                      type="number"
                      :rules="[percentage]"
                      suffix="%"
                      variant="outlined"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field
                      v-model="form.annualContribution"
                      label="Annual Contribution"
                      type="number"
                      :rules="[nonNegative]"
                      prefix="€"
                      variant="outlined"
                      density="compact"
                      min="0"
                    />
                  </v-col>
                  <v-col cols="12" sm="6" class="d-flex align-center">
                    <v-switch
                      v-model="form.deemedDisposalEnabled"
                      label="Irish 8-year deemed disposal"
                      color="warning"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                  <v-col cols="12" sm="6" class="d-flex align-center">
                    <v-switch
                      v-model="form.dripEnabled"
                      label="Reinvest dividends (DRIP)"
                      color="success"
                      density="compact"
                      hide-details
                    />
                  </v-col>
                </v-row>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="onSave">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
