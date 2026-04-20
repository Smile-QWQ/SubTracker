<template>
  <div>
    <page-header
      title="系统设置"
      subtitle="管理基础参数、预算、汇率、通知与 AI 识别"
      :icon="settingsOutline"
      icon-background="linear-gradient(135deg, #64748b 0%, #334155 100%)"
    />

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card title="基础设置" class="settings-card">
          <n-form :model="settingsForm" label-placement="top">
            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item label="基准货币">
                  <n-select v-model:value="settingsForm.baseCurrency" :options="allCurrencyOptions" filterable />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="记住登录天数">
                  <n-input-number v-model:value="settingsForm.rememberSessionDays" :min="1" :max="365" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item label="月预算（基准货币）">
                  <n-input-number v-model:value="settingsForm.monthlyBudgetBase" :min="0" :precision="2" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="年预算（基准货币）">
                  <n-input-number v-model:value="settingsForm.yearlyBudgetBase" :min="0" :precision="2" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      <span>到期前提醒规则</span>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-icon class="label-with-tip__icon" :component="helpCircleOutline" />
                        </template>
                        <span>格式说明：天数&时间;，例如 3&09:30; 表示提前 3 天在 09:30 提醒，0&09:30; 表示到期当天提醒；多条规则用 ; 分隔</span>
                      </n-tooltip>
                    </span>
                  </template>
                  <n-input
                    v-model:value="settingsForm.defaultAdvanceReminderRules"
                    placeholder="例如：3&09:30;0&09:30;"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      <span>过期提醒规则</span>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-icon class="label-with-tip__icon" :component="helpCircleOutline" />
                        </template>
                        <span>格式说明：天数&时间;，例如 1&09:30; 表示过期 1 天后在 09:30 提醒；多条规则用 ; 分隔</span>
                      </n-tooltip>
                    </span>
                  </template>
                  <n-input
                    v-model:value="settingsForm.defaultOverdueReminderRules"
                    placeholder="例如：1&09:30;2&09:30;3&09:30;"
                  />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <div class="switch-row">
                  <div class="switch-group">
                    <div class="switch-group__item">
                      <span class="switch-inline-label">多订阅合并通知</span>
                      <n-switch v-model:value="settingsForm.mergeMultiSubscriptionNotifications" />
                    </div>
                  </div>
                </div>
              </n-grid-item>
              <n-grid-item>
                <div class="switch-row">
                  <div class="switch-group switch-group--single">
                    <div class="switch-group__item">
                      <n-switch v-model:value="settingsForm.enableTagBudgets" />
                      <span class="switch-label">启用标签月预算</span>
                    </div>
                  </div>
                </div>
              </n-grid-item>
            </n-grid>

            <n-space style="margin-top: 12px">
              <n-button type="primary" @click="saveBasicSettings">
                <template #icon>
                  <n-icon><save-outline /></n-icon>
                </template>
                保存
              </n-button>
            </n-space>
          </n-form>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="汇率快照" class="settings-card">
          <n-descriptions v-if="snapshot" :column="1" bordered>
            <n-descriptions-item label="基准货币">{{ snapshot.baseCurrency }}</n-descriptions-item>
            <n-descriptions-item label="来源名称">{{ snapshot.provider }}</n-descriptions-item>
            <n-descriptions-item label="接口地址">
              <a :href="providerUrl" target="_blank" rel="noreferrer" class="provider-link">{{ providerUrl }}</a>
            </n-descriptions-item>
            <n-descriptions-item label="拉取时间">{{ formatTime(snapshot.fetchedAt) }}</n-descriptions-item>
            <n-descriptions-item label="数据状态">
              <n-tag :type="snapshot.isStale ? 'warning' : 'success'">{{ snapshot.isStale ? '旧快照' : '最新' }}</n-tag>
            </n-descriptions-item>
          </n-descriptions>

          <n-space style="margin-top: 12px">
            <n-button @click="refreshRates">
              <template #icon>
                <n-icon><refresh-outline /></n-icon>
              </template>
              刷新
            </n-button>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="当前汇率（常用货币）" class="settings-card">
          <template #header-extra>
            <n-space>
              <n-tag type="success">基准货币 {{ settingsForm.baseCurrency }}</n-tag>
              <n-tag type="info">支持 {{ supportedCurrencyCount }} 种货币</n-tag>
            </n-space>
          </template>
          <n-data-table :columns="rateColumns" :data="currentRates" :pagination="false" />
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="汇率转换器" class="settings-card">
          <n-space vertical style="width: 100%">
            <n-grid :cols="formCols" :x-gap="12" :y-gap="12">
              <n-grid-item>
                <n-select v-model:value="sourceCurrency" :options="allCurrencyOptions" filterable placeholder="源货币" />
              </n-grid-item>
              <n-grid-item>
                <n-select v-model:value="targetCurrency" :options="allCurrencyOptions" filterable placeholder="目标货币" />
              </n-grid-item>
            </n-grid>
            <n-input-number v-model:value="converterAmount" :min="0" :precision="4" style="width: 100%" />
            <n-card size="small" embedded>
              <template v-if="sourceCurrency && targetCurrency">
                <div class="converter-main">
                  {{ Number(converterAmount || 0).toFixed(4) }} {{ sourceCurrency }} = {{ convertedPreview.toFixed(4) }} {{ targetCurrency }}
                </div>
                <div class="converter-sub">1 {{ sourceCurrency }} = {{ converterRateDisplay }} {{ targetCurrency }}</div>
              </template>
              <template v-else>请选择要转换的货币</template>
            </n-card>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item :span="gridSpanFull">
        <n-card title="通知设置" class="settings-card">
          <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
            统一管理邮箱、PushPlus 与 Webhook。每个渠道都可以单独保存并单独测试。
          </n-alert>

          <n-grid :cols="notificationGridCols" :x-gap="12" :y-gap="12">
            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>邮箱通知</span>
                  <n-switch v-model:value="settingsForm.emailNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item label="SMTP Host">
                    <n-input v-model:value="settingsForm.emailConfig.host" />
                  </n-form-item>
                  <n-grid :cols="formCols" :x-gap="8">
                    <n-grid-item>
                      <n-form-item label="端口">
                        <n-input-number v-model:value="settingsForm.emailConfig.port" :min="1" :max="65535" style="width: 100%" />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item label="Secure">
                        <n-switch v-model:value="settingsForm.emailConfig.secure" />
                      </n-form-item>
                    </n-grid-item>
                  </n-grid>
                  <n-form-item label="用户名">
                    <n-input v-model:value="settingsForm.emailConfig.username" />
                  </n-form-item>
                  <n-form-item label="密码">
                    <n-input v-model:value="settingsForm.emailConfig.password" type="password" show-password-on="click" />
                  </n-form-item>
                  <n-form-item label="发件人">
                    <n-input v-model:value="settingsForm.emailConfig.from" placeholder="SubTracker <noreply@example.com>" />
                  </n-form-item>
                  <n-form-item label="收件人">
                    <n-input v-model:value="settingsForm.emailConfig.to" placeholder="多个邮箱请用英文逗号分隔" />
                  </n-form-item>
                  <n-space>
                    <n-button @click="saveEmailSettings">保存</n-button>
                    <n-button type="primary" @click="testEmail">测试</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>PushPlus</span>
                  <n-switch v-model:value="settingsForm.pushplusNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item label="Token">
                    <n-input v-model:value="settingsForm.pushplusConfig.token" />
                  </n-form-item>
                  <n-form-item label="Topic">
                    <n-input v-model:value="settingsForm.pushplusConfig.topic" placeholder="可选" />
                  </n-form-item>
                  <n-space>
                    <n-button @click="savePushplusSettings">保存</n-button>
                    <n-button type="primary" @click="testPushplus">测试</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>Telegram Bot</span>
                  <n-switch v-model:value="settingsForm.telegramNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item label="Bot Token">
                    <n-input v-model:value="settingsForm.telegramConfig.botToken" type="password" show-password-on="click" />
                  </n-form-item>
                  <n-form-item label="Chat ID">
                    <n-input v-model:value="settingsForm.telegramConfig.chatId" placeholder="例如：123456789 或 -100xxxxxxxxxx" />
                  </n-form-item>
                  <n-space>
                    <n-button @click="saveTelegramSettings">保存</n-button>
                    <n-button type="primary" @click="testTelegram">测试</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>Webhook</span>
                  <n-switch v-model:value="webhookForm.enabled" />
                </div>
                <n-form label-placement="top">
                  <n-grid :cols="formCols" :x-gap="8">
                    <n-grid-item :span="formCols === 1 ? 1 : 2">
                      <n-form-item label="URL">
                        <n-input v-model:value="webhookForm.url" placeholder="https://example.com/hook" />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item label="请求方法">
                        <n-select v-model:value="webhookForm.requestMethod" :options="webhookMethodOptions" />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item>
                        <n-switch v-model:value="webhookForm.ignoreSsl" />
                        <span class="switch-label">忽略 SSL 校验</span>
                      </n-form-item>
                    </n-grid-item>
                  </n-grid>

                  <n-collapse arrow-placement="right" class="webhook-advanced">
                    <n-collapse-item title="高级配置" name="advanced">
                      <n-form-item label="自定义请求头">
                        <n-input
                          v-model:value="webhookForm.headers"
                          type="textarea"
                          :autosize="{ minRows: 3, maxRows: 6 }"
                          placeholder="支持 JSON 对象或每行一个 Header，例如：&#10;Content-Type: application/json&#10;X-App: SubTracker"
                        />
                      </n-form-item>
                      <n-form-item label="Payload 模板">
                        <n-input
                          v-model:value="webhookForm.payloadTemplate"
                          type="textarea"
                          :autosize="{ minRows: 6, maxRows: 12 }"
                        />
                      </n-form-item>
                      <n-alert type="info" :show-icon="false">
                        可用变量：{{ webhookVariablesText }}
                      </n-alert>
                    </n-collapse-item>
                  </n-collapse>
                  <n-space>
                    <n-button @click="saveWebhook">保存</n-button>
                    <n-button type="primary" @click="testWebhook">测试</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>
          </n-grid>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="AI 识别设置" class="settings-card">
          <n-form :model="settingsForm.aiConfig" label-placement="top">
            <n-form-item>
              <n-switch v-model:value="settingsForm.aiConfig.enabled" />
              <span class="switch-label">启用 AI 识别</span>
            </n-form-item>

            <n-grid :cols="formCols" :x-gap="12" :y-gap="12">
              <n-grid-item>
                <n-form-item label="Provider 预设">
                  <n-select
                    :value="settingsForm.aiConfig.providerPreset"
                    :options="aiProviderPresetOptions"
                    @update:value="handleAiPresetChange"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="Provider 名称">
                  <n-input v-model:value="settingsForm.aiConfig.providerName" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="Model">
                  <n-input v-model:value="settingsForm.aiConfig.model" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item>
                  <n-switch v-model:value="settingsForm.aiConfig.capabilities.vision" />
                  <span class="switch-label">模型视觉输入</span>
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-form-item label="API Base URL">
              <n-input v-model:value="settingsForm.aiConfig.baseUrl" placeholder="https://api.deepseek.com" />
            </n-form-item>
            <n-form-item label="API Key">
              <n-input v-model:value="settingsForm.aiConfig.apiKey" type="password" show-password-on="click" />
            </n-form-item>
            <n-collapse arrow-placement="right" class="ai-advanced">
              <n-collapse-item title="高级配置" name="advanced">
                <n-form-item>
                  <n-switch v-model:value="settingsForm.aiConfig.capabilities.structuredOutput" />
                  <span class="switch-label">优先结构化 JSON 输出</span>
                </n-form-item>
                <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
                  开启后会优先使用厂商支持的结构化 JSON 输出；若不支持，系统会自动降级为普通 JSON 提示词模式。
                </n-alert>
                <n-form-item label="请求超时（毫秒）">
                  <n-input-number v-model:value="settingsForm.aiConfig.timeoutMs" :min="5000" :max="120000" style="width: 100%" />
                </n-form-item>
                <n-form-item label="自定义提示词">
                  <n-input
                    v-model:value="aiPromptInput"
                    type="textarea"
                    :autosize="{ minRows: 6, maxRows: 12 }"
                    placeholder="未修改或为空时，会继续使用系统预设提示词"
                  />
                </n-form-item>
              </n-collapse-item>
            </n-collapse>
            <n-space>
              <n-button @click="saveAiSettings">保存</n-button>
              <n-button type="primary" ghost @click="testAiConnectionSettings">连接测试</n-button>
              <n-button v-if="settingsForm.aiConfig.capabilities.vision" type="primary" @click="testAiVisionSettings">视觉测试</n-button>
            </n-space>
          </n-form>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="登录凭据" class="settings-card">
          <n-form :model="credentialsForm" label-placement="top">
            <n-form-item label="原用户名">
              <n-input v-model:value="credentialsForm.oldUsername" />
            </n-form-item>
            <n-form-item label="原密码">
              <n-input v-model:value="credentialsForm.oldPassword" type="password" show-password-on="click" />
            </n-form-item>
            <n-form-item label="新用户名">
              <n-input v-model:value="credentialsForm.newUsername" />
            </n-form-item>
            <n-form-item label="新密码">
              <n-input v-model:value="credentialsForm.newPassword" type="password" show-password-on="click" />
            </n-form-item>
            <n-button type="primary" @click="submitCredentialsChange">修改</n-button>
          </n-form>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card title="导出和导入" class="settings-card">
          <n-space vertical style="width: 100%">
            <n-alert type="info" :show-icon="false">
              可导出全部订阅为 CSV / JSON，也可在这里导入 Wallos 数据。
            </n-alert>
            <n-space wrap>
              <n-button type="success" @click="showWallosImportModal = true">导入 Wallos</n-button>
              <n-button @click="exportSubscriptions('csv')">导出 CSV</n-button>
              <n-button @click="exportSubscriptions('json')">导出 JSON</n-button>
            </n-space>
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>

    <wallos-import-modal :show="showWallosImportModal" @close="showWallosImportModal = false" @imported="handleWallosImported" />
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onMounted, reactive, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_SUBSCRIPTION_PROMPT,
  DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
  DEFAULT_OVERDUE_REMINDER_RULES
} from '@subtracker/shared'
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NIcon,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  NTooltip,
  useMessage
} from 'naive-ui'
import { HelpCircleOutline, RefreshOutline, SaveOutline, SettingsOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import PageHeader from '@/components/PageHeader.vue'
import WallosImportModal from '@/components/WallosImportModal.vue'
import { useAuthStore } from '@/stores/auth'
import { isRememberedSession } from '@/utils/auth-storage'
import { buildCurrencyOptions } from '@/utils/currency'
import type { AiProviderPreset, ChangeCredentialsPayload, ExchangeRateSnapshot, NotificationWebhookSettings, Settings } from '@/types/api'

const message = useMessage()
const authStore = useAuthStore()
const queryClient = useQueryClient()
const { width } = useWindowSize()
const helpCircleOutline = HelpCircleOutline
const settingsOutline = SettingsOutline
const AI_PROVIDER_PRESETS: Record<
  Exclude<AiProviderPreset, 'custom'>,
  Pick<Settings['aiConfig'], 'providerName' | 'baseUrl' | 'model' | 'capabilities'>
> = {
  'aliyun-bailian': {
    providerName: '阿里百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-vl-plus',
    capabilities: {
      vision: true,
      structuredOutput: true
    }
  },
  'tencent-hunyuan': {
    providerName: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    model: 'hunyuan-vision',
    capabilities: {
      vision: true,
      structuredOutput: true
    }
  },
  'volcengine-ark': {
    providerName: '火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-vision-pro-32k-250115',
    capabilities: {
      vision: true,
      structuredOutput: true
    }
  }
}

const settingsForm = reactive<Settings>({
  baseCurrency: 'CNY',
  defaultNotifyDays: 3,
  defaultAdvanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES,
  rememberSessionDays: 7,
  notifyOnDueDay: true,
  mergeMultiSubscriptionNotifications: true,
  monthlyBudgetBase: null,
  yearlyBudgetBase: null,
  enableTagBudgets: false,
  overdueReminderDays: [1, 2, 3],
  defaultOverdueReminderRules: DEFAULT_OVERDUE_REMINDER_RULES,
  tagBudgets: {},
  emailNotificationsEnabled: false,
  pushplusNotificationsEnabled: false,
  telegramNotificationsEnabled: false,
  emailConfig: {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    to: ''
  },
  pushplusConfig: {
    token: '',
    topic: ''
  },
  telegramConfig: {
    botToken: '',
    chatId: ''
  },
  aiConfig: {
    ...DEFAULT_AI_CONFIG,
    capabilities: {
      ...DEFAULT_AI_CONFIG.capabilities
    }
  }
})

const credentialsForm = reactive<ChangeCredentialsPayload>({
  oldUsername: '',
  oldPassword: '',
  newUsername: '',
  newPassword: ''
})

const webhookForm = reactive<NotificationWebhookSettings>({
  enabled: false,
  url: '',
  requestMethod: 'POST',
  headers: 'Content-Type: application/json',
  payloadTemplate: DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
  ignoreSsl: false
})

const snapshot = ref<ExchangeRateSnapshot | null>(null)
const aiPromptInput = ref(DEFAULT_AI_SUBSCRIPTION_PROMPT)
const sourceCurrency = ref('USD')
const targetCurrency = ref('CNY')
const converterAmount = ref(1)
const showWallosImportModal = ref(false)
const isMobile = computed(() => width.value < 960)
const formCols = computed(() => (width.value < 640 ? 1 : 2))
const gridCols = computed(() => (isMobile.value ? 1 : 2))
const notificationGridCols = computed(() => (isMobile.value ? 1 : 2))
const gridSpanFull = computed(() => (isMobile.value ? 1 : 2))
const watchedCurrencies = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD']
const webhookMethodOptions = [
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' }
]
const webhookVariablesText =
  '{{phase}}、{{days_until}}、{{days_overdue}}、{{subscription_id}}、{{subscription_name}}、{{subscription_amount}}、{{subscription_currency}}、{{subscription_next_renewal_date}}、{{subscription_tags}}、{{subscription_url}}、{{subscription_notes}}'
const aiProviderPresetOptions = [
  { label: '自定义', value: 'custom' },
  { label: '阿里百炼', value: 'aliyun-bailian' },
  { label: '腾讯混元', value: 'tencent-hunyuan' },
  { label: '火山方舟', value: 'volcengine-ark' }
] satisfies Array<{ label: string; value: AiProviderPreset }>
function getMissingRequiredFields(fields: Array<[string, unknown]>) {
  return fields
    .filter(([, value]) => {
      if (typeof value === 'number') return Number.isNaN(value)
      return !String(value ?? '').trim()
    })
    .map(([label]) => label)
}

function validateEmailSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.emailNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    ['SMTP Host', settingsForm.emailConfig.host],
    ['端口', settingsForm.emailConfig.port],
    ['用户名', settingsForm.emailConfig.username],
    ['密码', settingsForm.emailConfig.password],
    ['发件人', settingsForm.emailConfig.from],
    ['收件人', settingsForm.emailConfig.to]
  ])

  if (!missing.length) return true
  message.error(`邮箱通知缺少必填项：${missing.join('、')}`)
  return false
}

function validatePushplusSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.pushplusNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([['Token', settingsForm.pushplusConfig.token]])
  if (!missing.length) return true
  message.error(`PushPlus 缺少必填项：${missing.join('、')}`)
  return false
}

function validateTelegramSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.telegramNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    ['Bot Token', settingsForm.telegramConfig.botToken],
    ['Chat ID', settingsForm.telegramConfig.chatId]
  ])
  if (!missing.length) return true
  message.error(`Telegram 缺少必填项：${missing.join('、')}`)
  return false
}

function validateWebhookSettings(action: 'save' | 'test') {
  if (action === 'save' && !webhookForm.enabled) {
    return true
  }

  const missing = getMissingRequiredFields([['URL', webhookForm.url]])
  if (!missing.length) return true
  message.error(`Webhook 缺少必填项：${missing.join('、')}`)
  return false
}

function validateAiSettings(action: 'save' | 'connection-test' | 'vision-test') {
  if (action === 'save' && !settingsForm.aiConfig.enabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    ['Provider 名称', settingsForm.aiConfig.providerName],
    ['Model', settingsForm.aiConfig.model],
    ['API Base URL', settingsForm.aiConfig.baseUrl],
    ['API Key', settingsForm.aiConfig.apiKey]
  ])

  if (!missing.length) return true
  message.error(`AI 识别缺少必填项：${missing.join('、')}`)
  return false
}

