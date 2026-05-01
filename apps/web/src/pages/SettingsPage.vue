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
                <n-form-item label="业务时区">
                  <n-select v-model:value="settingsForm.timezone" :options="timeZoneOptions" filterable />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item label="记住登录天数">
                  <n-input-number v-model:value="settingsForm.rememberSessionDays" :min="1" :max="365" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item label="当前时区示例">
                  <n-input :value="formatTime(new Date().toISOString())" readonly />
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
                      <span class="switch-label">启用标签月预算</span>
                      <n-switch v-model:value="settingsForm.enableTagBudgets" />
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
              <a :href="snapshot.providerUrl" target="_blank" rel="noreferrer" class="provider-link">{{ snapshot.providerUrl }}</a>
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
            <div class="converter-currency-row">
              <div class="converter-currency-row__select">
                <n-select v-model:value="sourceCurrency" :options="allCurrencyOptions" filterable placeholder="源货币" />
              </div>
              <n-button quaternary circle class="converter-swap-button" title="交换源货币和目标货币" @click="swapConverterCurrencies">
                <template #icon>
                  <n-icon><swap-horizontal-outline /></n-icon>
                </template>
              </n-button>
              <div class="converter-currency-row__select">
                <n-select v-model:value="targetCurrency" :options="allCurrencyOptions" filterable placeholder="目标货币" />
              </div>
            </div>
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
            统一管理邮箱、PushPlus、Telegram、Server 酱、Gotify 与 Webhook。每个渠道都可以单独保存并单独测试。
          </n-alert>

          <n-grid :cols="notificationGridCols" :x-gap="12" :y-gap="12">
            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>邮箱通知</span>
                  <n-switch v-model:value="settingsForm.emailNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-grid :cols="formCols" :x-gap="8">
                    <n-grid-item>
                      <n-form-item label="通知提供商">
                        <n-select v-model:value="settingsForm.emailProvider" :options="emailProviderOptions" />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item label="配置详情">
                        <n-button quaternary class="email-details-toggle" @click="emailDetailsExpanded = !emailDetailsExpanded">
                          <template #icon>
                            <n-icon>
                              <component :is="emailDetailsExpanded ? chevronUpOutline : chevronDownOutline" />
                            </n-icon>
                          </template>
                          {{ emailDetailsExpanded ? '收起' : '展开' }}
                        </n-button>
                      </n-form-item>
                    </n-grid-item>
                  </n-grid>

                  <div v-if="!emailDetailsExpanded" class="card-muted email-summary">
                    {{ emailSummaryText }}
                  </div>

                  <n-collapse-transition :show="emailDetailsExpanded">
                    <template v-if="settingsForm.emailProvider === 'smtp'">
                      <n-form-item label="SMTP Host">
                        <n-input v-model:value="settingsForm.smtpConfig.host" />
                      </n-form-item>
                      <n-grid :cols="formCols" :x-gap="8">
                        <n-grid-item>
                          <n-form-item label="端口">
                            <n-input-number v-model:value="settingsForm.smtpConfig.port" :min="1" :max="65535" style="width: 100%" />
                          </n-form-item>
                        </n-grid-item>
                        <n-grid-item>
                          <n-form-item label="Secure">
                            <n-switch v-model:value="settingsForm.smtpConfig.secure" />
                          </n-form-item>
                        </n-grid-item>
                      </n-grid>
                      <n-form-item label="用户名">
                        <n-input v-model:value="settingsForm.smtpConfig.username" />
                      </n-form-item>
                      <n-form-item label="密码">
                        <n-input v-model:value="settingsForm.smtpConfig.password" type="password" show-password-on="click" />
                      </n-form-item>
                      <n-form-item label="发件人">
                        <n-input v-model:value="settingsForm.smtpConfig.from" placeholder="SubTracker <noreply@example.com>" />
                      </n-form-item>
                      <n-form-item label="收件人">
                        <n-input v-model:value="settingsForm.smtpConfig.to" placeholder="多个邮箱请用英文逗号分隔" />
                      </n-form-item>
                    </template>
                    <template v-else>
                      <n-form-item label="Resend API URL">
                        <n-input v-model:value="settingsForm.resendConfig.apiBaseUrl" />
                      </n-form-item>
                      <n-form-item label="Resend API Key">
                        <n-input v-model:value="settingsForm.resendConfig.apiKey" type="password" show-password-on="click" placeholder="re_xxxxx" />
                      </n-form-item>
                      <n-form-item label="发件人">
                        <n-input v-model:value="settingsForm.resendConfig.from" placeholder="SubTracker <noreply@example.com>" />
                      </n-form-item>
                      <n-form-item label="收件人">
                        <n-input v-model:value="settingsForm.resendConfig.to" placeholder="多个邮箱请用英文逗号分隔" />
                      </n-form-item>
                    </template>
                  </n-collapse-transition>

                  <n-space>
                    <n-button :loading="savingEmailSettings" :disabled="savingEmailSettings" @click="saveEmailSettings">保存</n-button>
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
                    <n-button :loading="savingPushplusSettings" :disabled="savingPushplusSettings" @click="savePushplusSettings">保存</n-button>
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
                    <n-button :loading="savingTelegramSettings" :disabled="savingTelegramSettings" @click="saveTelegramSettings">保存</n-button>
                    <n-button type="primary" @click="testTelegram">测试</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>Server 酱</span>
                  <n-switch v-model:value="settingsForm.serverchanNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item label="SendKey">
                    <n-input v-model:value="settingsForm.serverchanConfig.sendkey" />
                  </n-form-item>
                  <n-space>
                    <n-button :loading="savingServerchanSettings" :disabled="savingServerchanSettings" @click="saveServerchanSettings">保存</n-button>
                    <n-button type="primary" @click="testServerchan">测试</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>Gotify</span>
                  <n-switch v-model:value="settingsForm.gotifyNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item label="URL">
                    <n-input v-model:value="settingsForm.gotifyConfig.url" placeholder="https://gotify.example.com" />
                  </n-form-item>
                  <n-form-item label="Token">
                    <n-input v-model:value="settingsForm.gotifyConfig.token" type="password" show-password-on="click" />
                  </n-form-item>
                  <div class="compact-switch-row">
                    <n-switch v-model:value="settingsForm.gotifyConfig.ignoreSsl" />
                    <span class="switch-inline-label">忽略 SSL 校验</span>
                  </div>
                  <n-space>
                    <n-button :loading="savingGotifySettings" :disabled="savingGotifySettings" @click="saveGotifySettings">保存</n-button>
                    <n-button type="primary" @click="testGotify">测试</n-button>
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
                    <n-button :loading="savingWebhookSettings" :disabled="savingWebhookSettings" @click="saveWebhook">保存</n-button>
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
              <n-button :loading="savingAiSettings" :disabled="savingAiSettings" @click="saveAiSettings">保存</n-button>
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
            <n-button type="primary" :loading="savingCredentials" :disabled="savingCredentials" @click="submitCredentialsChange">修改</n-button>
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

    <wallos-import-modal
      :show="showWallosImportModal"
      :default-notify-days="settingsForm.defaultNotifyDays"
      :base-currency="settingsForm.baseCurrency"
      :app-timezone="settingsForm.timezone"
      @close="showWallosImportModal = false"
      @imported="handleWallosImported"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import {
  DEFAULT_ADVANCE_REMINDER_RULES,
  DEFAULT_AI_CONFIG,
  DEFAULT_AI_SUBSCRIPTION_PROMPT,
  DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
  DEFAULT_OVERDUE_REMINDER_RULES,
  DEFAULT_RESEND_API_URL
} from '@subtracker/shared'
import {
  NAlert,
  NButton,
  NCard,
  NCollapse,
  NCollapseItem,
  NCollapseTransition,
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
import {
  ChevronDownOutline,
  ChevronUpOutline,
  HelpCircleOutline,
  RefreshOutline,
  SaveOutline,
  SettingsOutline,
  SwapHorizontalOutline
} from '@vicons/ionicons5'
import { api } from '@/composables/api'
import { EXCHANGE_RATE_SNAPSHOT_QUERY_KEY, useExchangeRateSnapshotQuery } from '@/composables/exchange-rate-query'
import { NOTIFICATION_WEBHOOK_QUERY_KEY, useNotificationWebhookQuery } from '@/composables/notification-webhook-query'
import { SETTINGS_QUERY_KEY, useSettingsQuery } from '@/composables/settings-query'
import PageHeader from '@/components/PageHeader.vue'
import WallosImportModal from '@/components/WallosImportModal.vue'
import { useAuthStore } from '@/stores/auth'
import { isRememberedSession } from '@/utils/auth-storage'
import { buildCurrencyOptions } from '@/utils/currency'
import { swapCurrencyPair } from '@/utils/currency-converter'
import { cloneSettingsForForm } from '@/utils/settings-form'
import { buildTimeZoneOptions, formatDateTimeInTimezone, normalizeAppTimezone } from '@/utils/timezone'
import type { AiProviderPreset, ChangeCredentialsPayload, ExchangeRateSnapshot, NotificationWebhookSettings, Settings } from '@/types/api'

const message = useMessage()
const authStore = useAuthStore()
const queryClient = useQueryClient()
const { data: settingsQueryData } = useSettingsQuery()
const { data: snapshotQueryData } = useExchangeRateSnapshotQuery()
const { data: webhookQueryData } = useNotificationWebhookQuery()
const { width } = useWindowSize()
const chevronDownOutline = ChevronDownOutline
const chevronUpOutline = ChevronUpOutline
const swapHorizontalOutline = SwapHorizontalOutline
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
  timezone: 'Asia/Shanghai',
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
  emailProvider: 'smtp',
  pushplusNotificationsEnabled: false,
  telegramNotificationsEnabled: false,
  serverchanNotificationsEnabled: false,
  gotifyNotificationsEnabled: false,
  smtpConfig: {
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    from: '',
    to: ''
  },
  resendConfig: {
    apiBaseUrl: DEFAULT_RESEND_API_URL,
    apiKey: '',
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
  serverchanConfig: {
    sendkey: ''
  },
  gotifyConfig: {
    url: '',
    token: '',
    ignoreSsl: false
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
const savingBasicSettings = ref(false)
const savingEmailSettings = ref(false)
const savingPushplusSettings = ref(false)
const savingTelegramSettings = ref(false)
const savingServerchanSettings = ref(false)
const savingGotifySettings = ref(false)
const savingWebhookSettings = ref(false)
const savingAiSettings = ref(false)
const savingCredentials = ref(false)
const sourceCurrency = ref('USD')
const targetCurrency = ref('CNY')
const converterAmount = ref(1)
const showWallosImportModal = ref(false)
const emailDetailsExpanded = ref(false)
const isMobile = computed(() => width.value < 960)
const formCols = computed(() => (width.value < 640 ? 1 : 2))
const gridCols = computed(() => (isMobile.value ? 1 : 2))
const notificationGridCols = computed(() => {
  if (width.value < 640) return 1
  if (width.value < 1200) return 2
  return 3
})
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
const emailProviderOptions = [
  { label: 'SMTP', value: 'smtp' },
  { label: 'Resend', value: 'resend' }
] satisfies Array<{ label: string; value: 'smtp' | 'resend' }>
const emailSummaryText = computed(() => {
  if (settingsForm.emailProvider === 'resend') {
    const to = settingsForm.resendConfig.to.trim() || '未填写收件人'
    return `Resend · 收件人：${to}`
  }

  const host = settingsForm.smtpConfig.host.trim() || '未填写 SMTP Host'
  const to = settingsForm.smtpConfig.to.trim() || '未填写收件人'
  return `Host：${host} · 收件人：${to}`
})
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

  const missing =
    settingsForm.emailProvider === 'resend'
      ? getMissingRequiredFields([
          ['Resend API URL', settingsForm.resendConfig.apiBaseUrl],
          ['Resend API Key', settingsForm.resendConfig.apiKey],
          ['发件人', settingsForm.resendConfig.from],
          ['收件人', settingsForm.resendConfig.to]
        ])
      : getMissingRequiredFields([
          ['SMTP Host', settingsForm.smtpConfig.host],
          ['端口', settingsForm.smtpConfig.port],
          ['用户名', settingsForm.smtpConfig.username],
          ['密码', settingsForm.smtpConfig.password],
          ['发件人', settingsForm.smtpConfig.from],
          ['收件人', settingsForm.smtpConfig.to]
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

function validateServerchanSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.serverchanNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([['SendKey', settingsForm.serverchanConfig.sendkey]])
  if (!missing.length) return true
  message.error(`Server 酱缺少必填项：${missing.join('、')}`)
  return false
}

function validateGotifySettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.gotifyNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    ['URL', settingsForm.gotifyConfig.url],
    ['Token', settingsForm.gotifyConfig.token]
  ])
  if (!missing.length) return true
  message.error(`Gotify 缺少必填项：${missing.join('、')}`)
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

watch(
  settingsQueryData,
  (settings) => {
    if (!settings) return
    Object.assign(settingsForm, cloneSettingsForForm(settings))
    aiPromptInput.value = settings.aiConfig.promptTemplate.trim() || DEFAULT_AI_SUBSCRIPTION_PROMPT
    credentialsForm.oldUsername = authStore.username
    credentialsForm.newUsername = authStore.username
    targetCurrency.value = settings.baseCurrency
  },
  { immediate: true }
)

watch(
  snapshotQueryData,
  (value) => {
    snapshot.value = value ?? null
  },
  { immediate: true }
)

watch(
  webhookQueryData,
  (value) => {
    if (!value) return
    Object.assign(webhookForm, value)
  },
  { immediate: true }
)

function applySavedSettings(result: Settings) {
  Object.assign(settingsForm, cloneSettingsForForm(result))
  queryClient.setQueryData(SETTINGS_QUERY_KEY, result)
}

async function saveBasicSettings() {
  if (savingBasicSettings.value) return
  savingBasicSettings.value = true
  try {
    const result = await api.updateSettings({
      baseCurrency: settingsForm.baseCurrency.toUpperCase(),
      timezone: normalizeAppTimezone(settingsForm.timezone),
      defaultAdvanceReminderRules: settingsForm.defaultAdvanceReminderRules,
      rememberSessionDays: settingsForm.rememberSessionDays,
      mergeMultiSubscriptionNotifications: settingsForm.mergeMultiSubscriptionNotifications,
      monthlyBudgetBase: settingsForm.monthlyBudgetBase,
      yearlyBudgetBase: settingsForm.yearlyBudgetBase,
      enableTagBudgets: settingsForm.enableTagBudgets,
      defaultOverdueReminderRules: settingsForm.defaultOverdueReminderRules,
      tagBudgets: settingsForm.tagBudgets
    })
    applySavedSettings(result)
    message.success('基础设置已保存')
    targetCurrency.value = settingsForm.baseCurrency.toUpperCase()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['statistics-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['statistics-budgets'] })
    ])
    await queryClient.invalidateQueries({ queryKey: EXCHANGE_RATE_SNAPSHOT_QUERY_KEY })
  } catch (error) {
    message.error(error instanceof Error ? error.message : '基础设置保存失败')
  } finally {
    savingBasicSettings.value = false
  }
}

async function saveEmailSettings() {
  if (savingEmailSettings.value) return
  if (!validateEmailSettings('save')) return
  savingEmailSettings.value = true
  try {
    const result = await api.updateSettings({
      emailNotificationsEnabled: settingsForm.emailNotificationsEnabled,
      emailProvider: settingsForm.emailProvider,
      smtpConfig: settingsForm.smtpConfig,
      resendConfig: settingsForm.resendConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.emailNotificationsEnabled ? '邮箱通知配置已保存' : '邮箱通知已关闭')
  } finally {
    savingEmailSettings.value = false
  }
}

async function savePushplusSettings() {
  if (savingPushplusSettings.value) return
  if (!validatePushplusSettings('save')) return
  savingPushplusSettings.value = true
  try {
    const result = await api.updateSettings({
      pushplusNotificationsEnabled: settingsForm.pushplusNotificationsEnabled,
      pushplusConfig: settingsForm.pushplusConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.pushplusNotificationsEnabled ? 'PushPlus 配置已保存' : 'PushPlus 已关闭')
  } finally {
    savingPushplusSettings.value = false
  }
}

async function saveTelegramSettings() {
  if (savingTelegramSettings.value) return
  if (!validateTelegramSettings('save')) return
  savingTelegramSettings.value = true
  try {
    const result = await api.updateSettings({
      telegramNotificationsEnabled: settingsForm.telegramNotificationsEnabled,
      telegramConfig: settingsForm.telegramConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.telegramNotificationsEnabled ? 'Telegram 配置已保存' : 'Telegram 已关闭')
  } finally {
    savingTelegramSettings.value = false
  }
}

async function saveServerchanSettings() {
  if (savingServerchanSettings.value) return
  if (!validateServerchanSettings('save')) return
  savingServerchanSettings.value = true
  try {
    const result = await api.updateSettings({
      serverchanNotificationsEnabled: settingsForm.serverchanNotificationsEnabled,
      serverchanConfig: settingsForm.serverchanConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.serverchanNotificationsEnabled ? 'Server 酱配置已保存' : 'Server 酱已关闭')
  } finally {
    savingServerchanSettings.value = false
  }
}

async function saveGotifySettings() {
  if (savingGotifySettings.value) return
  if (!validateGotifySettings('save')) return
  savingGotifySettings.value = true
  try {
    const result = await api.updateSettings({
      gotifyNotificationsEnabled: settingsForm.gotifyNotificationsEnabled,
      gotifyConfig: settingsForm.gotifyConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.gotifyNotificationsEnabled ? 'Gotify 配置已保存' : 'Gotify 已关闭')
  } finally {
    savingGotifySettings.value = false
  }
}

async function saveAiSettings() {
  if (savingAiSettings.value) return
  if (!validateAiSettings('save')) return
  const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
  settingsForm.aiConfig.promptTemplate = promptTemplate
  aiPromptInput.value = promptTemplate || DEFAULT_AI_SUBSCRIPTION_PROMPT
  savingAiSettings.value = true
  try {
    const result = await api.updateSettings({
      aiConfig: {
        ...settingsForm.aiConfig,
        capabilities: {
          ...settingsForm.aiConfig.capabilities
        },
        promptTemplate
      }
    })
    applySavedSettings(result)
    aiPromptInput.value = result.aiConfig.promptTemplate.trim() || DEFAULT_AI_SUBSCRIPTION_PROMPT
    message.success(settingsForm.aiConfig.enabled ? 'AI 识别配置已保存' : 'AI 识别已关闭')
  } finally {
    savingAiSettings.value = false
  }
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
  queryClient.setQueryData(EXCHANGE_RATE_SNAPSHOT_QUERY_KEY, snapshot.value)
  message.success('汇率已刷新')
}

function swapConverterCurrencies() {
  const swapped = swapCurrencyPair({
    sourceCurrency: sourceCurrency.value,
    targetCurrency: targetCurrency.value
  })
  sourceCurrency.value = swapped.sourceCurrency
  targetCurrency.value = swapped.targetCurrency
}

async function submitCredentialsChange() {
  if (savingCredentials.value) return
  savingCredentials.value = true
  try {
    const result = await api.changeCredentials(credentialsForm)
    authStore.setSession(result.token, result.user.username, isRememberedSession(), result.user.mustChangePassword)
    credentialsForm.oldPassword = ''
    credentialsForm.newPassword = ''
    credentialsForm.oldUsername = result.user.username
    credentialsForm.newUsername = result.user.username
    message.success('登录凭据已更新')
  } finally {
    savingCredentials.value = false
  }
}

async function testEmail() {
  if (!validateEmailSettings('test')) return
  try {
    await api.testEmailNotificationWithPayload({
      emailProvider: settingsForm.emailProvider,
      smtpConfig: settingsForm.smtpConfig,
      resendConfig: settingsForm.resendConfig
    })
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

async function testServerchan() {
  if (!validateServerchanSettings('test')) return
  try {
    await api.testServerchanNotificationWithPayload(settingsForm.serverchanConfig)
    message.success('Server 酱测试消息已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Server 酱测试失败')
  }
}

async function testGotify() {
  if (!validateGotifySettings('test')) return
  try {
    await api.testGotifyNotificationWithPayload(settingsForm.gotifyConfig)
    message.success('Gotify 测试消息已发送')
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Gotify 测试失败')
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
  queryClient.removeQueries({ queryKey: ['subscriptions'] })
  queryClient.removeQueries({ queryKey: ['tags'] })
  queryClient.removeQueries({ queryKey: ['statistics-overview'] })
  queryClient.removeQueries({ queryKey: ['statistics-budgets'] })
  queryClient.removeQueries({ queryKey: ['calendar-events'] })
  showWallosImportModal.value = false
  message.success('Wallos 数据已导入')
}

async function saveWebhook() {
  if (savingWebhookSettings.value) return
  if (!validateWebhookSettings('save')) return
  savingWebhookSettings.value = true
  try {
    const saved = await api.updateNotificationWebhook({
      url: webhookForm.url.trim(),
      enabled: webhookForm.enabled,
      requestMethod: webhookForm.requestMethod,
      headers: webhookForm.headers.trim() || 'Content-Type: application/json',
      payloadTemplate: webhookForm.payloadTemplate.trim() || DEFAULT_NOTIFICATION_WEBHOOK_PAYLOAD_TEMPLATE,
      ignoreSsl: webhookForm.ignoreSsl
    })
    Object.assign(webhookForm, saved)
    queryClient.setQueryData(NOTIFICATION_WEBHOOK_QUERY_KEY, saved)
    message.success(webhookForm.enabled ? 'Webhook 配置已保存' : 'Webhook 已关闭')
  } finally {
    savingWebhookSettings.value = false
  }
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
const timeZoneOptions = computed(() => buildTimeZoneOptions())

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

const rateColumns = computed(() => [
  { title: '货币', key: 'currency' },
  {
    title: settingsForm.baseCurrency.toUpperCase(),
    key: 'rate',
    render: (row: { rate: number }) => row.rate.toFixed(4)
  }
])

function formatTime(value: string) {
  return formatDateTimeInTimezone(value, settingsForm.timezone)
}

</script>

<style scoped>
.settings-card {
  height: 100%;
}

.switch-label {
  margin-left: 10px;
  color: var(--app-text-secondary);
}

.switch-row {
  padding-top: 6px;
}

.switch-inline-label {
  color: var(--app-text-secondary);
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
  color: var(--app-text-muted);
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
  border: 1px solid var(--app-border-soft);
  border-radius: 12px;
  background: var(--app-surface-alt);
}

.tag-budget-item__name {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--app-text-primary);
  font-weight: 600;
}

.provider-link {
  display: inline-block;
  max-width: 100%;
  color: #2563eb;
  word-break: break-all;
}

.converter-currency-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.converter-currency-row__select {
  min-width: 0;
}

.converter-swap-button {
  color: var(--app-text-secondary);
}

.converter-main {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.converter-sub {
  margin-top: 6px;
  color: var(--app-text-secondary);
}

.channel-card {
  width: 100%;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--app-border-soft);
  border-radius: 14px;
  background: var(--app-surface-alt);
  overflow: hidden;
}

.channel-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.email-details-toggle {
  width: 100%;
  justify-content: center;
}

.compact-switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 34px;
  margin-top: -2px;
  margin-bottom: 12px;
}

.email-summary {
  margin: 2px 0 14px;
  line-height: 1.5;
}

.webhook-advanced,
.ai-advanced {
  margin-bottom: 12px;
}

@media (max-width: 640px) {
  .converter-currency-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .converter-swap-button {
    justify-self: center;
  }
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
