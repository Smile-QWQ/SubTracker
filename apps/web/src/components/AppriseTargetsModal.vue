<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('settings.apprise.modal.title')"
    :style="{ width: modalWidth }"
    :mask-closable="false"
    @close="emit('close')"
  >
    <n-space vertical :size="12" class="apprise-targets-modal">
      <div class="card-muted">{{ t('settings.apprise.modal.description') }}</div>
      <n-alert type="info" :show-icon="false">{{ t('settings.apprise.modal.testHint') }}</n-alert>

      <n-space class="apprise-targets-modal__toolbar" wrap>
        <n-button type="primary" secondary @click="addTarget">
          <template #icon>
            <n-icon :component="addOutline" />
          </template>
          {{ t('settings.apprise.modal.addTarget') }}
        </n-button>
      </n-space>

      <n-empty v-if="!draftTargets.length" :description="t('settings.apprise.modal.empty')" />

      <div v-for="target in draftTargets" :key="target.id" class="apprise-target-card">
        <div class="apprise-target-card__header">
          <strong class="apprise-target-card__title">{{ target.name || t('settings.labels.appriseTargetName') }}</strong>
          <div class="apprise-target-card__controls">
            <div class="compact-switch-row">
              <n-switch :value="target.enabled" @update:value="updateTargetEnabled(target.id, $event)" />
              <span class="switch-inline-label">{{ t('settings.labels.appriseTargetEnabled') }}</span>
            </div>
            <n-space wrap :size="8" class="apprise-target-card__buttons">
              <n-button
                size="small"
                :loading="testingTargetId === target.id"
                :disabled="testingTargetId === target.id"
                @click="handleTestTarget(target.id)"
              >
                <template #icon>
                  <n-icon :component="flaskOutline" />
                </template>
                {{ t('common.actions.test') }}
              </n-button>
              <n-button size="small" quaternary type="error" @click="removeTarget(target.id)">
                <template #icon>
                  <n-icon :component="trashOutline" />
                </template>
                {{ t('common.actions.delete') }}
              </n-button>
            </n-space>
          </div>
        </div>

        <n-grid :cols="formCols" :x-gap="12" :y-gap="8">
          <n-grid-item>
            <n-form-item :label="t('settings.labels.appriseTargetName')">
              <n-input
                :value="target.name"
                :placeholder="t('settings.apprise.modal.namePlaceholder')"
                @update:value="updateTargetField(target.id, 'name', $event)"
              />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item :label="t('settings.labels.appriseTargetUrl')">
              <n-input
                :value="target.url"
                :placeholder="t('settings.apprise.modal.urlPlaceholder')"
                @update:value="updateTargetField(target.id, 'url', $event)"
              />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </div>
    </n-space>

    <template #footer>
      <div class="apprise-targets-modal__footer">
        <n-space wrap justify="end">
          <n-button @click="emit('close')">{{ t('common.actions.cancel') }}</n-button>
          <n-button type="primary" @click="emit('save', cloneTargets(draftTargets))">{{ t('common.actions.save') }}</n-button>
        </n-space>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import {
  NAlert,
  NButton,
  NEmpty,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NModal,
  NSpace,
  NSwitch
} from 'naive-ui'
import { AddOutline, FlaskOutline, TrashOutline } from '@vicons/ionicons5'
import { t } from '@/locales'
import type { AppriseTarget } from '@/types/api'

const props = defineProps<{
  show: boolean
  targets: AppriseTarget[]
  testingTargetId?: string | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', targets: AppriseTarget[]): void
  (event: 'test-target', payload: { targetId: string; targets: AppriseTarget[] }): void
}>()

const { width } = useWindowSize()

const addOutline = AddOutline
const flaskOutline = FlaskOutline
const trashOutline = TrashOutline
const draftTargets = ref<AppriseTarget[]>([])
const formCols = computed(() => (width.value < 720 ? 1 : 2))
const modalWidth = computed(() => (width.value < 720 ? 'calc(100vw - 24px)' : '920px'))

function cloneTargets(targets: AppriseTarget[]) {
  return targets.map((target) => ({
    ...target
  }))
}

function createTarget(): AppriseTarget {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `apprise-target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return {
    id: randomId,
    name: '',
    url: '',
    enabled: true
  }
}

function setDraftTargets(targets: AppriseTarget[]) {
  draftTargets.value = cloneTargets(targets)
}

function updateTargetField(targetId: string, field: 'name' | 'url', value: string) {
  draftTargets.value = draftTargets.value.map((target) => (target.id === targetId ? { ...target, [field]: value } : target))
}

function updateTargetEnabled(targetId: string, enabled: boolean) {
  draftTargets.value = draftTargets.value.map((target) => (target.id === targetId ? { ...target, enabled } : target))
}

function addTarget() {
  draftTargets.value = [...draftTargets.value, createTarget()]
}

function removeTarget(targetId: string) {
  draftTargets.value = draftTargets.value.filter((target) => target.id !== targetId)
}

function handleTestTarget(targetId: string) {
  emit('test-target', {
    targetId,
    targets: cloneTargets(draftTargets.value)
  })
}

watch(
  () => [props.show, props.targets] as const,
  ([show]) => {
    if (show) {
      setDraftTargets(props.targets)
    }
  },
  { immediate: true, deep: true }
)
</script>

<style scoped>
.apprise-targets-modal {
  width: 100%;
}

.apprise-targets-modal__toolbar,
.apprise-targets-modal__footer {
  width: 100%;
}

.apprise-target-card {
  padding: 14px;
  border: 1px solid var(--app-border-soft);
  border-radius: 14px;
  background: var(--app-surface-alt);
}

.apprise-target-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.apprise-target-card__title {
  color: var(--app-text-strong);
}

.apprise-target-card__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.apprise-target-card__buttons {
  justify-content: flex-end;
}

.compact-switch-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.switch-inline-label,
.card-muted {
  color: var(--app-text-secondary);
}

@media (max-width: 640px) {
  .apprise-target-card__controls {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .compact-switch-row {
    width: 100%;
    justify-content: space-between;
  }

  .apprise-target-card__buttons {
    width: 100%;
  }

  .apprise-target-card__buttons :deep(.n-space-item) {
    flex: 1 1 calc(50% - 4px);
    min-width: 0;
  }

  .apprise-target-card__buttons :deep(.n-button) {
    width: 100%;
  }

  .apprise-targets-modal__toolbar :deep(.n-button),
  .apprise-targets-modal__footer :deep(.n-button) {
    width: 100%;
  }
}
</style>