onMounted(async () => {
  await Promise.all([loadSettings(), loadSnapshot(), loadWebhook()])
})

async function loadSettings() {
  const settings = await api.getSettings()
  Object.assign(settingsForm, settings)
  aiPromptInput.value = settings.aiConfig.promptTemplate.trim() || DEFAULT_AI_SUBSCRIPTION_PROMPT
  credentialsForm.oldUsername = authStore.username
  credentialsForm.newUsername = authStore.username
  targetCurrency.value = settings.baseCurrency
}

async function loadSnapshot() {
  snapshot.value = await api.getExchangeRateSnapshot()
}

async function loadWebhook() {
  const current = await api.getNotificationWebhook()
  Object.assign(webhookForm, current)
}

async function saveBasicSettings() {
  try {
    const result = await api.updateSettings({
      baseCurrency: settingsForm.baseCurrency.toUpperCase(),
      defaultAdvanceReminderRules: settingsForm.defaultAdvanceReminderRules,
      rememberSessionDays: settingsForm.rememberSessionDays,
      mergeMultiSubscriptionNotifications: settingsForm.mergeMultiSubscriptionNotifications,
      monthlyBudgetBase: settingsForm.monthlyBudgetBase,
      yearlyBudgetBase: settingsForm.yearlyBudgetBase,
      enableTagBudgets: settingsForm.enableTagBudgets,
      defaultOverdueReminderRules: settingsForm.defaultOverdueReminderRules,
      tagBudgets: settingsForm.tagBudgets
    })
    Object.assign(settingsForm, result)
    message.success('基础设置已保存')
    targetCurrency.value = settingsForm.baseCurrency.toUpperCase()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['settings'] }),
      queryClient.invalidateQueries({ queryKey: ['settings-budget-page'] }),
      queryClient.invalidateQueries({ queryKey: ['app-menu-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['statistics-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['statistics-budgets'] })
    ])
    await loadSnapshot()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '基础设置保存失败')
  }
}

