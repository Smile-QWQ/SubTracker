<template>
  <div>
    <page-header
      :title="t('settings.page.title')"
      :subtitle="t('settings.page.subtitle')"
      :icon="settingsOutline"
      icon-background="linear-gradient(135deg, #64748b 0%, #334155 100%)"
    />

    <n-grid :cols="gridCols" :x-gap="12" :y-gap="12">
      <n-grid-item>
        <n-card :title="t('settings.sections.basic')" class="settings-card">
          <n-form :model="settingsForm" label-placement="top">
            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item :label="t('settings.labels.baseCurrency')">
                  <n-select v-model:value="settingsForm.baseCurrency" :options="allCurrencyOptions" filterable />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item :label="t('settings.labels.timezone')">
                  <n-select v-model:value="settingsForm.timezone" :options="timeZoneOptions" filterable />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item :label="t('settings.labels.rememberSessionDays')">
                  <n-input-number v-model:value="settingsForm.rememberSessionDays" :min="1" :max="365" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item :label="t('settings.labels.timezoneSample')">
                  <n-input :value="formatTime(new Date().toISOString())" readonly />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item :label="t('settings.labels.monthlyBudget')">
                  <n-input-number v-model:value="settingsForm.monthlyBudgetBase" :min="0" :precision="2" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item :label="t('settings.labels.yearlyBudget')">
                  <n-input-number v-model:value="settingsForm.yearlyBudgetBase" :min="0" :precision="2" style="width: 100%" />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <n-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      <span>{{ t('settings.labels.advanceReminderRules') }}</span>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-icon class="label-with-tip__icon" :component="helpCircleOutline" />
                        </template>
                        <span>{{ t('settings.helps.advanceReminderRules') }}</span>
                      </n-tooltip>
                    </span>
                  </template>
                  <n-input
                    v-model:value="settingsForm.defaultAdvanceReminderRules"
                    :placeholder="t('settings.placeholders.advanceReminderRules')"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item>
                  <template #label>
                    <span class="label-with-tip">
                      <span>{{ t('settings.labels.overdueReminderRules') }}</span>
                      <n-tooltip trigger="hover">
                        <template #trigger>
                          <n-icon class="label-with-tip__icon" :component="helpCircleOutline" />
                        </template>
                        <span>{{ t('settings.helps.overdueReminderRules') }}</span>
                      </n-tooltip>
                    </span>
                  </template>
                  <n-input
                    v-model:value="settingsForm.defaultOverdueReminderRules"
                    :placeholder="t('settings.placeholders.overdueReminderRules')"
                  />
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <reminder-rules-preview
              ref="settingsReminderPreviewRef"
              class="settings-reminder-preview"
              :advance-value="settingsForm.defaultAdvanceReminderRules"
              :overdue-value="settingsForm.defaultOverdueReminderRules"
              :show-button="false"
              @visibility-change="settingsReminderPreviewVisible = $event"
            />

            <n-grid :cols="formCols" :x-gap="12">
              <n-grid-item>
                <div class="switch-row">
                    <div class="switch-group">
                      <div class="switch-group__item">
                      <span class="switch-inline-label">{{ t('settings.labels.mergeNotifications') }}</span>
                      <n-switch v-model:value="settingsForm.mergeMultiSubscriptionNotifications" />
                    </div>
                  </div>
                </div>
              </n-grid-item>
              <n-grid-item>
                <div class="switch-row">
                  <div class="switch-group switch-group--single">
                    <div class="switch-group__item">
                      <span class="switch-label">{{ t('settings.labels.enableTagBudgets') }}</span>
                      <n-switch v-model:value="settingsForm.enableTagBudgets" />
                    </div>
                  </div>
                </div>
              </n-grid-item>
            </n-grid>

            <n-space class="settings-actions settings-actions--wrap" style="margin-top: 12px">
              <n-button type="primary" @click="saveBasicSettings">
                <template #icon>
                  <n-icon><save-outline /></n-icon>
                </template>
                {{ t('common.actions.save') }}
              </n-button>
              <n-button
                :type="settingsReminderPreviewVisible ? 'primary' : 'default'"
                :secondary="settingsReminderPreviewVisible"
                @click="previewSettingsReminderRules"
              >
                <template #icon>
                  <n-icon :component="eyeOutline" />
                </template>
                {{ settingsReminderPreviewVisible ? t('settings.buttons.collapseReminderPreview') : t('settings.buttons.previewReminderRules') }}
              </n-button>
            </n-space>
          </n-form>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card :title="t('settings.sections.exchangeSnapshot')" class="settings-card">
          <n-descriptions v-if="snapshot" :column="1" bordered>
            <n-descriptions-item :label="t('settings.labels.baseCurrency')">{{ snapshot.baseCurrency }}</n-descriptions-item>
            <n-descriptions-item :label="t('common.labels.provider')">{{ snapshot.provider }}</n-descriptions-item>
            <n-descriptions-item :label="t('settings.labels.providerUrl')">
              <a :href="snapshot.providerUrl" target="_blank" rel="noreferrer" class="provider-link">{{ snapshot.providerUrl }}</a>
            </n-descriptions-item>
            <n-descriptions-item :label="t('settings.labels.fetchedAt')">{{ formatTime(snapshot.fetchedAt) }}</n-descriptions-item>
            <n-descriptions-item :label="t('settings.labels.snapshotStatus')">
              <n-tag :type="snapshot.isStale ? 'warning' : 'success'">{{ snapshot.isStale ? t('common.status.stale') : t('common.status.fresh') }}</n-tag>
            </n-descriptions-item>
          </n-descriptions>

          <n-space class="settings-actions" style="margin-top: 12px">
            <n-button @click="refreshRates">
              <template #icon>
                <n-icon><refresh-outline /></n-icon>
              </template>
              {{ t('common.actions.refresh') }}
            </n-button>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card :title="t('settings.sections.currentRates')" class="settings-card">
          <template #header-extra>
            <n-space class="settings-header-tags" wrap>
              <n-tag type="success">{{ t('settings.summary.baseCurrencyTag', { currency: settingsForm.baseCurrency }) }}</n-tag>
              <n-tag type="info">{{ t('settings.summary.supportedCurrenciesTag', { count: supportedCurrencyCount }) }}</n-tag>
            </n-space>
          </template>
          <n-data-table :columns="rateColumns" :data="currentRates" :pagination="false" />
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card :title="t('settings.sections.converter')" class="settings-card">
          <n-space vertical style="width: 100%">
            <div class="converter-currency-row">
              <div class="converter-currency-row__select">
                <n-select v-model:value="sourceCurrency" :options="allCurrencyOptions" filterable :placeholder="t('settings.labels.sourceCurrency')" />
              </div>
              <n-button quaternary circle class="converter-swap-button" :title="t('settings.buttons.swapCurrencies')" @click="swapConverterCurrencies">
                <template #icon>
                  <n-icon><swap-horizontal-outline /></n-icon>
                </template>
              </n-button>
              <div class="converter-currency-row__select">
                <n-select v-model:value="targetCurrency" :options="allCurrencyOptions" filterable :placeholder="t('settings.labels.targetCurrency')" />
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
              <template v-else>{{ t('settings.summary.selectCurrenciesToConvert') }}</template>
            </n-card>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item :span="gridSpanFull">
        <n-card :title="t('settings.sections.notifications')" class="settings-card">
          <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
            {{ t('settings.helps.notificationSettings') }}
          </n-alert>

          <n-grid :cols="notificationGridCols" :x-gap="12" :y-gap="12">
            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.email') }}</span>
                  <n-switch v-model:value="settingsForm.emailNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-grid :cols="formCols" :x-gap="8">
                    <n-grid-item>
                      <n-form-item :label="t('settings.labels.notificationProvider')">
                        <n-select v-model:value="settingsForm.emailProvider" :options="emailProviderOptions" />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item :label="t('settings.labels.configurationDetails')">
                        <n-button quaternary class="email-details-toggle" @click="emailDetailsExpanded = !emailDetailsExpanded">
                          <template #icon>
                            <n-icon>
                              <component :is="emailDetailsExpanded ? chevronUpOutline : chevronDownOutline" />
                            </n-icon>
                          </template>
                          {{ emailDetailsExpanded ? t('common.actions.collapse') : t('common.actions.expand') }}
                        </n-button>
                      </n-form-item>
                    </n-grid-item>
                  </n-grid>

                  <div v-if="!emailDetailsExpanded" class="card-muted email-summary">
                    {{ emailSummaryText }}
                  </div>

                  <n-collapse-transition :show="emailDetailsExpanded">
                    <template v-if="settingsForm.emailProvider === 'smtp'">
                      <n-form-item :label="t('common.labels.host')">
                        <n-input v-model:value="settingsForm.smtpConfig.host" />
                      </n-form-item>
                      <n-grid :cols="formCols" :x-gap="8">
                        <n-grid-item>
                          <n-form-item :label="t('common.labels.port')">
                            <n-input-number v-model:value="settingsForm.smtpConfig.port" :min="1" :max="65535" style="width: 100%" />
                          </n-form-item>
                        </n-grid-item>
                        <n-grid-item>
                          <n-form-item :label="t('common.labels.secure')">
                            <n-switch v-model:value="settingsForm.smtpConfig.secure" />
                          </n-form-item>
                        </n-grid-item>
                      </n-grid>
                      <n-form-item :label="t('common.labels.username')">
                        <n-input v-model:value="settingsForm.smtpConfig.username" />
                      </n-form-item>
                      <n-form-item :label="t('common.labels.password')">
                        <n-input v-model:value="settingsForm.smtpConfig.password" type="password" show-password-on="click" />
                      </n-form-item>
                      <n-form-item :label="t('common.labels.from')">
                        <n-input
                          v-model:value="settingsForm.smtpConfig.from"
                          :placeholder="t('settings.placeholders.fromAddress', { at: '@' })"
                        />
                      </n-form-item>
                      <n-form-item :label="t('common.labels.to')">
                        <n-input v-model:value="settingsForm.smtpConfig.to" :placeholder="t('settings.placeholders.multiEmail')" />
                      </n-form-item>
                    </template>
                    <template v-else>
                      <n-form-item :label="t('common.labels.apiBaseUrl')">
                        <n-input v-model:value="settingsForm.resendConfig.apiBaseUrl" />
                      </n-form-item>
                      <n-form-item :label="t('common.labels.apiKey')">
                        <n-input v-model:value="settingsForm.resendConfig.apiKey" type="password" show-password-on="click" />
                      </n-form-item>
                      <n-form-item :label="t('common.labels.from')">
                        <n-input
                          v-model:value="settingsForm.resendConfig.from"
                          :placeholder="t('settings.placeholders.fromAddress', { at: '@' })"
                        />
                      </n-form-item>
                      <n-form-item :label="t('common.labels.to')">
                        <n-input v-model:value="settingsForm.resendConfig.to" :placeholder="t('settings.placeholders.multiEmail')" />
                      </n-form-item>
                    </template>
                  </n-collapse-transition>

                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingEmailSettings" :disabled="savingEmailSettings" @click="saveEmailSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testEmail">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.pushplus') }}</span>
                  <n-switch v-model:value="settingsForm.pushplusNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('common.labels.token')">
                    <n-input v-model:value="settingsForm.pushplusConfig.token" />
                  </n-form-item>
                  <n-form-item :label="t('common.labels.topic')">
                    <n-input v-model:value="settingsForm.pushplusConfig.topic" :placeholder="t('settings.placeholders.optional')" />
                  </n-form-item>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingPushplusSettings" :disabled="savingPushplusSettings" @click="savePushplusSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testPushplus">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                  <div class="channel-card__header">
                  <span>{{ t('settings.channels.telegram') }}</span>
                  <n-switch v-model:value="settingsForm.telegramNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('common.labels.botToken')">
                    <n-input v-model:value="settingsForm.telegramConfig.botToken" type="password" show-password-on="click" />
                  </n-form-item>
                  <n-form-item :label="t('common.labels.chatId')">
                    <n-input v-model:value="settingsForm.telegramConfig.chatId" :placeholder="t('settings.placeholders.chatIdExample')" />
                  </n-form-item>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingTelegramSettings" :disabled="savingTelegramSettings" @click="saveTelegramSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testTelegram">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.serverchan') }}</span>
                  <n-switch v-model:value="settingsForm.serverchanNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('common.labels.sendKey')">
                    <n-input v-model:value="settingsForm.serverchanConfig.sendkey" />
                  </n-form-item>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingServerchanSettings" :disabled="savingServerchanSettings" @click="saveServerchanSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testServerchan">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.gotify') }}</span>
                  <n-switch v-model:value="settingsForm.gotifyNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('common.labels.url')">
                    <n-input v-model:value="settingsForm.gotifyConfig.url" :placeholder="t('settings.placeholders.gotifyUrl')" />
                  </n-form-item>
                  <n-form-item :label="t('common.labels.token')">
                    <n-input v-model:value="settingsForm.gotifyConfig.token" type="password" show-password-on="click" />
                  </n-form-item>
                  <div class="compact-switch-row">
                    <n-switch v-model:value="settingsForm.gotifyConfig.ignoreSsl" />
                    <span class="switch-inline-label">{{ t('settings.labels.ignoreSsl') }}</span>
                  </div>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingGotifySettings" :disabled="savingGotifySettings" @click="saveGotifySettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testGotify">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.bark') }}</span>
                  <n-switch v-model:value="settingsForm.barkNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('settings.labels.barkServerUrl')">
                    <n-input v-model:value="settingsForm.barkConfig.serverUrl" :placeholder="t('settings.placeholders.barkServerUrl')" />
                  </n-form-item>
                  <n-form-item :label="t('common.labels.deviceKey')">
                    <n-input v-model:value="settingsForm.barkConfig.deviceKey" type="password" show-password-on="click" />
                  </n-form-item>
                  <div class="compact-switch-row">
                    <n-switch v-model:value="settingsForm.barkConfig.isArchive" />
                    <span class="switch-inline-label">{{ t('settings.labels.archiveNotification') }}</span>
                  </div>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingBarkSettings" :disabled="savingBarkSettings" @click="saveBarkSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testBark">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.notifyx') }}</span>
                  <n-switch v-model:value="settingsForm.notifyxNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('common.labels.apiKey')">
                    <n-input v-model:value="settingsForm.notifyxConfig.apiKey" type="password" show-password-on="click" />
                  </n-form-item>
                  <n-form-item :label="t('common.labels.team')">
                    <n-input v-model:value="settingsForm.notifyxConfig.team" :placeholder="t('settings.placeholders.optional')" />
                  </n-form-item>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingNotifyxSettings" :disabled="savingNotifyxSettings" @click="saveNotifyxSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testNotifyx">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.apprise') }}</span>
                  <n-switch v-model:value="settingsForm.appriseNotificationsEnabled" />
                </div>
                <n-form label-placement="top">
                  <n-form-item :label="t('settings.labels.appriseApiBaseUrl')">
                    <n-input v-model:value="settingsForm.appriseConfig.apiBaseUrl" :placeholder="t('settings.placeholders.appriseApiBaseUrl')" />
                  </n-form-item>
                  <n-form-item :label="t('settings.labels.appriseKey')">
                    <n-input v-model:value="settingsForm.appriseConfig.key" />
                  </n-form-item>
                  <div class="compact-switch-row">
                    <n-switch v-model:value="settingsForm.appriseConfig.ignoreSsl" />
                    <span class="switch-inline-label">{{ t('settings.labels.ignoreSsl') }}</span>
                  </div>
                  <n-space class="settings-header-tags" wrap>
                    <n-tag type="info">{{ t('settings.apprise.summary.targets', { count: appriseTargetCount }) }}</n-tag>
                    <n-tag type="success">{{ t('settings.apprise.summary.enabledTargets', { count: appriseEnabledTargetCount }) }}</n-tag>
                    <n-tag :type="appriseSyncTagType">{{ t('settings.apprise.summary.syncStatus', { status: appriseSyncStatusText }) }}</n-tag>
                  </n-space>
                  <div v-if="settingsForm.appriseConfig.lastSyncError" class="card-muted apprise-sync-error">
                    {{ settingsForm.appriseConfig.lastSyncError }}
                  </div>
                  <n-space class="channel-card__actions" wrap>
                    <n-button @click="showAppriseTargetsModal = true">{{ t('common.actions.manage') }}</n-button>
                    <n-button :loading="savingAppriseSettings" :disabled="savingAppriseSettings" @click="saveAppriseSettings">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testApprise">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>

            <n-grid-item>
              <div class="channel-card">
                <div class="channel-card__header">
                  <span>{{ t('settings.channels.webhook') }}</span>
                  <n-switch v-model:value="webhookForm.enabled" />
                </div>
                <n-form label-placement="top">
                  <n-grid :cols="formCols" :x-gap="8">
                    <n-grid-item :span="formCols === 1 ? 1 : 2">
                      <n-form-item :label="t('common.labels.url')">
                        <n-input v-model:value="webhookForm.url" :placeholder="t('settings.placeholders.webhookUrl')" />
                      </n-form-item>
                    </n-grid-item>
                    <n-grid-item>
                      <n-form-item :label="t('settings.labels.requestMethod')">
                        <n-select v-model:value="webhookForm.requestMethod" :options="webhookMethodOptions" />
                      </n-form-item>
                    </n-grid-item>
                      <n-grid-item>
                        <n-form-item>
                          <n-switch v-model:value="webhookForm.ignoreSsl" />
                          <span class="switch-label">{{ t('settings.labels.ignoreSsl') }}</span>
                        </n-form-item>
                      </n-grid-item>
                  </n-grid>

                  <n-collapse arrow-placement="right" class="webhook-advanced">
                    <n-collapse-item :title="t('settings.labels.advancedConfig')" name="advanced">
                      <n-form-item :label="t('settings.labels.customHeaders')">
                        <n-input
                          v-model:value="webhookForm.headers"
                          type="textarea"
                          :autosize="{ minRows: 3, maxRows: 6 }"
                          :placeholder="t('settings.placeholders.customHeaders')"
                        />
                      </n-form-item>
                      <n-form-item :label="t('settings.labels.payloadTemplate')">
                        <n-input
                          v-model:value="webhookForm.payloadTemplate"
                          type="textarea"
                          :autosize="{ minRows: 6, maxRows: 12 }"
                        />
                      </n-form-item>
                      <n-alert type="info" :show-icon="false">
                        {{ t('settings.labels.availableVariables') }}{{ webhookVariablesText }}
                      </n-alert>
                    </n-collapse-item>
                  </n-collapse>
                  <n-space class="channel-card__actions" wrap>
                    <n-button :loading="savingWebhookSettings" :disabled="savingWebhookSettings" @click="saveWebhook">{{ t('common.actions.save') }}</n-button>
                    <n-button type="primary" @click="testWebhook">{{ t('common.actions.test') }}</n-button>
                  </n-space>
                </n-form>
              </div>
            </n-grid-item>
          </n-grid>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card :title="t('settings.sections.ai')" class="settings-card">
          <n-form :model="settingsForm.aiConfig" label-placement="top">
            <n-form-item>
              <n-switch v-model:value="settingsForm.aiConfig.enabled" />
              <span class="switch-label">{{ t('settings.labels.enableAi') }}</span>
            </n-form-item>
            <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
              {{ t('settings.helps.aiSettings') }}
            </n-alert>

            <n-grid :cols="formCols" :x-gap="12" :y-gap="12">
              <n-grid-item>
                <n-form-item :label="t('settings.labels.providerPreset')">
                  <n-select
                    :value="settingsForm.aiConfig.providerPreset"
                    :options="aiProviderPresetOptions"
                    @update:value="handleAiPresetChange"
                  />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item :label="t('common.labels.provider')">
                  <n-input v-model:value="settingsForm.aiConfig.providerName" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item :label="t('common.labels.model')">
                  <n-input v-model:value="settingsForm.aiConfig.model" />
                </n-form-item>
              </n-grid-item>
              <n-grid-item>
                <n-form-item :label="t('settings.labels.capabilitySwitches')">
                  <div class="switch-group switch-group--ai-capabilities-inline">
                    <div class="switch-group__item">
                      <n-switch v-model:value="settingsForm.aiConfig.capabilities.vision" />
                      <span class="switch-label switch-label--compact">{{ t('settings.labels.aiVisionCapability') }}</span>
                    </div>
                    <div class="switch-group__item">
                      <n-switch v-model:value="settingsForm.aiConfig.dashboardSummaryEnabled" :disabled="!settingsForm.aiConfig.enabled" />
                      <span class="switch-label switch-label--compact">{{ t('settings.labels.aiSummary') }}</span>
                    </div>
                  </div>
                </n-form-item>
              </n-grid-item>
            </n-grid>

            <n-form-item :label="t('common.labels.apiBaseUrl')">
              <n-input v-model:value="settingsForm.aiConfig.baseUrl" :placeholder="t('settings.placeholders.aiBaseUrl')" />
            </n-form-item>
            <n-form-item :label="t('common.labels.apiKey')">
              <n-input v-model:value="settingsForm.aiConfig.apiKey" type="password" show-password-on="click" />
            </n-form-item>
            <n-collapse arrow-placement="right" class="ai-advanced">
              <n-collapse-item :title="t('settings.labels.advancedConfig')" name="advanced">
                <n-form-item>
                  <n-switch v-model:value="settingsForm.aiConfig.capabilities.structuredOutput" />
                  <span class="switch-label">{{ t('settings.labels.structuredOutput') }}</span>
                </n-form-item>
                <n-alert type="info" :show-icon="false" style="margin-bottom: 12px">
                  {{ t('settings.helps.structuredOutput') }}
                </n-alert>
                <n-form-item :label="t('settings.labels.requestTimeout')">
                  <n-input-number v-model:value="settingsForm.aiConfig.timeoutMs" :min="5000" :max="120000" style="width: 100%" />
                </n-form-item>
                <n-form-item :label="t('settings.labels.customRecognitionPrompt')">
                  <n-input
                    v-model:value="aiPromptInput"
                    type="textarea"
                    :autosize="{ minRows: 6, maxRows: 12 }"
                    :placeholder="t('settings.placeholders.customRecognitionPrompt')"
                  />
                </n-form-item>
                <n-form-item :label="t('settings.labels.customSummaryPrompt')">
                  <n-input
                    v-model:value="dashboardSummaryPromptInput"
                    type="textarea"
                    :autosize="{ minRows: 6, maxRows: 12 }"
                    :placeholder="t('settings.placeholders.customSummaryPrompt')"
                  />
                </n-form-item>
              </n-collapse-item>
            </n-collapse>
            <n-space class="settings-actions settings-actions--wrap">
              <n-button :loading="savingAiSettings" :disabled="savingAiSettings" @click="saveAiSettings">{{ t('common.actions.save') }}</n-button>
              <n-button type="primary" ghost @click="testAiConnectionSettings">{{ t('common.actions.connectionTest') }}</n-button>
              <n-button v-if="settingsForm.aiConfig.capabilities.vision" type="primary" @click="testAiVisionSettings">{{ t('common.actions.visionTest') }}</n-button>
            </n-space>
          </n-form>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card :title="t('settings.sections.credentials')" class="settings-card">
          <n-form :model="credentialsForm" label-placement="top">
            <n-form-item :label="t('settings.labels.oldUsername')">
              <n-input v-model:value="credentialsForm.oldUsername" />
            </n-form-item>
            <n-form-item :label="t('settings.labels.oldPassword')">
              <n-input v-model:value="credentialsForm.oldPassword" type="password" show-password-on="click" />
            </n-form-item>
            <n-form-item :label="t('settings.labels.newUsername')">
              <n-input v-model:value="credentialsForm.newUsername" />
            </n-form-item>
            <n-form-item :label="t('settings.labels.newPassword')">
              <n-input v-model:value="credentialsForm.newPassword" type="password" show-password-on="click" />
            </n-form-item>
            <div class="switch-row">
              <div class="switch-group switch-group--single">
                <div class="switch-group__item">
                  <span class="switch-inline-label">{{ t('settings.labels.enableForgotPassword') }}</span>
                  <n-tooltip v-if="!forgotPasswordToggleUnlocked" trigger="hover">
                    <template #trigger>
                      <div class="switch-disabled-wrapper">
                        <n-switch
                          v-model:value="settingsForm.forgotPasswordEnabled"
                          :disabled="true"
                        />
                      </div>
                    </template>
                    <span>{{ t('settings.helps.forgotPasswordChannelRequired') }}</span>
                  </n-tooltip>
                  <n-switch
                    v-else
                    v-model:value="settingsForm.forgotPasswordEnabled"
                    :loading="savingForgotPasswordToggle"
                    :disabled="savingForgotPasswordToggle"
                    @update:value="handleForgotPasswordToggleChange"
                  />
                </div>
              </div>
            </div>
            <n-space class="settings-actions" style="margin-top: 12px">
              <n-button type="primary" :loading="savingCredentials" :disabled="savingCredentials" @click="submitCredentialsChange">
                {{ t('common.actions.update') }}
              </n-button>
            </n-space>
          </n-form>
        </n-card>
      </n-grid-item>

      <n-grid-item>
        <n-card :title="t('settings.sections.importExport')" class="settings-card">
          <n-space vertical style="width: 100%">
            <n-card size="small" embedded :title="t('settings.sections.backup')">
              <n-space vertical style="width: 100%">
                <div class="card-muted">{{ t('settings.helps.backup') }}</div>
                <n-space class="settings-actions settings-actions--wrap" wrap>
                  <n-button type="primary" @click="exportBackup">{{ t('settings.buttons.exportBackup') }}</n-button>
                  <n-button type="success" ghost @click="showSubtrackerBackupModal = true">{{ t('settings.buttons.restoreBackup') }}</n-button>
                </n-space>
              </n-space>
            </n-card>

            <n-card size="small" embedded :title="t('settings.sections.migration')">
              <n-space vertical style="width: 100%">
                <div class="card-muted">{{ t('settings.helps.migration') }}</div>
                <n-space class="settings-actions settings-actions--wrap" wrap>
                  <n-button type="success" @click="showWallosImportModal = true">{{ t('settings.buttons.importWallos') }}</n-button>
                </n-space>
              </n-space>
            </n-card>
          </n-space>
        </n-card>
      </n-grid-item>

      <n-grid-item :span="gridSpanFull">
        <n-space vertical :size="12" style="width: 100%">
          <n-card :title="t('settings.sections.about')" class="settings-card">
            <div class="about-list">
              <div v-for="item in aboutEntries" :key="item.title" class="about-entry">
                <div class="about-entry__title">{{ item.title }}</div>
                <div v-if="item.description" class="about-entry__description">{{ item.description }}</div>
                <a class="about-entry__link" :href="item.href" target="_blank" rel="noreferrer">
                  {{ item.linkText }}
                  <n-icon :component="openOutline" />
                </a>
              </div>
            </div>
          </n-card>

          <n-card :title="t('settings.sections.credits')" class="settings-card">
            <div class="about-list">
              <div v-for="item in creditEntries" :key="item.title" class="about-entry">
                <div class="about-entry__title">{{ item.title }}</div>
                <div v-if="item.description" class="about-entry__description">{{ item.description }}</div>
                <a class="about-entry__link" :href="item.href" target="_blank" rel="noreferrer">
                  {{ item.linkText }}
                  <n-icon :component="openOutline" />
                </a>
              </div>
            </div>
          </n-card>
        </n-space>
      </n-grid-item>
    </n-grid>

    <subtracker-backup-modal
      :show="showSubtrackerBackupModal"
      @close="showSubtrackerBackupModal = false"
      @imported="handleSubtrackerBackupImported"
    />

    <wallos-import-modal
      :show="showWallosImportModal"
      :default-notify-days="settingsForm.defaultNotifyDays"
      :base-currency="settingsForm.baseCurrency"
      :app-timezone="settingsForm.timezone"
      @close="showWallosImportModal = false"
      @imported="handleWallosImported"
    />

    <apprise-targets-modal
      :show="showAppriseTargetsModal"
      :targets="settingsForm.appriseConfig.targets"
      :testing-target-id="testingAppriseTargetId"
      @close="showAppriseTargetsModal = false"
      @save="handleAppriseTargetsSave"
      @test-target="handleAppriseTargetTest"
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
  NTooltip
} from 'naive-ui'
import {
  ChevronDownOutline,
  ChevronUpOutline,
  EyeOutline,
  HelpCircleOutline,
  OpenOutline,
  RefreshOutline,
  SaveOutline,
  SettingsOutline,
  SwapHorizontalOutline
} from '@vicons/ionicons5'
import { t, getDefaultAiPromptByLocale, getDefaultAiSummaryPromptByLocale } from '@/locales'
import { api } from '@/composables/api'
import { EXCHANGE_RATE_SNAPSHOT_QUERY_KEY, useExchangeRateSnapshotQuery } from '@/composables/exchange-rate-query'
import { NOTIFICATION_WEBHOOK_QUERY_KEY, useNotificationWebhookQuery } from '@/composables/notification-webhook-query'
import { SETTINGS_QUERY_KEY, useSettingsQuery } from '@/composables/settings-query'
import PageHeader from '@/components/PageHeader.vue'
import AppriseTargetsModal from '@/components/AppriseTargetsModal.vue'
import ReminderRulesPreview from '@/components/ReminderRulesPreview.vue'
import SubtrackerBackupModal from '@/components/SubtrackerBackupModal.vue'
import WallosImportModal from '@/components/WallosImportModal.vue'
import { useAuthStore } from '@/stores/auth'
import { isRememberedSession } from '@/utils/auth-storage'
import { buildCurrencyOptions } from '@/utils/currency'
import { swapCurrencyPair } from '@/utils/currency-converter'
import { cloneSettingsForForm, type SettingsPageForm } from '@/utils/settings-form'
import { buildTimeZoneOptions, formatDateTimeInTimezone, normalizeAppTimezone } from '@/utils/timezone'
import { useLocalizedMessage } from '@/utils/localized-message'
import type {
  AiProviderPreset,
  AppriseConfig,
  AppriseTarget,
  ChangeCredentialsPayload,
  ExchangeRateSnapshot,
  NotificationWebhookSettings,
  Settings
} from '@/types/api'

