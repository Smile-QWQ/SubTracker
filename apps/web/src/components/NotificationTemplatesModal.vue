<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('settings.templates.title')"
    style="width: min(1040px, calc(100vw - 24px))"
    @update:show="handleUpdateShow"
  >
    <n-space vertical size="large">
      <n-alert type="info" :show-icon="false">
        {{ t('settings.templates.description') }}
      </n-alert>

      <n-tabs v-model:value="activeGroup" type="segment">
        <n-tab-pane v-for="group in groupOptions" :key="group.value" :name="group.value" :tab="group.label" />
      </n-tabs>

      <n-card size="small" embedded>
        <n-space justify="space-between" align="center" wrap>
          <div class="card-muted">
            {{ t('settings.templates.labels.supportedChannels') }}：{{ currentGroupChannels }}
          </div>
          <n-select
            v-model:value="activeScene"
            :options="sceneOptions"
            :consistent-menu-width="false"
            size="small"
            class="notification-template-modal__scene-select"
          />
        </n-space>
      </n-card>

      <n-grid :cols="previewCols" :x-gap="12" :y-gap="12">
        <n-grid-item>
          <n-form label-placement="top">
            <n-form-item :label="t('settings.templates.labels.titleTemplate')">
              <n-input
                v-model:value="currentEntry.titleTemplate"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                @focus="activeField = 'titleTemplate'"
              />
            </n-form-item>

            <n-form-item :label="t('settings.templates.labels.bodyTemplate')">
              <n-input
                v-model:value="currentEntry.bodyTemplate"
                type="textarea"
                :autosize="{ minRows: 10, maxRows: 18 }"
                @focus="activeField = 'bodyTemplate'"
              />
            </n-form-item>
          </n-form>
        </n-grid-item>

        <n-grid-item>
          <div class="notification-template-modal__placeholder-block">
            <div class="notification-template-modal__placeholder-title">
              {{ t('settings.templates.labels.placeholders') }}
            </div>
            <div class="card-muted">
              {{ t('settings.templates.helps.placeholders') }}
            </div>
            <n-space class="notification-template-modal__placeholder-list" wrap>
              <n-button
                v-for="placeholder in placeholderOptions"
                :key="placeholder.token"
                quaternary
                size="small"
                @click="insertPlaceholder(placeholder.token)"
              >
                {{ placeholder.token }}
              </n-button>
            </n-space>
          </div>
        </n-grid-item>
      </n-grid>

      <n-card size="small" embedded :title="t('settings.templates.labels.preview')">
        <n-space vertical>
          <div class="notification-template-modal__preview-title">{{ previewTitle }}</div>
          <div v-if="activeGroup === 'text'" class="notification-template-modal__preview-pre">
            <pre>{{ previewBody }}</pre>
          </div>
          <div
            v-else-if="activeGroup === 'markdown'"
            class="notification-template-modal__preview-html markdown-body"
            v-html="markdownPreviewHtml"
          />
          <div
            v-else
            class="notification-template-modal__preview-html"
            v-html="htmlPreview"
          />
        </n-space>
      </n-card>

      <n-space justify="end">
        <n-button quaternary @click="restoreCurrentEntryDefault">
          {{ t('settings.templates.actions.restoreDefault') }}
        </n-button>
        <n-button @click="emit('close')">{{ t('common.actions.cancel') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.actions.save') }}</n-button>
      </n-space>
    </n-space>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import {
  applyNotificationTemplate,
  getDefaultNotificationTemplate,
  resolveNotificationTemplateConfig,
  type NotificationTemplateConfigInput,
  type NotificationTemplateGroup,
  type NotificationTemplateScene
} from '@subtracker/shared'
import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTabPane,
  NTabs
} from 'naive-ui'
import { useWindowSize } from '@vueuse/core'
import { getAppLocale, t } from '@/locales'
import type { NotificationTemplateConfig } from '@/types/api'
import { renderMarkdownToHtml } from '@/utils/simple-markdown'

const props = defineProps<{
  show: boolean
  config: NotificationTemplateConfig
}>()

const emit = defineEmits<{
  close: []
  save: [config: NotificationTemplateConfig]
}>()

const { width } = useWindowSize()
const previewCols = computed(() => (width.value < 960 ? 1 : 2))
const activeGroup = ref<NotificationTemplateGroup>('markdown')
const activeScene = ref<NotificationTemplateScene>('singleReminder')
const activeField = ref<'titleTemplate' | 'bodyTemplate'>('bodyTemplate')
const draftConfig = ref<NotificationTemplateConfig>(resolveNotificationTemplateConfig(props.config, getAppLocale()))

const groupOptions = computed(() => [
  { label: t('settings.templates.groups.markdown'), value: 'markdown' },
  { label: t('settings.templates.groups.html'), value: 'html' },
  { label: t('settings.templates.groups.text'), value: 'text' }
] satisfies Array<{ label: string; value: NotificationTemplateGroup }>)

const sceneOptions = computed(() => [
  { label: t('settings.templates.scenes.singleReminder'), value: 'singleReminder' },
  { label: t('settings.templates.scenes.mergedReminder'), value: 'mergedReminder' },
  { label: t('settings.templates.scenes.testNotification'), value: 'testNotification' },
  { label: t('settings.templates.scenes.forgotPassword'), value: 'forgotPassword' }
] satisfies Array<{ label: string; value: NotificationTemplateScene }>)

const currentEntry = computed(() => draftConfig.value[activeGroup.value][activeScene.value])

const placeholderOptions = computed(() => [
  { token: '{{appName}}', label: t('settings.templates.placeholders.appName') },
  { token: '{{title}}', label: t('settings.templates.placeholders.title') },
  { token: '{{phaseLabel}}', label: t('settings.templates.placeholders.phaseLabel') },
  { token: '{{subscriptionCount}}', label: t('settings.templates.placeholders.subscriptionCount') },
  { token: '{{detailsBlock}}', label: t('settings.templates.placeholders.detailsBlock') },
  { token: '{{summaryBlock}}', label: t('settings.templates.placeholders.summaryBlock') },
  { token: '{{sectionsBlock}}', label: t('settings.templates.placeholders.sectionsBlock') },
  { token: '{{testIntroBlock}}', label: t('settings.templates.placeholders.testIntroBlock') },
  { token: '{{forgotPasswordBlock}}', label: t('settings.templates.placeholders.forgotPasswordBlock') },
  { token: '{{subscription.name}}', label: t('settings.templates.placeholders.subscriptionName') },
  { token: '{{subscription.nextRenewalDate}}', label: t('settings.templates.placeholders.subscriptionNextRenewalDate') },
  { token: '{{subscription.amount}}', label: t('settings.templates.placeholders.subscriptionAmount') },
  { token: '{{subscription.currency}}', label: t('settings.templates.placeholders.subscriptionCurrency') },
  { token: '{{subscription.amountWithCurrency}}', label: t('settings.templates.placeholders.subscriptionAmountWithCurrency') },
  { token: '{{subscription.tags}}', label: t('settings.templates.placeholders.subscriptionTags') },
  { token: '{{subscription.websiteUrl}}', label: t('settings.templates.placeholders.subscriptionWebsiteUrl') },
  { token: '{{subscription.notes}}', label: t('settings.templates.placeholders.subscriptionNotes') },
  { token: '{{subscription.daysUntilRenewal}}', label: t('settings.templates.placeholders.subscriptionDaysUntilRenewal') },
  { token: '{{subscription.daysOverdue}}', label: t('settings.templates.placeholders.subscriptionDaysOverdue') },
  { token: '{{username}}', label: t('settings.templates.placeholders.username') },
  { token: '{{code}}', label: t('settings.templates.placeholders.code') },
  { token: '{{expiresInMinutes}}', label: t('settings.templates.placeholders.expiresInMinutes') }
])

const currentGroupChannels = computed(() => t(`settings.templates.supportedChannels.${activeGroup.value}`))

function buildPreviewValues(group: NotificationTemplateGroup, scene: NotificationTemplateScene) {
  const phaseLabel = t('notifications.phases.upcoming')
  const detailsBlock =
    group === 'html'
      ? '<ul><li><strong>名称</strong>：Netflix</li><li><strong>下次续订</strong>：2026-06-01</li><li><strong>金额</strong>：69 CNY</li><li><strong>标签</strong>：影音</li><li><strong>备注</strong>：家庭套餐</li></ul>'
      : group === 'markdown'
        ? '- **名称**：Netflix\n- **下次续订**：2026-06-01\n- **金额**：69 CNY\n- **标签**：影音\n- **备注**：家庭套餐'
        : '订阅名称：Netflix\n下次续订：2026-06-01\n金额：69 CNY\n标签：影音\n备注：家庭套餐'
  const summaryBlock =
    group === 'html'
      ? '<p>提醒类型：订阅提醒汇总</p><p>订阅数量：2 项</p>'
      : group === 'markdown'
        ? '> 提醒类型：订阅提醒汇总\n> 订阅数量：2 项'
        : '提醒类型：订阅提醒汇总\n订阅数量：2 项'
  const sectionsBlock =
    group === 'html'
      ? '<section><h3>即将到期</h3><ol><li><strong>Netflix</strong><div>下次续订：2026-06-01</div><div>金额：69 CNY</div></li><li><strong>Spotify</strong><div>下次续订：2026-06-03</div><div>金额：15 CNY</div></li></ol></section>'
      : group === 'markdown'
        ? '### 即将到期\n\n1. **Netflix**\n   - 下次续订：2026-06-01\n   - 金额：69 CNY\n\n2. **Spotify**\n   - 下次续订：2026-06-03\n   - 金额：15 CNY'
        : '【即将到期】\n1. Netflix\n   下次续订：2026-06-01\n   金额：69 CNY\n\n2. Spotify\n   下次续订：2026-06-03\n   金额：15 CNY'
  const forgotPasswordBlock =
    group === 'html'
      ? '<ul><li><strong>用户名</strong>：admin</li><li><strong>验证码</strong>：123456</li><li>有效期：10 分钟</li></ul><p>如果这不是你的操作，请忽略本次通知。</p>'
      : group === 'markdown'
        ? '- **用户名**：admin\n- **验证码**：123456\n- **有效期**：10 分钟\n\n如果这不是你的操作，请忽略本次通知。'
        : '用户名：admin\n验证码：123456\n有效期：10 分钟\n如果这不是你的操作，请忽略本次通知。'
  const testIntroBlock =
    group === 'html'
      ? '<p>这是一条测试通知，用于验证当前通知渠道和模板配置。</p>'
      : group === 'markdown'
        ? '> 这是一条测试通知，用于验证当前通知渠道和模板配置。'
        : '这是一条测试通知，用于验证当前通知渠道和模板配置。'

  return {
    appName: 'SubTracker',
    title: scene === 'forgotPassword' ? t('notifications.forgotPassword.title') : phaseLabel,
    phaseLabel,
    subscriptionCount: '2',
    detailsBlock,
    summaryBlock,
    sectionsBlock,
    testIntroBlock,
    forgotPasswordBlock,
    'subscription.name': 'Netflix',
    'subscription.nextRenewalDate': '2026-06-01',
    'subscription.amount': '69',
    'subscription.currency': 'CNY',
    'subscription.amountWithCurrency': '69 CNY',
    'subscription.tags': '影音',
    'subscription.websiteUrl': 'https://example.com/netflix',
    'subscription.notes': '家庭套餐',
    'subscription.daysUntilRenewal': '3',
    'subscription.daysOverdue': '0',
    username: 'admin',
    code: '123456',
    expiresInMinutes: '10'
  }
}

const previewTitle = computed(() => {
  const values = buildPreviewValues(activeGroup.value, activeScene.value)
  return applyNotificationTemplate(currentEntry.value.titleTemplate, values)
})

const previewBody = computed(() => {
  const values = buildPreviewValues(activeGroup.value, activeScene.value)
  return applyNotificationTemplate(currentEntry.value.bodyTemplate, {
    ...values,
    title: previewTitle.value
  })
})

const markdownPreviewHtml = computed(() => renderMarkdownToHtml(previewBody.value))
const htmlPreview = computed(() =>
  DOMPurify.sanitize(previewBody.value, {
    USE_PROFILES: { html: true }
  })
)

watch(
  () => [props.show, props.config, getAppLocale()] as const,
  ([show]) => {
    if (!show) return
    draftConfig.value = resolveNotificationTemplateConfig(props.config, getAppLocale())
  },
  { deep: true, immediate: true }
)

function insertPlaceholder(token: string) {
  const target = currentEntry.value[activeField.value]
  currentEntry.value[activeField.value] = `${target}${target ? '\n' : ''}${token}`
}

function restoreCurrentEntryDefault() {
  Object.assign(currentEntry.value, getDefaultNotificationTemplate(activeGroup.value, activeScene.value, getAppLocale()))
}

function handleSave() {
  emit('save', JSON.parse(JSON.stringify(draftConfig.value)) as NotificationTemplateConfig)
}

function handleUpdateShow(value: boolean) {
  if (!value) emit('close')
}
</script>

<style scoped>
.notification-template-modal__scene-select {
  width: min(240px, 100%);
}

.notification-template-modal__placeholder-block {
  flex: 1;
  min-width: 0;
}

.notification-template-modal__placeholder-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.notification-template-modal__placeholder-list {
  margin-top: 8px;
}

.notification-template-modal__preview-title {
  font-size: 15px;
  font-weight: 700;
}

.notification-template-modal__preview-pre pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.notification-template-modal__preview-html {
  line-height: 1.7;
  word-break: break-word;
}

:deep(.notification-template-modal__preview-html h1),
:deep(.notification-template-modal__preview-html h2),
:deep(.notification-template-modal__preview-html h3),
:deep(.notification-template-modal__preview-html p),
:deep(.notification-template-modal__preview-html ul),
:deep(.notification-template-modal__preview-html ol),
:deep(.notification-template-modal__preview-html blockquote) {
  margin: 0 0 12px;
}
</style>