async function saveEmailSettings() {
  if (!validateEmailSettings('save')) return
  await api.updateSettings({
    emailNotificationsEnabled: settingsForm.emailNotificationsEnabled,
    emailConfig: settingsForm.emailConfig
  })
  message.success(settingsForm.emailNotificationsEnabled ? '邮箱通知配置已保存' : '邮箱通知已关闭')
}

async function savePushplusSettings() {
  if (!validatePushplusSettings('save')) return
  await api.updateSettings({
    pushplusNotificationsEnabled: settingsForm.pushplusNotificationsEnabled,
    pushplusConfig: settingsForm.pushplusConfig
  })
  message.success(settingsForm.pushplusNotificationsEnabled ? 'PushPlus 配置已保存' : 'PushPlus 已关闭')
}

async function saveTelegramSettings() {
  if (!validateTelegramSettings('save')) return
  await api.updateSettings({
    telegramNotificationsEnabled: settingsForm.telegramNotificationsEnabled,
    telegramConfig: settingsForm.telegramConfig
  })
  message.success(settingsForm.telegramNotificationsEnabled ? 'Telegram 配置已保存' : 'Telegram 已关闭')
}

async function saveAiSettings() {
  if (!validateAiSettings('save')) return
  const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
  settingsForm.aiConfig.promptTemplate = promptTemplate
  aiPromptInput.value = promptTemplate || DEFAULT_AI_SUBSCRIPTION_PROMPT
  await api.updateSettings({
    aiConfig: {
      ...settingsForm.aiConfig,
      capabilities: {
        ...settingsForm.aiConfig.capabilities
      },
      promptTemplate
    }
  })
  message.success(settingsForm.aiConfig.enabled ? 'AI 识别配置已保存' : 'AI 识别已关闭')
}

