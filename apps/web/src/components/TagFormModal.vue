<template>
  <n-modal
    :show="show"
    preset="card"
    :title="model ? '编辑标签' : '新增标签'"
    style="width: min(640px, calc(100vw - 24px))"
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
          <n-form-item label="图标">
            <n-select v-model:value="form.icon" :options="iconOptions" :render-label="renderIconOption" filterable placeholder="选择图标" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-grid :cols="2" :x-gap="16">
        <n-grid-item>
          <n-form-item label="图标预览">
            <div class="icon-preview">
              <n-icon :size="22">
                <component :is="selectedIconComponent" />
              </n-icon>
              <span>{{ selectedIconLabel }}</span>
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
import { computed, h, reactive, watch } from 'vue'
import {
  AppsOutline,
  BriefcaseOutline,
  BuildOutline,
  CloudOutline,
  CodeSlashOutline,
  FilmOutline,
  GameControllerOutline,
  LaptopOutline,
  LibraryOutline,
  MusicalNotesOutline,
  RocketOutline,
  SchoolOutline,
  WalletOutline
} from '@vicons/ionicons5'
import { NButton, NColorPicker, NForm, NFormItem, NGrid, NGridItem, NIcon, NInput, NInputNumber, NModal, NSelect, NSpace } from 'naive-ui'
import type { Tag } from '@/types/api'

const props = defineProps<{
  show: boolean
  model?: Tag | null
}>()

const emit = defineEmits<{
  close: []
  submit: [payload: { name: string; color: string; icon: string; sortOrder: number }, editingId?: string]
}>()

const iconMap = {
  'apps-outline': { label: '通用应用', component: AppsOutline },
  'briefcase-outline': { label: '工作事务', component: BriefcaseOutline },
  'build-outline': { label: '工具服务', component: BuildOutline },
  'cloud-outline': { label: '云服务', component: CloudOutline },
  'code-slash-outline': { label: '开发工具', component: CodeSlashOutline },
  'film-outline': { label: '影音娱乐', component: FilmOutline },
  'game-controller-outline': { label: '游戏服务', component: GameControllerOutline },
  'laptop-outline': { label: '设备软件', component: LaptopOutline },
  'library-outline': { label: '学习阅读', component: LibraryOutline },
  'musical-notes-outline': { label: '音乐播客', component: MusicalNotesOutline },
  'rocket-outline': { label: '效率办公', component: RocketOutline },
  'school-outline': { label: '教育培训', component: SchoolOutline },
  'wallet-outline': { label: '支付账单', component: WalletOutline }
} as const

const iconOptions = Object.entries(iconMap).map(([value, item]) => ({
  label: item.label,
  value
}))

const form = reactive({
  name: '',
  color: '#3b82f6',
  icon: 'apps-outline',
  sortOrder: 0
})

const selectedIcon = computed(() => iconMap[form.icon as keyof typeof iconMap] ?? iconMap['apps-outline'])
const selectedIconComponent = computed(() => selectedIcon.value.component)
const selectedIconLabel = computed(() => selectedIcon.value.label)

watch(
  () => props.model,
  (model) => {
    if (!model) {
      reset()
      return
    }

    form.name = model.name
    form.color = model.color
    form.icon = model.icon
    form.sortOrder = model.sortOrder
  },
  { immediate: true }
)

function renderIconOption(option: { label: string; value: string }) {
  const icon = iconMap[option.value as keyof typeof iconMap]

  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: '0'
      }
    },
    [
      h(
        'div',
        {
          style: {
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            color: '#334155',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: '0'
          }
        },
        [h(NIcon, { size: 16 }, { default: () => h(icon.component) })]
      ),
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            minWidth: '0'
          }
        },
        [
          h('span', { style: { color: '#0f172a', lineHeight: '1.2' } }, option.label),
          h('span', { style: { color: '#94a3b8', fontSize: '12px', lineHeight: '1.2' } }, option.value)
        ]
      )
    ]
  )
}

function reset() {
  form.name = ''
  form.color = '#3b82f6'
  form.icon = 'apps-outline'
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

.icon-preview {
  height: 40px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #334155;
  background: #f8fafc;
}
</style>
