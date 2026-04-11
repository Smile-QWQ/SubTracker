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
                <n-form-item label="默认提醒天数">
                  <n-input-number v-model:value="settingsForm.defaultNotifyDays" :min="0" :max="365" style="width: 100%" />
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

            <n-form-item>
              <n-switch v-model:value="settingsForm.enableCategoryBudgets" />
              <span class="switch-label">启用分类月预算</span>
            </n-form-item>

            <div v-if="settingsForm.enableCategoryBudgets" class="category-budget-grid">
              <div v-for="category in categories" :key="category.id" class="category-budget-item">
                <div class="category-budget-item__name">{{ category.name }}</div>
                <n-input-number
                  v-model:value="settingsForm.categoryBudgets[category.id]"
                  :min="0"
                  :precision="2"
                  placeholder="未设置"
                  style="width: 100%"
                />
              </div>
            </div>

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
                  <span>Webhook</span>
                  <n-switch v-model:value="webhookForm.enabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item label="URL">
                    <n-input v-model:value="webhookForm.url" placeholder="https://example.com/hook" />
                  </n-form-item>
                  <n-form-item label="Secret">
                    <n-input v-model:value="webhookForm.secret" type="password" show-password-on="click" />
                  </n-form-item>
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
                <n-form-item label="Provider 名称">
                  <n-input v-model:value="settingsForm.aiConfig.providerName" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="Model">
                  <n-input v-model:value="settingsForm.aiConfig.model" />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-form-item label="API Base URL">
              <n-input v-model:value="settingsForm.aiConfig.baseUrl" placeholder="https://api.deepseek.com" />
            </n-form-item>
            <n-form-item label="API Key">
              <n-input v-model:value="settingsForm.aiConfig.apiKey" type="password" show-password-on="click" />
            </n-form-item>
            <n-form-item label="请求超时（毫秒）">
              <n-input-number v-model:value="settingsForm.aiConfig.timeoutMs" :min="5000" :max="120000" style="width: 100%" />
            </n-form-item>
            <n-form-item label="自定义提示词">
              <n-input
                v-model:value="settingsForm.aiConfig.promptTemplate"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 8 }"
                placeholder="留空则使用系统默认提示词"
              />
            </n-form-item>
            <n-space>
              <n-button @click="saveAiSettings">保存</n-button>
              <n-button type="primary" @click="testAiSettings">测试</n-button>
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
    </n-grid>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { computed, onMounted, reactive, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import {
  NAlert,
  NButton,
  NCard,
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
  useMessage
} from 'naive-ui'
import { RefreshOutline, SaveOutline, SettingsOutline } from '@vicons/ionicons5'
import { api } from '@/composables/api'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { buildCurrencyOptions } from '@/utils/currency'
import type { Category, ChangeCredentialsPayload, ExchangeRateSnapshot, NotificationWebhookSettings, Settings } from '@/types/api'

const message = useMessage()
const authStore = useAuthStore()
const { width } = useWindowSize()
const settingsOutline = SettingsOutline

const settingsForm = reactive<Settings>({
  baseCurrency: 'CNY',
  defaultNotifyDays: 3,
  monthlyBudgetBase: null,
  yearlyBudgetBase: null,
  enableCategoryBudgets: false,
  categoryBudgets: {},
  emailNotificationsEnabled: false,
  pushplusNotificationsEnabled: false,
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
  aiConfig: {
    enabled: false,
    providerName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat',
    timeoutMs: 30000,
    promptTemplate: ''
  }
})

const credentialsForm = reactive<ChangeCredentialsPayload>({
  oldUsername: '',
  oldPassword: '',
  newUsername: '',
  newPassword: ''
})

const webhookForm = reactive<NotificationWebhookSettings>({
  id: '',
  enabled: false,
  url: '',
  secret: ''
})

const snapshot = ref<ExchangeRateSnapshot | null>(null)
const categories = ref<Category[]>([])
const sourceCurrency = ref('USD')
const targetCurrency = ref('CNY')
const converterAmount = ref(1)

const isMobile = computed(() => width.value < 960)
const formCols = computed(() => (width.value < 640 ? 1 : 2))
const gridCols = computed(() => (isMobile.value ? 1 : 2))
const notificationGridCols = computed(() => (isMobile.value ? 1 : 3))
const gridSpanFull = computed(() => (isMobile.value ? 1 : 2))
const watchedCurrencies = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD']

onMounted(async () => {
  await Promise.all([loadSettings(), loadSnapshot(), loadCategories(), loadWebhook()])
})

async function loadSettings() {
  const settings = await api.getSettings()
  Object.assign(settingsForm, settings)
  credentialsForm.oldUsername = authStore.username
  credentialsForm.newUsername = authStore.username
  targetCurrency.value = settings.baseCurrency
}

async function loadSnapshot() {
  snapshot.value = await api.getExchangeRateSnapshot()
}

async function loadCategories() {
  categories.value = await api.getCategories()
}

async function loadWebhook() {
  const current = await api.getNotificationWebhook()
  Object.assign(webhookForm, current)
}

async function saveBasicSettings() {
  await api.updateSettings({
    baseCurrency: settingsForm.baseCurrency.toUpperCase(),
    defaultNotifyDays: settingsForm.defaultNotifyDays,
    monthlyBudgetBase: settingsForm.monthlyBudgetBase,
    yearlyBudgetBase: settingsForm.yearlyBudgetBase,
    enableCategoryBudgets: settingsForm.enableCategoryBudgets,
    categoryBudgets: settingsForm.categoryBudgets
  })
  message.success('基础设置已保存')
  targetCurrency.value = settingsForm.baseCurrency.toUpperCase()
  await loadSnapshot()
}

async function saveEmailSettings() {
  await api.updateSettings({
    emailNotificationsEnabled: settingsForm.emailNotificationsEnabled,
    emailConfig: settingsForm.emailConfig
  })
  message.success('邮箱通知已保存')
}

async function savePushplusSettings() {
  await api.updateSettings({
    pushplusNotificationsEnabled: settingsForm.pushplusNotificationsEnabled,
    pushplusConfig: settingsForm.pushplusConfig
  })
  message.success('PushPlus 已保存')
}

async function saveAiSettings() {
  await api.updateSettings({ aiConfig: settingsForm.aiConfig })
  message.success('AI 识别设置已保存')
}

async function testAiSettings() {
  try {
    const result = await api.testAiConfigurationWithPayload(settingsForm.aiConfig)
    message.success(`AI 测试成功：${result.providerName} / ${result.model}`)
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'AI 测试失败')
  }
}