async function testAiConnectionSettings() {
  if (!validateAiSettings('connection-test')) return
  try {
    const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
    const result = await api.testAiConfigurationWithPayload({
      ...settingsForm.aiConfig,
      promptTemplate,
      capabilities: {
        ...settingsForm.aiConfig.capabilities
      }
    })
    message.success(`连接测试成功：${result.providerName} / ${result.model} / ${result.response}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'AI 连接测试失败')
  }
}

async function testAiVisionSettings() {
  if (!validateAiSettings('vision-test')) return
  try {
    const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
    const result = await api.testAiVisionConfigurationWithPayload({
      ...settingsForm.aiConfig,
      promptTemplate,
      capabilities: {
        ...settingsForm.aiConfig.capabilities
      }
    })
    message.success(`视觉测试成功：${result.providerName} / ${result.model} / ${result.response}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'AI 视觉测试失败')
  }
}

function normalizeAiPrompt(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized === DEFAULT_AI_SUBSCRIPTION_PROMPT.trim()) return ''
  return value
}

function handleAiPresetChange(value: AiProviderPreset) {
  settingsForm.aiConfig.providerPreset = value
  if (value === 'custom') {
    return
  }

  const preset = AI_PROVIDER_PRESETS[value]
  settingsForm.aiConfig.providerName = preset.providerName
  settingsForm.aiConfig.baseUrl = preset.baseUrl
  settingsForm.aiConfig.model = preset.model
  settingsForm.aiConfig.capabilities = {
    ...preset.capabilities
  }
}