const message = useLocalizedMessage()
const appVersion = __APP_VERSION__
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
const eyeOutline = EyeOutline
const openOutline = OpenOutline
const listSeparator = computed(() => t('common.separators.list'))
const settingsReminderPreviewRef = ref<InstanceType<typeof ReminderRulesPreview> | null>(null)
const settingsReminderPreviewVisible = ref(false)
const AI_PROVIDER_PRESETS: Record<
  Exclude<AiProviderPreset, 'custom'>,
  {
    providerNameKey: string
  } & Pick<Settings['aiConfig'], 'baseUrl' | 'model' | 'capabilities'>
> = {
  'aliyun-bailian': {
    providerNameKey: 'settings.options.aiProviderPreset.aliyunBailian',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3-vl-plus',
    capabilities: {
      vision: true,
      structuredOutput: true
    }
  },
  'tencent-hunyuan': {
    providerNameKey: 'settings.options.aiProviderPreset.tencentHunyuan',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    model: 'hunyuan-vision',
    capabilities: {
      vision: true,
      structuredOutput: true
    }
  },
  'volcengine-ark': {
    providerNameKey: 'settings.options.aiProviderPreset.volcengineArk',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-vision-pro-32k-250115',
    capabilities: {
      vision: true,
      structuredOutput: true
    }
  }
}