async function refreshRates() {
  snapshot.value = await api.refreshExchangeRates()
  message.success('汇率已刷新')
}

async function submitCredentialsChange() {
  const result = await api.changeCredentials(credentialsForm)
  authStore.setSession(result.token, result.user.username)
  credentialsForm.oldPassword = ''
  credentialsForm.newPassword = ''
  credentialsForm.oldUsername = result.user.username
  credentialsForm.newUsername = result.user.username
  message.success('登录凭据已更新')
}

async function testEmail() {
  try {
    await api.testEmailNotificationWithPayload(settingsForm.emailConfig)
    message.success('测试邮件已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '邮箱测试失败')
  }
}

async function testPushplus() {
  try {
    await api.testPushplusNotificationWithPayload(settingsForm.pushplusConfig)
    message.success('PushPlus 测试消息已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'PushPlus 测试失败')
  }
}

async function saveWebhook() {
  const saved = await api.updateNotificationWebhook({
    url: webhookForm.url.trim(),
    secret: webhookForm.secret.trim(),
    enabled: webhookForm.enabled
  })
  Object.assign(webhookForm, saved)
  message.success('Webhook 已保存')
}

async function testWebhook() {
  try {
    await api.testWebhookNotificationWithPayload({
      url: webhookForm.url,
      secret: webhookForm.secret,
      enabled: webhookForm.enabled
    })
    message.success('Webhook 测试已发送')
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

.category-budget-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.category-budget-item {
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.category-budget-item__name {
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
