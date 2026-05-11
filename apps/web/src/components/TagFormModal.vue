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

      <n-grid :cols="2" :x-gap="16">
        <n-grid-item>
          <n-form-item :label="t('tags.form.colorLabel')">
            <div class="color-field">
              <n-input v-model:value="form.color" :placeholder="t('tags.form.colorPlaceholder')" />
              <n-color-picker v-model:value="form.color" :modes="['hex', 'rgb']" :show-alpha="false" class="color-field__picker" />
            </div>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item :label="t('tags.form.sortOrderLabel')">
            <n-input-number v-model:value="form.sortOrder" :min="0" style="width: 100%" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-space justify="end">
        <n-button @click="close">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" @click="submit">{{ t('common.actions.save') }}</n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { NButton, NColorPicker, NForm, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NModal, NSpace } from 'naive-ui'
import { t } from '@/locales'
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

watch(
  () => props.model,
  (model) => {
    if (!model) {
      reset()
      return
    }

    form.name = model.name
    form.color = model.color
    form.sortOrder = model.sortOrder
  },
  { immediate: true }
)

function reset() {
  form.name = ''
  form.color = '#3b82f6'
  form.sortOrder = 0
}

function close() {
  reset()
  emit('close')
}

function submit() {
  emit('submit', { ...form }, props.model?.id)
  reset()
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
</style>
