<template>
  <n-modal
    :show="show"
    preset="card"
    :title="model ? '编辑标签' : '新增标签'"
    style="width: min(560px, calc(100vw - 24px))"
    @mask-click="close"
    @update:show="handleUpdateShow"
  >
    <n-form :model="form" label-placement="top">
      <n-form-item label="标签名称">
        <n-input v-model:value="form.name" placeholder="例如：云服务" />
      </n-form-item>

      <n-grid :cols="2" :x-gap="16">
        <n-grid-item>
          <n-form-item label="颜色">
            <div class="color-field">
              <n-input v-model:value="form.color" placeholder="#3b82f6 或 rgb(59,130,246)" />
              <n-color-picker v-model:value="form.color" :modes="['hex', 'rgb']" :show-alpha="false" class="color-field__picker" />
            </div>
          </n-form-item>
        </n-grid-item>

        <n-grid-item>
          <n-form-item label="排序">
            <n-input-number v-model:value="form.sortOrder" :min="0" style="width: 100%" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-space justify="end">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" @click="submit">保存</n-button>
      </n-space>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { NButton, NColorPicker, NForm, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NModal, NSpace } from 'naive-ui'
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
