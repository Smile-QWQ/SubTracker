<template>
  <div class="reminder-rules-preview">
    <n-button
      v-if="showButton"
      class="reminder-rules-preview__button"
      size="small"
      :type="isPreviewVisible ? 'primary' : 'default'"
      :secondary="isPreviewVisible"
      @click="toggle"
    >
      <template #icon>
        <n-icon :component="eyeOutline" />
      </template>
      {{ isPreviewVisible ? '收起提醒预览' : '预览提醒规则' }}
    </n-button>

    <transition name="reminder-preview">
      <div v-if="isPreviewVisible && (advanceEvaluation || overdueEvaluation)" class="reminder-rules-preview__panel">
        <div class="reminder-rules-preview__section">
          <div class="reminder-rules-preview__title">到期前提醒</div>
          <div v-if="advanceEvaluation?.error" class="reminder-rules-preview__error">
            {{ advanceEvaluation.error }}
          </div>
          <ul v-else-if="advanceEvaluation?.entries.length" class="reminder-rules-preview__list">
            <li v-for="entry in advanceEvaluation.entries" :key="entry.key">
              {{ entry.description }}
            </li>
          </ul>
          <div v-else class="reminder-rules-preview__empty">暂无到期前提醒规则</div>
        </div>

        <div class="reminder-rules-preview__section">
          <div class="reminder-rules-preview__title">过期提醒</div>
          <div v-if="overdueEvaluation?.error" class="reminder-rules-preview__error">
            {{ overdueEvaluation.error }}
          </div>
          <ul v-else-if="overdueEvaluation?.entries.length" class="reminder-rules-preview__list">
            <li v-for="entry in overdueEvaluation.entries" :key="entry.key">
              {{ entry.description }}
            </li>
          </ul>
          <div v-else class="reminder-rules-preview__empty">暂无过期提醒规则</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NIcon } from 'naive-ui'
import { EyeOutline } from '@vicons/ionicons5'
import { evaluateReminderRules, type ReminderRulesEvaluation } from '@/utils/reminder-rules'

const props = withDefaults(
  defineProps<{
    advanceValue?: string | null
    overdueValue?: string | null
    defaultAdvanceValue?: string | null
    defaultOverdueValue?: string | null
    showButton?: boolean
  }>(),
  {
    advanceValue: '',
    overdueValue: '',
    defaultAdvanceValue: '',
    defaultOverdueValue: '',
    showButton: true
  }
)
const emit = defineEmits<{
  visibilityChange: [visible: boolean]
}>()

const eyeOutline = EyeOutline
const advanceEvaluation = ref<ReminderRulesEvaluation | null>(null)
const overdueEvaluation = ref<ReminderRulesEvaluation | null>(null)
const isPreviewVisible = ref(false)

watch(
  () => [props.advanceValue, props.overdueValue, props.defaultAdvanceValue, props.defaultOverdueValue],
  () => {
    close()
  }
)

function close() {
  advanceEvaluation.value = null
  overdueEvaluation.value = null
  isPreviewVisible.value = false
  emit('visibilityChange', false)
}

function preview() {
  advanceEvaluation.value = evaluateReminderRules(props.advanceValue, 'advance', {
    fallbackValue: props.defaultAdvanceValue,
    fallbackLabel: '系统默认到期前规则',
    emptyTitle: '暂无到期前提醒规则'
  })

  overdueEvaluation.value = evaluateReminderRules(props.overdueValue, 'overdue', {
    fallbackValue: props.defaultOverdueValue,
    fallbackLabel: '系统默认过期规则',
    emptyTitle: '暂无过期提醒规则'
  })
  isPreviewVisible.value = true
  emit('visibilityChange', true)
}

function toggle() {
  if (isPreviewVisible.value) {
    close()
    return
  }

  preview()
}

defineExpose({
  preview,
  toggle,
  close
})
</script>

<style scoped>
.reminder-rules-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reminder-rules-preview__button {
  --n-padding: 0 10px;
}

.reminder-rules-preview__panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border-soft);
  border-radius: 14px;
  background: var(--app-surface-alt);
}

.reminder-rules-preview__section {
  min-width: 0;
}

.reminder-rules-preview__title {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.reminder-rules-preview__list {
  margin: 0;
  padding-left: 18px;
  color: var(--app-text-secondary);
  line-height: 1.8;
}

.reminder-rules-preview__error {
  font-size: 13px;
  line-height: 1.7;
  color: #dc2626;
}

.reminder-rules-preview__empty {
  font-size: 13px;
  color: var(--app-text-muted);
}

.reminder-preview-enter-active,
.reminder-preview-leave-active {
  overflow: hidden;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    max-height 0.22s ease;
}

.reminder-preview-enter-from,
.reminder-preview-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.reminder-preview-enter-to,
.reminder-preview-leave-from {
  max-height: 260px;
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 640px) {
  .reminder-rules-preview__panel {
    grid-template-columns: 1fr;
  }
}
</style>
