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
  compactNotificationTemplateConfig,
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

function formatPreviewLine(label: string, value: string) {
  const locale = getAppLocale()
  return `${label}${locale === 'en-US' ? ': ' : '：'}${value}`
}

function buildPreviewSample() {
  const locale = getAppLocale()
  return {
    primaryName: 'Netflix',
    secondaryName: 'Spotify',
    primaryDate: '2026-06-01',
    secondaryDate: '2026-06-03',
    primaryAmount: '69 CNY',
    secondaryAmount: '15 CNY',
    primaryTag: t('notifications.preview.samplePrimaryTag'),
    primaryNotes: t('notifications.preview.samplePrimaryNotes'),
    username: 'admin',
    code: '123456',
    expiresInMinutes: '10'
  }
}

function buildPreviewValues(group: NotificationTemplateGroup, scene: NotificationTemplateScene) {
  const sample = buildPreviewSample()
  const phaseLabel = t('notifications.phases.upcoming')
  const detailsBlock =
    group === 'html'
      ? [
          '<ul>',
          `<li><strong>${t('common.labels.name')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryName}</li>`,
          `<li><strong>${t('common.labels.nextRenewal')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryDate}</li>`,
          `<li><strong>${t('common.labels.amount')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryAmount}</li>`,
          `<li><strong>${t('common.labels.tags')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryTag}</li>`,
          `<li><strong>${t('common.labels.notes')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryNotes}</li>`,
          '</ul>'
        ].join('')
      : group === 'markdown'
        ? [
            `- **${t('common.labels.name')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryName}`,
            `- **${t('common.labels.nextRenewal')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryDate}`,
            `- **${t('common.labels.amount')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryAmount}`,
            `- **${t('common.labels.tags')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryTag}`,
            `- **${t('common.labels.notes')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.primaryNotes}`
          ].join('\n')
        : [
            formatPreviewLine(t('common.labels.name'), sample.primaryName),
            formatPreviewLine(t('common.labels.nextRenewal'), sample.primaryDate),
            formatPreviewLine(t('common.labels.amount'), sample.primaryAmount),
            formatPreviewLine(t('common.labels.tags'), sample.primaryTag),
            formatPreviewLine(t('common.labels.notes'), sample.primaryNotes)
          ].join('\n')
  const summaryBlock =
    group === 'html'
      ? `<p>${formatPreviewLine(t('notifications.labels.reminderType', { value: '' }).replace(/[:：]\s*$/, ''), t('notifications.phases.summary'))}</p><p>${t('notifications.labels.subscriptionCount', { count: 2 })}</p>`
      : group === 'markdown'
        ? `> ${t('notifications.labels.reminderType', { value: t('notifications.phases.summary') })}\n> ${t('notifications.labels.subscriptionCount', { count: 2 })}`
        : `${t('notifications.labels.reminderType', { value: t('notifications.phases.summary') })}\n${t('notifications.labels.subscriptionCount', { count: 2 })}`
  const sectionsBlock =
    group === 'html'
      ? [
          `<section><h3>${t('notifications.phases.upcoming')}</h3><ol>`,
          `<li><strong>${sample.primaryName}</strong><div>${formatPreviewLine(t('common.labels.nextRenewal'), sample.primaryDate)}</div><div>${formatPreviewLine(t('common.labels.amount'), sample.primaryAmount)}</div></li>`,
          `<li><strong>${sample.secondaryName}</strong><div>${formatPreviewLine(t('common.labels.nextRenewal'), sample.secondaryDate)}</div><div>${formatPreviewLine(t('common.labels.amount'), sample.secondaryAmount)}</div></li>`,
          '</ol></section>'
        ].join('')
      : group === 'markdown'
        ? [
            `### ${t('notifications.phases.upcoming')}`,
            '',
            `1. **${sample.primaryName}**`,
            `   - ${formatPreviewLine(t('common.labels.nextRenewal'), sample.primaryDate)}`,
            `   - ${formatPreviewLine(t('common.labels.amount'), sample.primaryAmount)}`,
            '',
            `2. **${sample.secondaryName}**`,
            `   - ${formatPreviewLine(t('common.labels.nextRenewal'), sample.secondaryDate)}`,
            `   - ${formatPreviewLine(t('common.labels.amount'), sample.secondaryAmount)}`
          ].join('\n')
        : [
            `【${t('notifications.phases.upcoming')}】`,
            `1. ${sample.primaryName}`,
            `   ${formatPreviewLine(t('common.labels.nextRenewal'), sample.primaryDate)}`,
            `   ${formatPreviewLine(t('common.labels.amount'), sample.primaryAmount)}`,
            '',
            `2. ${sample.secondaryName}`,
            `   ${formatPreviewLine(t('common.labels.nextRenewal'), sample.secondaryDate)}`,
            `   ${formatPreviewLine(t('common.labels.amount'), sample.secondaryAmount)}`
          ].join('\n')
  const forgotPasswordBlock =
    group === 'html'
      ? [
          '<ul>',
          `<li><strong>${t('common.labels.username')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.username}</li>`,
          `<li><strong>${t('common.labels.code')}</strong>${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.code}</li>`,
          `<li>${t('notifications.forgotPassword.expiresInMinutes', { minutes: Number(sample.expiresInMinutes) })}</li>`,
          '</ul>',
          `<p>${t('notifications.forgotPassword.ignoreHint')}</p>`
        ].join('')
      : group === 'markdown'
        ? [
            `- **${t('common.labels.username')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.username}`,
            `- **${t('common.labels.code')}**${getAppLocale() === 'en-US' ? ': ' : '：'}${sample.code}`,
            `- ${t('notifications.forgotPassword.expiresInMinutes', { minutes: Number(sample.expiresInMinutes) })}`,
            '',
            t('notifications.forgotPassword.ignoreHint')
          ].join('\n')
        : [
            formatPreviewLine(t('common.labels.username'), sample.username),
            formatPreviewLine(t('common.labels.code'), sample.code),
            t('notifications.forgotPassword.expiresInMinutes', { minutes: Number(sample.expiresInMinutes) }),
            t('notifications.forgotPassword.ignoreHint')
          ].join('\n')
  const testIntroBlock =
    group === 'html'
      ? `<p>${t('notifications.tests.intro')}</p>`
      : group === 'markdown'
        ? `> ${t('notifications.tests.intro')}`
        : t('notifications.tests.intro')

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
    'subscription.name': sample.primaryName,
    'subscription.nextRenewalDate': sample.primaryDate,
    'subscription.amount': '69',
    'subscription.currency': 'CNY',
    'subscription.amountWithCurrency': sample.primaryAmount,
    'subscription.tags': sample.primaryTag,
    'subscription.websiteUrl': 'https://example.com/netflix',
    'subscription.notes': sample.primaryNotes,
    'subscription.daysUntilRenewal': '3',
    'subscription.daysOverdue': '0',
    username: sample.username,
    code: sample.code,
    expiresInMinutes: sample.expiresInMinutes
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
  emit(
    'save',
    compactNotificationTemplateConfig(
      JSON.parse(JSON.stringify(draftConfig.value)) as NotificationTemplateConfig
    ) as NotificationTemplateConfig
  )
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