async function refreshRates() {
  snapshot.value = await api.refreshExchangeRates()
  message.success('汇率已刷新')
}

async function submitCredentialsChange() {
  const result = await api.changeCredentials(credentialsForm)
  authStore.setSession(result.token, result.user.username, isRememberedSession(), result.user.mustChangePassword)
  credentialsForm.oldPassword = ''
  credentialsForm.newPassword = ''
  credentialsForm.oldUsername = result.user.username
  credentialsForm.newUsername = result.user.username
  message.success('登录凭据已更新')
}

async function testEmail() {
  if (!validateEmailSettings('test')) return
  try {
    await api.testEmailNotificationWithPayload(settingsForm.emailConfig)
    message.success('测试邮件已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '邮箱测试失败')
  }
}

async function testPushplus() {
  if (!validatePushplusSettings('test')) return
  try {
    const result = await api.testPushplusNotificationWithPayload(settingsForm.pushplusConfig)
    message.success(
      result.shortCode
        ? `PushPlus 测试请求已提交，流水号：${result.shortCode}`
        : result.message || 'PushPlus 测试请求已提交'
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'PushPlus 测试失败')
  }
}

async function testTelegram() {
  if (!validateTelegramSettings('test')) return
  try {
    await api.testTelegramNotificationWithPayload(settingsForm.telegramConfig)
    message.success('Telegram 测试消息已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Telegram 测试失败')
  }
}

async function exportSubscriptions(format: 'csv' | 'json') {
  try {
    const result = await api.exportSubscriptions(format)
    const url = window.URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = result.filename
    link.click()
    window.URL.revokeObjectURL(url)
    message.success(`${format.toUpperCase()} 导出已开始`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导出失败')
  }
}

function handleWallosImported() {
  showWallosImportModal.value = false
  message.success('Wallos 数据已导入')
}

async function saveWebhook() {
  if (!validateWebhookSettings('save')) return
  const saved = await api.updateNotificationWebhook({
    url: webhookForm.url.trim(),
    enabled: webhookForm.enabled,
    requestMethod: webhookForm.requestMethod,
    headers: webhookForm.headers.trim() || 'Content-Type: application/json',
    payloadTemplate: webhookForm.payloadTemplate.trim() || DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
    ignoreSsl: webhookForm.ignoreSsl
  })
  Object.assign(webhookForm, saved)
  message.success(webhookForm.enabled ? 'Webhook 配置已保存' : 'Webhook 已关闭')
}

async function testWebhook() {
  if (!validateWebhookSettings('test')) return
  try {
    const result = await api.testWebhookNotificationWithPayload({
      url: webhookForm.url,
      enabled: webhookForm.enabled,
      requestMethod: webhookForm.requestMethod,
      headers: webhookForm.headers.trim() || 'Content-Type: application/json',
      payloadTemplate: webhookForm.payloadTemplate.trim() || DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
      ignoreSsl: webhookForm.ignoreSsl
    })
    const preview = result.responseBody?.trim()
    message.success(preview ? `Webhook 测试成功，HTTP ${result.statusCode}：${preview}` : `Webhook 测试成功，HTTP ${result.statusCode}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Webhook 测试失败')
  }
}

const supportedCurrencies = computed(() => {
  if (!snapshot.value) return ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD']
  return Array.from(new Set([snapshot.value.baseCurrency, ...Object.keys(snapshot.value.rates)])).sort()
})

const supportedCurrencyCount = computed(() => supportedCurrencies.value.length)
const allCurrencyOptions = computed(() => buildCurrencyOptions(supportedCurrencies.value))

const currentRates = computed(() => {
  if (!snapshot.value) return []
  const targetBaseCurrency = settingsForm.baseCurrency.toUpperCase()
  const snapshotBase = snapshot.value.baseCurrency
  const rates = snapshot.value.rates

  return watchedCurrencies
    .filter((code) => code !== targetBaseCurrency && rates[code])
    .map((code) => ({
      currency: code,
      rate: Number(
        (
          (code === snapshotBase ? 1 : 1 / (rates[code] ?? 1)) *
          (targetBaseCurrency === snapshotBase ? 1 : rates[targetBaseCurrency] ?? 1)
        ).toFixed(4)
      )
    }))
})

const convertedPreview = computed(() => {
  if (!snapshot.value || !sourceCurrency.value || !targetCurrency.value) return 0

  const from = sourceCurrency.value.toUpperCase()
  const to = targetCurrency.value.toUpperCase()
  const rates = snapshot.value.rates
  const base = snapshot.value.baseCurrency

  const sourceToBase = from === base ? 1 : 1 / (rates[from] ?? 1)
  const baseToTarget = to === base ? 1 : rates[to] ?? 1
  return Number((Number(converterAmount.value || 0) * sourceToBase * baseToTarget).toFixed(4))
})

const converterRateDisplay = computed(() => {
  if (!converterAmount.value) return '0.0000'
  return Number((convertedPreview.value / Number(converterAmount.value || 1)).toFixed(4)).toFixed(4)
})

const providerUrl = 'https://open.er-api.com/v6/latest'

const rateColumns = computed(() => [
  { title: '货币', key: 'currency' },
  {
    title: settingsForm.baseCurrency.toUpperCase(),
    key: 'rate',
    render: (row: { rate: number }) => row.rate.toFixed(4)
  }
])

function formatTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}
</script>

<style scoped>
.settings-card {
  height: 100%;
}

.switch-label {
  margin-left: 10px;
  color: #475569;
}

.switch-row {
  padding-top: 6px;
}

.switch-inline-label {
  color: #475569;
}

.switch-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
}

.switch-group--single {
  min-height: 34px;
}

.switch-group__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.label-with-tip__icon {
  color: #94a3b8;
  font-size: 15px;
  cursor: help;
}

.tag-budget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.tag-budget-item {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.tag-budget-item__name {
  margin-bottom: 8px;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.provider-link {
  display: inline-block;
  max-width: 100%;
  color: #2563eb;
  word-break: break-all;
}

.converter-main {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.converter-sub {
  margin-top: 6px;
  color: #64748b;
}

.channel-card {
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  overflow: hidden;
}

.channel-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 700;
  color: #0f172a;
}

.webhook-advanced,
.ai-advanced {
  margin-bottom: 12px;
}

:deep(.n-grid-item),
:deep(.n-form-item),
:deep(.n-form-item-blank),
:deep(.n-input),
:deep(.n-input-number),
:deep(.n-base-selection) {
  min-width: 0;
  max-width: 100%;
}
</style>