const settingsForm = reactive<SettingsPageForm>({
  baseCurrency: 'CNY',
  timezone: 'Asia/Shanghai',
  defaultNotifyDays: 3,
  defaultAdvanceReminderRules: DEFAULT_ADVANCE_REMINDER_RULES,
  rememberSessionDays: 7,
  forgotPasswordEnabled: false,
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
  barkNotificationsEnabled: false,
  notifyxNotificationsEnabled: false,
  appriseNotificationsEnabled: false,
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
  barkConfig: {
    serverUrl: '',
    deviceKey: '',
    isArchive: false
  },
  notifyxConfig: {
    apiKey: '',
    team: ''
  },
  appriseConfig: {
    apiBaseUrl: '',
    key: '',
    ignoreSsl: false,
    targets: [],
    lastSyncStatus: 'idle',
    lastSyncAt: null,
    lastSyncError: null
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
const aiPromptInput = ref(getDefaultAiPromptByLocale())
const dashboardSummaryPromptInput = ref(getDefaultAiSummaryPromptByLocale())
const savingBasicSettings = ref(false)
const savingEmailSettings = ref(false)
const savingPushplusSettings = ref(false)
const savingTelegramSettings = ref(false)
const savingServerchanSettings = ref(false)
const savingGotifySettings = ref(false)
const savingBarkSettings = ref(false)
const savingNotifyxSettings = ref(false)
const savingAppriseSettings = ref(false)
const savingWebhookSettings = ref(false)
const savingAiSettings = ref(false)
const savingCredentials = ref(false)
const savingForgotPasswordToggle = ref(false)
const sourceCurrency = ref('USD')
const targetCurrency = ref('CNY')
const converterAmount = ref(1)
const showSubtrackerBackupModal = ref(false)
const showWallosImportModal = ref(false)
const showAppriseTargetsModal = ref(false)
const emailDetailsExpanded = ref(false)
const testingAppriseTargetId = ref<string | null>(null)
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
  '{{phase}}, {{days_until}}, {{days_overdue}}, {{subscription_id}}, {{subscription_name}}, {{subscription_amount}}, {{subscription_currency}}, {{subscription_next_renewal_date}}, {{subscription_tags}}, {{subscription_url}}, {{subscription_notes}}'
const aiProviderPresetOptions = computed(() => [
  { label: t('settings.options.aiProviderPreset.custom'), value: 'custom' },
  { label: t('settings.options.aiProviderPreset.aliyunBailian'), value: 'aliyun-bailian' },
  { label: t('settings.options.aiProviderPreset.tencentHunyuan'), value: 'tencent-hunyuan' },
  { label: t('settings.options.aiProviderPreset.volcengineArk'), value: 'volcengine-ark' }
] satisfies Array<{ label: string; value: AiProviderPreset }>)
const emailProviderOptions = computed(() => [
  { label: t('settings.options.emailProvider.smtp'), value: 'smtp' },
  { label: t('settings.options.emailProvider.resend'), value: 'resend' }
] satisfies Array<{ label: string; value: 'smtp' | 'resend' }>)
const forgotPasswordToggleUnlocked = computed(
  () =>
    settingsForm.emailNotificationsEnabled ||
    settingsForm.pushplusNotificationsEnabled ||
    settingsForm.telegramNotificationsEnabled ||
    settingsForm.serverchanNotificationsEnabled ||
    settingsForm.gotifyNotificationsEnabled ||
    settingsForm.barkNotificationsEnabled ||
    settingsForm.notifyxNotificationsEnabled ||
    (settingsForm.appriseNotificationsEnabled && settingsForm.appriseConfig.targets.some((target) => target.enabled))
)
const appriseTargetCount = computed(() => settingsForm.appriseConfig.targets.length)
const appriseEnabledTargetCount = computed(() => settingsForm.appriseConfig.targets.filter((target) => target.enabled).length)
const appriseSyncStatusText = computed(() => t(`settings.apprise.syncStatus.${settingsForm.appriseConfig.lastSyncStatus}`))
const appriseSyncTagType = computed(() => {
  if (settingsForm.appriseConfig.lastSyncStatus === 'failed') return 'error'
  if (settingsForm.appriseConfig.lastSyncStatus === 'synced') return 'success'
  return 'default'
})
const aboutEntries = computed(() => [
  {
    title: `SubTracker ${appVersion}`,
    description: '',
    linkText: t('settings.about.releaseNotes'),
    href: 'https://github.com/Smile-QWQ/SubTracker/releases'
  },
  {
    title: t('settings.about.license'),
    description: '',
    linkText: 'GPLv3',
    href: 'https://www.gnu.org/licenses/gpl-3.0'
  },
  {
    title: t('settings.about.issues'),
    description: '',
    linkText: 'GitHub',
    href: 'https://github.com/Smile-QWQ/SubTracker/issues'
  },
  {
    title: t('settings.about.author'),
    description: '',
    linkText: 'https://github.com/Smile-QWQ',
    href: 'https://github.com/Smile-QWQ'
  },
  {
    title: t('settings.about.documentation'),
    description: '',
    linkText: t('settings.about.readmeDeployment'),
    href: 'https://github.com/Smile-QWQ/SubTracker#readme'
  }
])
const creditEntries = [
  {
    title: t('settings.about.credits.wallos'),
    description: '',
    linkText: 'https://github.com/ellite/Wallos',
    href: 'https://github.com/ellite/Wallos'
  },
  {
    title: t('settings.about.credits.vueVite'),
    description: '',
    linkText: 'https://vite.dev/',
    href: 'https://vite.dev/'
  },
  {
    title: t('settings.about.credits.naiveUi'),
    description: '',
    linkText: 'https://www.naiveui.com/',
    href: 'https://www.naiveui.com/'
  },
  {
    title: t('settings.about.credits.fastifyPrisma'),
    description: '',
    linkText: 'https://www.fastify.io/ / https://www.prisma.io/',
    href: 'https://www.fastify.io/'
  },
  {
    title: t('settings.about.credits.piniaTanstackEcharts'),
    description: '',
    linkText: 'https://pinia.vuejs.org/',
    href: 'https://pinia.vuejs.org/'
  }
] as const
const emailSummaryText = computed(() => {
  if (settingsForm.emailProvider === 'resend') {
    const to = settingsForm.resendConfig.to.trim() || t('settings.placeholders.notFilledRecipient')
    return t('settings.summary.emailResend', { to })
  }

  const host = settingsForm.smtpConfig.host.trim() || t('settings.placeholders.notFilledSmtpHost')
  const to = settingsForm.smtpConfig.to.trim() || t('settings.placeholders.notFilledRecipient')
  return t('settings.summary.emailSmtp', { host, to })
})
function getMissingRequiredFields(fields: Array<[string, unknown]>) {
  return fields
    .filter(([, value]) => {
      if (typeof value === 'number') return Number.isNaN(value)
      return !String(value ?? '').trim()
    })
    .map(([label]) => label)
}

function joinFieldLabels(fields: string[]) {
  return fields.join(listSeparator.value)
}

function validateEmailSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.emailNotificationsEnabled) {
    return true
  }

  const missing =
    settingsForm.emailProvider === 'resend'
      ? getMissingRequiredFields([
          [t('common.labels.apiBaseUrl'), settingsForm.resendConfig.apiBaseUrl],
          [t('common.labels.apiKey'), settingsForm.resendConfig.apiKey],
          [t('common.labels.from'), settingsForm.resendConfig.from],
          [t('common.labels.to'), settingsForm.resendConfig.to]
        ])
      : getMissingRequiredFields([
          [t('common.labels.host'), settingsForm.smtpConfig.host],
          [t('common.labels.port'), settingsForm.smtpConfig.port],
          [t('common.labels.username'), settingsForm.smtpConfig.username],
          [t('common.labels.password'), settingsForm.smtpConfig.password],
          [t('common.labels.from'), settingsForm.smtpConfig.from],
          [t('common.labels.to'), settingsForm.smtpConfig.to]
        ])

  if (!missing.length) return true
  message.error(t('settings.validation.emailMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function validatePushplusSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.pushplusNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([[t('common.labels.token'), settingsForm.pushplusConfig.token]])
  if (!missing.length) return true
  message.error(t('settings.validation.pushplusMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function validateTelegramSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.telegramNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    [t('common.labels.botToken'), settingsForm.telegramConfig.botToken],
    [t('common.labels.chatId'), settingsForm.telegramConfig.chatId]
  ])
  if (!missing.length) return true
  message.error(t('settings.validation.telegramMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function validateServerchanSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.serverchanNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([[t('common.labels.sendKey'), settingsForm.serverchanConfig.sendkey]])
  if (!missing.length) return true
  message.error(t('settings.validation.serverchanMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function validateGotifySettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.gotifyNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    [t('common.labels.url'), settingsForm.gotifyConfig.url],
    [t('common.labels.token'), settingsForm.gotifyConfig.token]
  ])
  if (!missing.length) return true
  message.error(t('settings.validation.gotifyMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function validateBarkSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.barkNotificationsEnabled) {
    return true
  }

  const requiredFields: Array<[string, string | number | boolean | null | undefined]> = [
    [t('common.labels.serverUrl'), settingsForm.barkConfig.serverUrl]
  ]
  if (!isBarkCustomServerUrl(settingsForm.barkConfig.serverUrl)) {
    requiredFields.push([t('common.labels.deviceKey'), settingsForm.barkConfig.deviceKey])
  }
  const missing = getMissingRequiredFields(requiredFields)
  if (!missing.length) return true
  message.error(t('settings.validation.barkMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function isBarkCustomServerUrl(serverUrl: string) {
  try {
    const parsed = new URL(serverUrl.trim())
    return parsed.pathname.replace(/\/+$/, '') !== ''
  } catch {
    return false
  }
}

function validateNotifyxSettings(action: 'save' | 'test') {
  if (action === 'save' && !settingsForm.notifyxNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([[t('common.labels.apiKey'), settingsForm.notifyxConfig.apiKey]])
  if (!missing.length) return true
  message.error(t('settings.validation.notifyxMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function buildAppriseConfigPayload(
  overrides: Partial<AppriseConfig> = {}
): AppriseConfig {
  const baseConfig = {
    ...settingsForm.appriseConfig,
    targets: settingsForm.appriseConfig.targets.map((target) => ({
      ...target
    }))
  }

  return {
    ...baseConfig,
    ...overrides,
    targets: overrides.targets
      ? overrides.targets.map((target) => ({
          ...target
        }))
      : baseConfig.targets
  }
}

function validateAppriseSettings(action: 'save' | 'test', config: AppriseConfig = buildAppriseConfigPayload()) {
  if (action === 'save' && !settingsForm.appriseNotificationsEnabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    [t('settings.labels.appriseApiBaseUrl'), config.apiBaseUrl],
    [t('settings.labels.appriseKey'), config.key]
  ])

  if (missing.length) {
    message.error(t('settings.validation.appriseMissingFields', { fields: joinFieldLabels(missing) }))
    return false
  }

  if (!config.targets.length) {
    message.error(t('settings.validation.appriseMissingFields', { fields: t('settings.labels.appriseTargets') }))
    return false
  }

  if (action === 'save' && !config.targets.some((target) => target.enabled)) {
    message.error(t('api.errors.settings.appriseEnabledTargetsRequired'))
    return false
  }

  const invalidTarget = config.targets.find((target) => !target.id || !target.name.trim() || !target.url.trim())
  if (invalidTarget) {
    message.error(t('api.errors.settings.appriseTargetFieldsRequired'))
    return false
  }

  return true
}

function validateWebhookSettings(action: 'save' | 'test') {
  if (action === 'save' && !webhookForm.enabled) {
    return true
  }

  const missing = getMissingRequiredFields([[t('common.labels.url'), webhookForm.url]])
  if (!missing.length) return true
  message.error(t('settings.validation.webhookMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

function validateAiSettings(action: 'save' | 'connection-test' | 'vision-test') {
  if (action === 'save' && !settingsForm.aiConfig.enabled) {
    return true
  }

  const missing = getMissingRequiredFields([
    [t('common.labels.provider'), settingsForm.aiConfig.providerName],
    [t('common.labels.model'), settingsForm.aiConfig.model],
    [t('common.labels.apiBaseUrl'), settingsForm.aiConfig.baseUrl],
    [t('common.labels.apiKey'), settingsForm.aiConfig.apiKey]
  ])

  if (!missing.length) return true
  message.error(t('settings.validation.aiMissingFields', { fields: joinFieldLabels(missing) }))
  return false
}

watch(
  settingsQueryData,
  (settings) => {
    if (!settings) return
    Object.assign(settingsForm, cloneSettingsForForm(settings))
    aiPromptInput.value = settings.aiConfig.promptTemplate.trim() || getDefaultAiPromptByLocale()
    dashboardSummaryPromptInput.value = settings.aiConfig.dashboardSummaryPromptTemplate.trim() || getDefaultAiSummaryPromptByLocale()
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

watch(
  forgotPasswordToggleUnlocked,
  (unlocked) => {
    if (!unlocked) {
      settingsForm.forgotPasswordEnabled = false
    }
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
      forgotPasswordEnabled: settingsForm.forgotPasswordEnabled,
      mergeMultiSubscriptionNotifications: settingsForm.mergeMultiSubscriptionNotifications,
      monthlyBudgetBase: settingsForm.monthlyBudgetBase,
      yearlyBudgetBase: settingsForm.yearlyBudgetBase,
      enableTagBudgets: settingsForm.enableTagBudgets,
      defaultOverdueReminderRules: settingsForm.defaultOverdueReminderRules,
      tagBudgets: settingsForm.tagBudgets
    })
    applySavedSettings(result)
    message.success(t('settings.messages.basicSaved'))
    targetCurrency.value = settingsForm.baseCurrency.toUpperCase()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['statistics-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['statistics-budgets'] })
    ])
    await queryClient.invalidateQueries({ queryKey: EXCHANGE_RATE_SNAPSHOT_QUERY_KEY })
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.basicSaveFailed'))
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
    message.success(settingsForm.emailNotificationsEnabled ? t('settings.messages.emailSaved') : t('settings.messages.emailDisabled'))
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
    message.success(settingsForm.pushplusNotificationsEnabled ? t('settings.messages.pushplusSaved') : t('settings.messages.pushplusDisabled'))
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
    message.success(settingsForm.telegramNotificationsEnabled ? t('settings.messages.telegramSaved') : t('settings.messages.telegramDisabled'))
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
    message.success(settingsForm.serverchanNotificationsEnabled ? t('settings.messages.serverchanSaved') : t('settings.messages.serverchanDisabled'))
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
    message.success(settingsForm.gotifyNotificationsEnabled ? t('settings.messages.gotifySaved') : t('settings.messages.gotifyDisabled'))
  } finally {
    savingGotifySettings.value = false
  }
}

async function saveBarkSettings() {
  if (savingBarkSettings.value) return
  if (!validateBarkSettings('save')) return
  savingBarkSettings.value = true
  try {
    const result = await api.updateSettings({
      barkNotificationsEnabled: settingsForm.barkNotificationsEnabled,
      barkConfig: settingsForm.barkConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.barkNotificationsEnabled ? t('settings.messages.barkSaved') : t('settings.messages.barkDisabled'))
  } finally {
    savingBarkSettings.value = false
  }
}

async function saveNotifyxSettings() {
  if (savingNotifyxSettings.value) return
  if (!validateNotifyxSettings('save')) return
  savingNotifyxSettings.value = true
  try {
    const result = await api.updateSettings({
      notifyxNotificationsEnabled: settingsForm.notifyxNotificationsEnabled,
      notifyxConfig: settingsForm.notifyxConfig
    })
    applySavedSettings(result)
    message.success(settingsForm.notifyxNotificationsEnabled ? t('settings.messages.notifyxSaved') : t('settings.messages.notifyxDisabled'))
  } finally {
    savingNotifyxSettings.value = false
  }
}

async function saveAppriseSettings() {
  if (savingAppriseSettings.value) return
  const payload = buildAppriseConfigPayload()
  if (!validateAppriseSettings('save', payload)) return

  savingAppriseSettings.value = true
  try {
    const result = await api.updateSettings({
      appriseNotificationsEnabled: settingsForm.appriseNotificationsEnabled,
      appriseConfig: payload
    })
    applySavedSettings(result)
    if (result.appriseConfig.lastSyncStatus === 'failed' && result.appriseConfig.lastSyncError) {
      message.warning(t('settings.messages.appriseSavedWithSyncFailure', { error: result.appriseConfig.lastSyncError }))
    } else {
      message.success(settingsForm.appriseNotificationsEnabled ? t('settings.messages.appriseSaved') : t('settings.messages.appriseDisabled'))
    }
  } finally {
    savingAppriseSettings.value = false
  }
}

async function saveAiSettings() {
  if (savingAiSettings.value) return
  if (!validateAiSettings('save')) return
  const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
  const dashboardSummaryPromptTemplate = normalizeDashboardSummaryPrompt(dashboardSummaryPromptInput.value)
  settingsForm.aiConfig.promptTemplate = promptTemplate
  settingsForm.aiConfig.dashboardSummaryPromptTemplate = dashboardSummaryPromptTemplate
  aiPromptInput.value = promptTemplate || getDefaultAiPromptByLocale()
  dashboardSummaryPromptInput.value = dashboardSummaryPromptTemplate || getDefaultAiSummaryPromptByLocale()
  savingAiSettings.value = true
  try {
    const result = await api.updateSettings({
      aiConfig: {
        ...settingsForm.aiConfig,
        capabilities: {
          ...settingsForm.aiConfig.capabilities
        },
        promptTemplate,
        dashboardSummaryPromptTemplate
      }
    })
    applySavedSettings(result)
    aiPromptInput.value = result.aiConfig.promptTemplate.trim() || getDefaultAiPromptByLocale()
    dashboardSummaryPromptInput.value = result.aiConfig.dashboardSummaryPromptTemplate.trim() || getDefaultAiSummaryPromptByLocale()
    message.success(settingsForm.aiConfig.enabled ? t('settings.messages.aiSaved') : t('settings.messages.aiDisabled'))
  } finally {
    savingAiSettings.value = false
  }
}

async function testAiConnectionSettings() {
  if (!validateAiSettings('connection-test')) return
  try {
    const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
    const dashboardSummaryPromptTemplate = normalizeDashboardSummaryPrompt(dashboardSummaryPromptInput.value)
    const result = await api.testAiConfigurationWithPayload({
      ...settingsForm.aiConfig,
      promptTemplate,
      dashboardSummaryPromptTemplate,
      capabilities: {
        ...settingsForm.aiConfig.capabilities
      }
    })
    message.success(t('settings.messages.aiConnectionTestSuccess', { provider: result.providerName, model: result.model, response: result.response }))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.aiConnectionTestFailed'))
  }
}

async function testAiVisionSettings() {
  if (!validateAiSettings('vision-test')) return
  try {
    const promptTemplate = normalizeAiPrompt(aiPromptInput.value)
    const dashboardSummaryPromptTemplate = normalizeDashboardSummaryPrompt(dashboardSummaryPromptInput.value)
    const result = await api.testAiVisionConfigurationWithPayload({
      ...settingsForm.aiConfig,
      promptTemplate,
      dashboardSummaryPromptTemplate,
      capabilities: {
        ...settingsForm.aiConfig.capabilities
      }
    })
    message.success(t('settings.messages.aiVisionTestSuccess', { provider: result.providerName, model: result.model, response: result.response }))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.aiVisionTestFailed'))
  }
}

function normalizeAiPrompt(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized === getDefaultAiPromptByLocale().trim()) return ''
  return normalized
}

function normalizeDashboardSummaryPrompt(value: string) {
  const normalized = value.trim()
  if (!normalized) return ''
  if (normalized === getDefaultAiSummaryPromptByLocale().trim()) return ''
  return normalized
}

function handleAiPresetChange(value: AiProviderPreset) {
  settingsForm.aiConfig.providerPreset = value
  if (value === 'custom') {
    return
  }

  const preset = AI_PROVIDER_PRESETS[value]
  settingsForm.aiConfig.providerName = t(preset.providerNameKey)
  settingsForm.aiConfig.baseUrl = preset.baseUrl
  settingsForm.aiConfig.model = preset.model
  settingsForm.aiConfig.capabilities = {
    ...preset.capabilities
  }
}

async function refreshRates() {
  snapshot.value = await api.refreshExchangeRates()
  queryClient.setQueryData(EXCHANGE_RATE_SNAPSHOT_QUERY_KEY, snapshot.value)
  message.success(t('settings.messages.ratesRefreshed'))
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
    message.success(t('settings.messages.credentialsUpdated'))
  } finally {
    savingCredentials.value = false
  }
}

async function handleForgotPasswordToggleChange(value: boolean) {
  if (savingForgotPasswordToggle.value) return
  const previousValue = settingsForm.forgotPasswordEnabled
  settingsForm.forgotPasswordEnabled = value
  savingForgotPasswordToggle.value = true
  try {
    const result = await api.updateSettings({
      forgotPasswordEnabled: value
    })
    applySavedSettings(result)
    message.success(value ? t('settings.messages.forgotPasswordEnabled') : t('settings.messages.forgotPasswordDisabled'))
  } catch (error) {
    settingsForm.forgotPasswordEnabled = previousValue
    message.error(error instanceof Error ? error.message : t('settings.messages.forgotPasswordSaveFailed'))
  } finally {
    savingForgotPasswordToggle.value = false
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
    message.success(t('settings.messages.emailTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.emailTestFailed'))
  }
}

async function testPushplus() {
  if (!validatePushplusSettings('test')) return
  try {
    const result = await api.testPushplusNotificationWithPayload(settingsForm.pushplusConfig)
    message.success(
      result.shortCode
        ? t('settings.messages.pushplusTestSubmittedWithCode', { code: result.shortCode })
        : result.message || t('settings.messages.pushplusTestSubmitted')
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.pushplusTestFailed'))
  }
}

async function testTelegram() {
  if (!validateTelegramSettings('test')) return
  try {
    await api.testTelegramNotificationWithPayload(settingsForm.telegramConfig)
    message.success(t('settings.messages.telegramTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.telegramTestFailed'))
  }
}

async function testServerchan() {
  if (!validateServerchanSettings('test')) return
  try {
    await api.testServerchanNotificationWithPayload(settingsForm.serverchanConfig)
    message.success(t('settings.messages.serverchanTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.serverchanTestFailed'))
  }
}

async function testGotify() {
  if (!validateGotifySettings('test')) return
  try {
    await api.testGotifyNotificationWithPayload(settingsForm.gotifyConfig)
    message.success(t('settings.messages.gotifyTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.gotifyTestFailed'))
  }
}

async function testBark() {
  if (!validateBarkSettings('test')) return
  try {
    await api.testBarkNotificationWithPayload(settingsForm.barkConfig)
    message.success(t('settings.messages.barkTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.barkTestFailed'))
  }
}

async function testNotifyx() {
  if (!validateNotifyxSettings('test')) return
  try {
    await api.testNotifyxNotificationWithPayload(settingsForm.notifyxConfig)
    message.success(t('settings.messages.notifyxTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.notifyxTestFailed'))
  }
}

function handleAppriseTargetsSave(targets: AppriseTarget[]) {
  settingsForm.appriseConfig.targets = targets
  showAppriseTargetsModal.value = false
}

async function handleAppriseTargetTest(payload: { targetId: string; targets: AppriseTarget[] }) {
  const config = buildAppriseConfigPayload({
    targets: payload.targets
  })
  if (!validateAppriseSettings('test', config)) {
    return
  }

  testingAppriseTargetId.value = payload.targetId
  try {
    await api.testAppriseNotificationWithPayload({
      ...config,
      targetId: payload.targetId
    })
    message.success(t('settings.messages.appriseTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.appriseTestFailed'))
  } finally {
    testingAppriseTargetId.value = null
  }
}

async function testApprise() {
  const config = buildAppriseConfigPayload()
  if (!validateAppriseSettings('test', config)) return
  if (!config.targets.some((target) => target.enabled)) {
    message.error(t('api.errors.settings.appriseEnabledTargetsRequired'))
    return
  }

  try {
    await api.testAppriseNotificationWithPayload(config)
    message.success(t('settings.messages.appriseTestSent'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.appriseTestFailed'))
  }
}

async function exportBackup() {
  try {
    const result = await api.exportBackup()
    downloadBlob(result.blob, result.filename)
    message.success(t('settings.messages.zipExportStarted'))
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.zipExportFailed'))
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

function refreshAppQueries() {
  queryClient.removeQueries({ queryKey: ['subscriptions'] })
  queryClient.removeQueries({ queryKey: ['tags'] })
  queryClient.removeQueries({ queryKey: ['statistics-overview'] })
  queryClient.removeQueries({ queryKey: ['statistics-budgets'] })
  queryClient.removeQueries({ queryKey: ['calendar-events'] })
  queryClient.removeQueries({ queryKey: SETTINGS_QUERY_KEY })
  queryClient.removeQueries({ queryKey: EXCHANGE_RATE_SNAPSHOT_QUERY_KEY })
  queryClient.removeQueries({ queryKey: NOTIFICATION_WEBHOOK_QUERY_KEY })
}

function handleSubtrackerBackupImported(result: { mode: 'replace' | 'append'; restoredSettings: boolean }) {
  refreshAppQueries()
  showSubtrackerBackupModal.value = false
  message.success(
    result.mode === 'replace'
      ? t('settings.messages.backupRestored')
      : result.restoredSettings
        ? t('settings.messages.backupAppendedWithSettings')
        : t('settings.messages.backupAppended')
  )
}

function handleWallosImported() {
  refreshAppQueries()
  showWallosImportModal.value = false
  message.success(t('settings.messages.wallosImported'))
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
    message.success(webhookForm.enabled ? t('settings.messages.webhookSaved') : t('settings.messages.webhookDisabled'))
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
    message.success(
      preview
        ? t('settings.messages.webhookTestSuccessWithPreview', { statusCode: result.statusCode, preview })
        : t('settings.messages.webhookTestSuccess', { statusCode: result.statusCode })
    )
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('settings.messages.webhookTestFailed'))
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
  { title: t('common.labels.currency'), key: 'currency' },
  {
    title: settingsForm.baseCurrency.toUpperCase(),
    key: 'rate',
    render: (row: { rate: number }) => row.rate.toFixed(4)
  }
])

function formatTime(value: string) {
  return formatDateTimeInTimezone(value, settingsForm.timezone)
}

function previewSettingsReminderRules() {
  settingsReminderPreviewRef.value?.toggle()
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

.switch-label--compact {
  margin-left: 0;
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

.switch-group--ai-capabilities {
  margin-bottom: 12px;
}

.switch-group--ai-capabilities-inline {
  width: 100%;
  min-height: 34px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.switch-group__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.switch-disabled-wrapper {
  display: inline-flex;
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

.settings-actions,
.settings-header-tags,
.channel-card__actions {
  width: 100%;
}

.settings-actions :deep(.n-space-item),
.channel-card__actions :deep(.n-space-item) {
  min-width: 0;
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
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.channel-card__actions {
  margin-top: 4px;
}

.email-details-toggle {
  width: 100%;
  justify-content: center;
}

.email-summary {
  margin: 2px 0 14px;
  line-height: 1.5;
}

.apprise-sync-error {
  margin-top: 8px;
  margin-bottom: 4px;
  word-break: break-word;
}

.compact-switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 34px;
  margin-top: -2px;
  margin-bottom: 12px;
}

.settings-reminder-preview {
  margin-top: -4px;
  margin-bottom: 12px;
}

.about-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.about-entry {
  min-width: 0;
}

.about-entry__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text-strong);
}

.about-entry__description {
  margin-top: 2px;
  color: var(--app-text-secondary);
  line-height: 1.6;
}

.about-entry__link {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #7c8db5;
  text-decoration: none;
  word-break: break-all;
}

.about-entry__link:hover {
  color: #4f6ef7;
}

.webhook-advanced,
.ai-advanced {
  margin-bottom: 12px;
}

@media (max-width: 640px) {
  .settings-actions,
  .settings-header-tags,
  .channel-card__actions {
    justify-content: flex-start;
  }

  .settings-actions :deep(.n-button),
  .channel-card__actions :deep(.n-button) {
    width: 100%;
  }

  .switch-group--ai-capabilities-inline {
    justify-content: flex-start;
    min-width: 0;
  }

  .converter-currency-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .converter-swap-button {
    justify-self: center;
  }

  .channel-card__header {
    align-items: flex-start;
  }

  .compact-switch-row {
    align-items: flex-start;
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
