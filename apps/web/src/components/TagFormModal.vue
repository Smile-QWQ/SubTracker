<template>
  <n-modal
    :show="show"
    preset="card"
    :title="model ? t('tags.form.editTitle') : t('tags.form.createTitle')"
    style="width: min(560px, calc(100vw - 24px))"
    @mask-click="close"
    @update:show="handleUpdateShow"
  >
    <n-form :model="form" label-placement="top">
      <n-form-item :label="t('tags.form.nameLabel')">
        <n-input v-model:value="form.name" :placeholder="t('tags.form.namePlaceholder')" />
      </n-form-item>

      <n-grid :cols="gridCols" :x-gap="16">
        <n-grid-item>
          <n-form-item :label="t('tags.form.colorLabel')">
            <div class="color-field">
              <n-input :value="colorTextInput" :placeholder="t('tags.form.colorPlaceholder')" @update:value="handleColorTextInputUpdate" />
              <n-color-picker
                v-model:value="form.color"
                :modes="['hex', 'rgb']"
                :show-alpha="false"
                class="color-field__picker"
              />
            </div>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('tags.form.sortOrderLabel')">
            <n-input-number v-model:value="form.sortOrder" :min="0" style="width: 100%" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-space justify="end" wrap class="tag-form-actions">
        <n-button @click="close">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" @click="submit">{{ t('common.actions.save') }}</n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { NButton, NColorPicker, NForm, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NModal, NSpace } from 'naive-ui'
import { t } from '@/locales'
import { useLocalizedMessage } from '@/utils/localized-message'
import type { Tag } from '@/types/api'

type TagFormPayload = {
  name: string
  color: string
  sortOrder: number
}

const props = defineProps<{
  show: boolean
  model?: Tag | null
}>()

const emit = defineEmits<{
  close: []
  submit: [payload: TagFormPayload, editingId?: string]
}>()

const form = reactive<TagFormPayload>({
  name: '',
  color: '#3b82f6',
  sortOrder: 0
})
const colorTextInput = ref('#3b82f6')
const message = useLocalizedMessage()
const { width } = useWindowSize()
const gridCols = computed(() => (width.value < 640 ? 1 : 2))

watch(
  [() => props.show, () => props.model] as const,
  ([visible, model]) => {
    if (!visible) return

    if (!model) {
      resetFormValues()
      return
    }

    form.name = model.name
    form.color = model.color
    colorTextInput.value = model.color
    form.sortOrder = model.sortOrder
  },
  { immediate: true }
)

watch(
  () => form.color,
  (value) => {
    if (value && colorTextInput.value !== value) {
      colorTextInput.value = value
    }
  }
)

function resetFormValues() {
  form.name = ''
  form.color = '#3b82f6'
  colorTextInput.value = '#3b82f6'
  form.sortOrder = 0
}

function isSupportedColorValue(value: string) {
  const normalized = value.trim()
  if (!normalized) return false

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', normalized)
  }

  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized) || /^rgb(a)?\([^)]*\)$/i.test(normalized)
}

function handleColorTextInputUpdate(value: string) {
  colorTextInput.value = value
  const normalized = value.trim()
  if (isSupportedColorValue(normalized)) {
    form.color = normalized
  }
}

function close() {
  emit('close')
}

function submit() {
  const normalizedColor = colorTextInput.value.trim()
  if (!isSupportedColorValue(normalizedColor)) {
    message.warning(t('tags.form.invalidColor'))
    return
  }

  form.color = normalizedColor
  emit('submit', { ...form }, props.model?.id)
}

function handleUpdateShow(value: boolean) {
  if (!value) {
    close()
  }
}
</script>

<style scoped>
.color-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-field__picker {
  flex-shrink: 0;
}

.tag-form-actions {
  width: 100%;
}

@media (max-width: 640px) {
  .color-field {
    align-items: stretch;
    flex-direction: column;
  }

  .tag-form-actions :deep(.n-button) {
    width: 100%;
  }
}
</style>
