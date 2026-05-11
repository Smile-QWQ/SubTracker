<template>
  <n-modal :show="show" preset="card" :title="t('tags.budget.title')" :style="modalStyle" @update:show="handleShowChange">
    <div class="modal-intro">
      {{ t('tags.budget.description') }}
    </div>

    <n-input v-model:value="keyword" :placeholder="t('tags.budget.searchPlaceholder')" clearable style="margin-bottom: 12px" />

    <div class="budget-list">
      <div v-for="tag in filteredTags" :key="tag.id" class="budget-item">
        <div class="budget-item__meta">
          <span class="budget-item__dot" :style="{ backgroundColor: tag.color || '#3b82f6' }" />
          <span class="budget-item__name">{{ tag.name }}</span>
        </div>
        <n-input-number
          v-model:value="draftBudgets[tag.id]"
          :min="0"
          :precision="2"
          :placeholder="t('tags.budget.budgetPlaceholder', { currency: baseCurrency })"
          style="width: 180px"
        />
      </div>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button @click="emit('close')">{{ t('common.actions.cancel') }}</n-button>
        <n-button @click="resetDraft">{{ t('common.actions.reset') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.actions.save') }}</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { NButton, NInput, NInputNumber, NModal, NSpace } from 'naive-ui'
import { t } from '@/locales'
import type { Tag } from '@/types/api'

const props = defineProps<{
  show: boolean
  tags: Tag[]
  budgets: Record<string, number>
  baseCurrency: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', budgets: Record<string, number>): void
}>()

const keyword = ref('')
const draftBudgets = reactive<Record<string, number | null>>({})

const modalStyle = {
  width: 'min(760px, calc(100vw - 32px))'
}

const filteredTags = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return props.tags
  return props.tags.filter((tag) => tag.name.toLowerCase().includes(query))
})

watch(
  () => props.show,
  (show) => {
    if (show) {
      resetDraft()
    } else {
      keyword.value = ''
    }
  }
)

function resetDraft() {
  keyword.value = ''
  for (const key of Object.keys(draftBudgets)) {
    delete draftBudgets[key]
  }
  for (const tag of props.tags) {
    draftBudgets[tag.id] = props.budgets[tag.id] ?? null
  }
}

function handleShowChange(value: boolean) {
  if (!value) emit('close')
}

function handleSave() {
  const nextBudgets: Record<string, number> = {}
  for (const tag of props.tags) {
    const value = draftBudgets[tag.id]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      nextBudgets[tag.id] = Number(value.toFixed(2))
    }
  }
  emit('save', nextBudgets)
}
</script>

<style scoped>
.modal-intro {
  margin-bottom: 12px;
  color: var(--app-text-secondary);
  line-height: 1.6;
}

.budget-list {
  max-height: min(60vh, 520px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.budget-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--app-surface);
}

.budget-item__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.budget-item__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex-shrink: 0;
}

.budget-item__name {
  min-width: 0;
  color: var(--app-text-strong);
  font-weight: 600;
}

@media (max-width: 640px) {
  .budget-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
