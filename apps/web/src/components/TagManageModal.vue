<template>
  <n-modal
    :show="show"
    preset="card"
    title="标签管理"
    style="width: min(820px, calc(100vw - 24px))"
    @mask-click="$emit('close')"
    @update:show="handleUpdateShow"
  >
    <n-space vertical :size="16">
      <n-space justify="space-between" align="center">
        <n-text depth="3">在这里统一新增、编辑和删除标签。</n-text>
        <n-button type="primary" @click="openCreate">新增标签</n-button>
      </n-space>

      <n-data-table :columns="columns" :data="tags" :pagination="{ pageSize: 8 }" :bordered="false" />
    </n-space>

    <tag-form-modal :show="showFormModal" :model="editing" @close="closeFormModal" @submit="handleSubmit" />
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { NButton, NDataTable, NIcon, NModal, NPopconfirm, NSpace, NTag, NText } from 'naive-ui'
import { PricetagsOutline } from '@vicons/ionicons5'
import TagFormModal from '@/components/TagFormModal.vue'
import type { Tag } from '@/types/api'

const props = defineProps<{
  show: boolean
  tags: Tag[]
  subscriptionCounts?: Record<string, number>
}>()

const emit = defineEmits<{
  close: []
  create: [payload: { name: string; color: string; icon: string; sortOrder: number }]
  update: [payload: { name: string; color: string; icon: string; sortOrder: number }, id: string]
  delete: [tag: Tag]
}>()

const tags = computed(() => props.tags)
const showFormModal = ref(false)
const editing = ref<Tag | null>(null)

const columns = computed(() => [
  {
    title: '标签',
    key: 'name',
    render: (row: Tag) =>
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }
        },
        [
          h('div', {
            style: {
              width: '14px',
              height: '14px',
              borderRadius: '999px',
              background: row.color,
              flexShrink: '0'
            }
          }),
          h(
            NIcon,
            {
              size: 18,
              color: 'var(--app-text-secondary)'
            },
            { default: () => h(resolveTagIcon(row.icon)) }
          ),
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }
            },
            [
              h(
                'span',
                {
                  style: {
                    fontWeight: '600',
                    color: 'var(--app-text-strong)'
                  }
                },
                row.name
              ),
              h(
                'span',
                {
                  style: {
                    fontSize: '12px',
                    color: 'var(--app-text-muted)'
                  }
                },
                row.icon
              )
            ]
          )
        ]
      )
  },
  {
    title: '颜色',
    key: 'color',
    width: 140,
    render: (row: Tag) =>
      h(
        NTag,
        {
          bordered: false,
          color: {
            color: row.color,
            textColor: '#fff'
          }
        },
        { default: () => row.color }
      )
  },
  {
    title: '排序',
    key: 'sortOrder',
    width: 90
  },
  {
    title: '订阅数',
    key: 'subscriptionCount',
    width: 100,
    render: (row: Tag) => props.subscriptionCounts?.[row.id] ?? 0
  },
  {
    title: '操作',
    key: 'actions',
    width: 180,
    render: (row: Tag) =>
      h(NSpace, { size: 8 }, {
        default: () => [
          h(
            NButton,
            {
              size: 'small',
              onClick: () => openEdit(row)
            },
            { default: () => '编辑' }
          ),
          h(
            NPopconfirm,
            {
              positiveText: '删除',
              negativeText: '取消',
              onPositiveClick: () => emit('delete', row)
            },
            {
              trigger: () =>
                h(
                  NButton,
                  {
                    size: 'small',
                    type: 'error',
                    ghost: true
                  },
                  { default: () => '删除' }
                ),
              default: () =>
                (props.subscriptionCounts?.[row.id] ?? 0) > 0 ? '删除后，该标签会从订阅上移除，确认继续？' : '确认删除该标签？'
            }
          )
        ]
      })
  }
])

function openCreate() {
  editing.value = null
  showFormModal.value = true
}

function openEdit(tag: Tag) {
  editing.value = tag
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editing.value = null
}

function handleSubmit(payload: { name: string; color: string; icon: string; sortOrder: number }, editingId?: string) {
  if (editingId) {
    emit('update', payload, editingId)
  } else {
    emit('create', payload)
  }
  closeFormModal()
}

function handleUpdateShow(value: boolean) {
  if (!value) {
    emit('close')
  }
}

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

const iconMap = {
  'apps-outline': AppsOutline,
  'briefcase-outline': BriefcaseOutline,
  'build-outline': BuildOutline,
  'cloud-outline': CloudOutline,
  'code-slash-outline': CodeSlashOutline,
  'film-outline': FilmOutline,
  'game-controller-outline': GameControllerOutline,
  'laptop-outline': LaptopOutline,
  'library-outline': LibraryOutline,
  'musical-notes-outline': MusicalNotesOutline,
  'rocket-outline': RocketOutline,
  'school-outline': SchoolOutline,
  'wallet-outline': WalletOutline
} as const

function resolveTagIcon(icon: string) {
  return iconMap[icon as keyof typeof iconMap] ?? PricetagsOutline
}
</script>
