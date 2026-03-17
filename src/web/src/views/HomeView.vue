<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAssetStore } from '@/stores/assets'
import { runProjection } from '@/services/projectionEngine'
import AssetTable from '@/components/AssetTable.vue'
import AssetFormDialog from '@/components/AssetFormDialog.vue'
import ProjectionControls from '@/components/ProjectionControls.vue'
import ProjectionTable from '@/components/ProjectionTable.vue'
import ProjectionChart from '@/components/ProjectionChart.vue'
import type { Asset, ProjectionSettings, YearRow } from '@/types'

const store = useAssetStore()

const showFormDialog = ref(false)
const editingAsset = ref<Asset | null>(null)
const projectionRows = ref<YearRow[]>([])
const showDeleteConfirm = ref(false)
const deletingAssetId = ref<string | null>(null)

// Clear stale projection when assets change
watch(
  () => store.assets.map((a) => JSON.stringify(a)).join(),
  () => {
    projectionRows.value = []
  },
)

function onAddAsset() {
  editingAsset.value = null
  showFormDialog.value = true
}

function onEditAsset(asset: Asset) {
  editingAsset.value = asset
  showFormDialog.value = true
}

function onSaveAsset(data: Omit<Asset, 'id'>) {
  if (editingAsset.value) {
    store.updateAsset(editingAsset.value.id, data)
  } else {
    store.addAsset(data)
  }
  editingAsset.value = null
}

function onDeleteAsset(assetId: string) {
  deletingAssetId.value = assetId
  showDeleteConfirm.value = true
}

function confirmDelete() {
  if (deletingAssetId.value) {
    store.deleteAsset(deletingAssetId.value)
    deletingAssetId.value = null
  }
  showDeleteConfirm.value = false
}

function onRunProjection(settings: ProjectionSettings) {
  projectionRows.value = runProjection(store.assets, settings)
}
</script>

<template>
  <div>
    <AssetTable
      :assets="store.assets"
      @add="onAddAsset"
      @edit="onEditAsset"
      @delete="onDeleteAsset"
    />

    <AssetFormDialog
      v-model="showFormDialog"
      :asset="editingAsset"
      @save="onSaveAsset"
    />

    <v-dialog v-model="showDeleteConfirm" max-width="400">
      <v-card title="Delete Asset">
        <v-card-text>Are you sure you want to delete this asset?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showDeleteConfirm = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-divider class="my-6" />

    <ProjectionControls @run-projection="onRunProjection" />

    <ProjectionTable :rows="projectionRows" />

    <ProjectionChart :rows="projectionRows" />
  </div>
</template>
