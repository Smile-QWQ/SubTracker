export default {
  common: {
    actions: {
      save: 'Save',
      refresh: 'Refresh',
      update: 'Update',
      test: 'Test',
      cancel: 'Cancel',
      confirm: 'Confirm',
      close: 'Close',
      expand: 'Expand',
      collapse: 'Collapse',
      delete: 'Delete',
      keep: 'Keep',
      restore: 'Restore',
      search: 'Search',
      reset: 'Reset',
      preview: 'Preview',
      import: 'Import',
      export: 'Export',
      create: 'Create',
      edit: 'Edit',
      reorder: 'Reorder',
      done: 'Done',
      signOut: 'Sign out',
      connectionTest: 'Connection test',
      visionTest: 'Vision test'
    },
    status: {
      enabled: 'Enabled',
      disabled: 'Disabled',
      active: 'Active',
      paused: 'Paused',
      cancelled: 'Cancelled',
      expired: 'Expired',
      stale: 'Stale',
      fresh: 'Fresh'
    },
    labels: {
      name: 'Name',
      description: 'Description',
      notes: 'Notes',
      amount: 'Amount',
      currency: 'Currency',
      status: 'Status',
      tags: 'Tags',
      startDate: 'Start date',
      nextRenewal: 'Next renewal',
      autoRenew: 'Auto renew',
      notifications: 'Notifications',
      createdAt: 'Created at',
      from: 'From',
      to: 'To',
      provider: 'Provider',
      username: 'Username',
      password: 'Password',
      token: 'Token',
      url: 'URL',
      unit: 'Unit',
      frequency: 'Frequency',
      actions: 'Actions',
      port: 'Port',
      code: 'Verification code',
      model: 'Model',
      requestMethod: 'Request method',
      host: 'Host',
      secure: 'Secure',
      chatId: 'Chat ID',
      botToken: 'Bot Token',
      sendKey: 'SendKey',
      apiBaseUrl: 'API Base URL',
      apiKey: 'API Key',
      topic: 'Topic'
    },
    empty: {
      noData: 'No data',
      noDescription: 'No description',
      noNotes: 'No notes',
      noTags: 'No tags'
    },
    errors: {
      requestFailed: 'Request failed'
    },
    placeholders: {
      noFileSelected: 'No file selected'
    },
    separators: {
      list: ', '
    },
    locales: {
      zhCN: '简体中文',
      enUS: 'English'
    },
    units: {
      day: 'Day',
      week: 'Week',
      month: 'Month',
      quarter: 'Quarter',
      year: 'Year',
      minutes: 'minutes'
    }
  },
  app: {
    brand: 'SubTracker',
    shellTitle: 'Subscription Console',
    shellSubtitle: 'Multi-currency · Reminders · Statistics · Calendar',
    notSignedIn: 'Not signed in',
    changeDefaultPasswordTitle: 'Change default password first',
    changeDefaultPasswordWarning: 'You are still using the default admin password. Change it before continuing.',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    versionUpdates: 'Version updates',
    releaseUnknown: 'Unknown publish time',
    viewRelease: 'View Release',
    noNewRelease: 'No release is newer than the current version.',
    updateAvailable: 'New version available. Current: {currentVersion}, latest: {latestVersion}',
    alreadyLatest: 'You are already on the latest version ({version})',
    menu: {
      dashboard: 'Dashboard',
      subscriptions: 'Subscriptions',
      calendar: 'Calendar',
      statistics: 'Spending',
      budgets: 'Budgets',
      settings: 'Settings'
    },
    auth: {
      login: 'Login'
    },
    theme: {
      current: 'Current theme: {current}. Click to switch to {next}',
      light: 'Light',
      dark: 'Dark'
    }
  },
  auth: {
    validation: {
      usernameAndPasswordRequired: 'Enter username and password',
      usernameRequired: 'Enter a username',
      passwordRequired: 'Enter a password',
      loginPayloadInvalid: 'Invalid login payload',
      codeRequired: 'Enter the 6-digit verification code',
      codeFormat: 'The verification code must be 6 digits',
      newPasswordRequired: 'Enter the new password',
      newPasswordMin: 'The new password must be at least 4 characters long',
      passwordMismatch: 'The two new passwords do not match'
    },
    success: {
      login: 'Signed in successfully',
      forgotPasswordCodeSent: 'If the username is valid and notifications are enabled, the verification code has been sent.',
      passwordResetAndLoggedIn: 'Password reset succeeded and you have been signed in automatically',
      defaultPasswordChanged: 'Default password changed'
    },
    error: {
      login: 'Sign in failed',
      forgotPasswordCodeSend: 'Failed to send the verification code',
      passwordReset: 'Password reset failed'
    }
  },
  login: {
    title: 'Sign in to SubTracker',
    subtitle: 'Enter your username and password',
    rememberMe: 'Remember me',
    rememberMeDays: '({days} days)',
    forgotPassword: 'Forgot password',
    collapseForgotPassword: 'Hide password recovery',
    sendCode: 'Send verification code',
    verifyAndResetPassword: 'Verify and reset password',
    usernamePlaceholder: 'Enter username',
    passwordPlaceholder: 'Enter password',
    codePlaceholder: 'Enter the 6-digit verification code',
    newPasswordPlaceholder: 'Enter the new password',
    confirmNewPasswordPlaceholder: 'Enter the new password again'
  },
  settings: {
    page: {
      title: 'Settings',
      subtitle: 'Manage base settings, budgets, exchange rates, notifications, and AI'
    },
    sections: {
      basic: 'Basic settings',
      exchangeSnapshot: 'Exchange rate snapshot',
      currentRates: 'Current rates (common currencies)',
      converter: 'Currency converter',
      notifications: 'Notification settings',
      ai: 'AI settings',
      credentials: 'Credentials',
      importExport: 'Import and export',
      backup: 'Backup',
      migration: 'Migration',
      about: 'About',
      credits: 'Credits'
    },
    labels: {
      baseCurrency: 'Base currency',
      timezone: 'Business timezone',
      rememberSessionDays: 'Remember session days',
      timezoneSample: 'Current timezone sample',
      monthlyBudget: 'Monthly budget (base currency)',
      yearlyBudget: 'Yearly budget (base currency)',
      advanceReminderRules: 'Advance reminder rules',
      overdueReminderRules: 'Overdue reminder rules',
      mergeNotifications: 'Merge multi-subscription notifications',
      enableTagBudgets: 'Enable tag monthly budgets',
      sourceCurrency: 'Source currency',
      targetCurrency: 'Target currency',
      providerPreset: 'Provider preset',
      capabilitySwitches: 'Capability switches',
      structuredOutput: 'Prefer structured JSON output',
      requestTimeout: 'Request timeout (ms)',
      customRecognitionPrompt: 'Custom recognition prompt',
      customSummaryPrompt: 'Custom summary prompt',
      enableAi: 'Enable AI',
      aiSummary: 'AI summary',
      aiVisionCapability: 'Vision input',
      configurationDetails: 'Configuration details',
      advancedConfig: 'Advanced settings',
      notificationProvider: 'Notification provider',
      providerName: 'Provider name',
      providerUrl: 'Endpoint',
      fetchedAt: 'Fetched at',
      snapshotStatus: 'Snapshot status',
      requestMethod: 'Request method',
      customHeaders: 'Custom headers',
      payloadTemplate: 'Payload template',
      availableVariables: 'Available variables:',
      ignoreSsl: 'Ignore SSL verification',
      smtpHost: 'SMTP Host',
      secure: 'Secure',
      resendApiUrl: 'Resend API URL',
      resendApiKey: 'Resend API Key',
      botToken: 'Bot Token',
      chatId: 'Chat ID',
      sendKey: 'SendKey',
      topic: 'Topic',
      apiBaseUrl: 'API Base URL',
      apiKey: 'API Key',
      oldUsername: 'Current username',
      oldPassword: 'Current password',
      newUsername: 'New username',
      newPassword: 'New password',
      enableForgotPassword: 'Allow password recovery via notification code',
      restoreSettings: 'Also overwrite current settings'
    },
    helps: {
      advanceReminderRules:
        'Format: days&time; For example, 3&09:30; means remind 3 days in advance at 09:30, and 0&09:30; means remind on the due day. Separate multiple rules with ;',
      overdueReminderRules:
        'Format: days&time; For example, 1&09:30; means remind at 09:30 after 1 overdue day. Separate multiple rules with ;',
      notificationSettings:
        'Manage Email, PushPlus, Telegram, ServerChan, Gotify, and Webhook in one place. Each channel can be saved and tested independently.',
      aiSettings: 'The AI master switch controls recognition and connection tests. AI summaries can be enabled or disabled separately.',
      structuredOutput:
        'When enabled, the system prefers vendor-supported structured JSON output. If unsupported, it automatically falls back to prompt-based JSON output.',
      backup: 'Backup and restore via ZIP, including subscriptions, tags, payment records, ordering, settings, and local logos.',
      migration: 'Import data from similar third-party projects'
    },
    buttons: {
      previewReminderRules: 'Preview reminder rules',
      collapseReminderPreview: 'Hide reminder preview',
      exportBackup: 'Export backup',
      restoreBackup: 'Restore backup',
      importWallos: 'Import Wallos',
      swapCurrencies: 'Swap source and target currencies'
    },
    placeholders: {
      optional: 'Optional',
      notFilledRecipient: 'Recipient not set',
      notFilledSmtpHost: 'SMTP Host not set',
      fromAddress: 'SubTracker <noreply@example.com>',
      advanceReminderRules: 'Example: 3&09:30;0&09:30;',
      overdueReminderRules: 'Example: 1&09:30;2&09:30;3&09:30;',
      multiEmail: 'Separate multiple emails with commas',
      chatIdExample: 'For example: 123456789 or -100xxxxxxxxxx',
      gotifyUrl: 'https://gotify.example.com',
      webhookUrl: 'https://example.com/hook',
      aiBaseUrl: 'https://api.deepseek.com',
      customHeaders:
        'Supports a JSON object or one header per line, for example:\nContent-Type: application/json\nX-App: SubTracker',
      customRecognitionPrompt:
        'Leave empty to use the system recognition prompt. Dashboard AI summaries always use the system summary prompt.',
      customSummaryPrompt: 'Leave empty to use the system summary prompt.'
    },
    summary: {
      baseCurrencyTag: 'Base {currency}',
      supportedCurrenciesTag: '{count} currencies supported',
      selectCurrenciesToConvert: 'Select currencies to convert',
      emailResend: 'Resend · To: {to}',
      emailSmtp: 'Host: {host} · To: {to}'
    },
    channels: {
      email: 'Email notifications',
      pushplus: 'PushPlus',
      telegram: 'Telegram Bot',
      serverchan: 'ServerChan',
      gotify: 'Gotify',
      webhook: 'Webhook'
    },
    options: {
      emailProvider: {
        smtp: 'SMTP',
        resend: 'Resend'
      },
      aiProviderPreset: {
        custom: 'Custom',
        aliyunBailian: 'Alibaba Bailian',
        tencentHunyuan: 'Tencent Hunyuan',
        volcengineArk: 'Volcengine Ark'
      }
    },
    validation: {
      emailMissingFields: 'Email notification is missing required fields: {fields}',
      pushplusMissingFields: 'PushPlus is missing required fields: {fields}',
      telegramMissingFields: 'Telegram is missing required fields: {fields}',
      serverchanMissingFields: 'ServerChan is missing required fields: {fields}',
      gotifyMissingFields: 'Gotify is missing required fields: {fields}',
      webhookMissingFields: 'Webhook is missing required fields: {fields}',
      aiMissingFields: 'AI settings are missing required fields: {fields}'
    },
    messages: {
      basicSaved: 'Basic settings saved',
      basicSaveFailed: 'Failed to save basic settings',
      emailSaved: 'Email notification settings saved',
      emailDisabled: 'Email notifications disabled',
      pushplusSaved: 'PushPlus settings saved',
      pushplusDisabled: 'PushPlus disabled',
      telegramSaved: 'Telegram settings saved',
      telegramDisabled: 'Telegram disabled',
      serverchanSaved: 'ServerChan settings saved',
      serverchanDisabled: 'ServerChan disabled',
      gotifySaved: 'Gotify settings saved',
      gotifyDisabled: 'Gotify disabled',
      aiSaved: 'AI settings saved',
      aiDisabled: 'AI disabled',
      aiConnectionTestSuccess: 'Connection test succeeded: {provider} / {model} / {response}',
      aiConnectionTestFailed: 'AI connection test failed',
      aiVisionTestSuccess: 'Vision test succeeded: {provider} / {model} / {response}',
      aiVisionTestFailed: 'AI vision test failed',
      ratesRefreshed: 'Exchange rates refreshed',
      credentialsUpdated: 'Credentials updated',
      emailTestSent: 'Test email sent',
      emailTestFailed: 'Email test failed',
      pushplusTestSubmittedWithCode: 'PushPlus test request submitted. Ticket: {code}',
      pushplusTestSubmitted: 'PushPlus test request submitted',
      pushplusTestFailed: 'PushPlus test failed',
      telegramTestSent: 'Telegram test message sent',
      telegramTestFailed: 'Telegram test failed',
      serverchanTestSent: 'ServerChan test message sent',
      serverchanTestFailed: 'ServerChan test failed',
      gotifyTestSent: 'Gotify test message sent',
      gotifyTestFailed: 'Gotify test failed',
      zipExportStarted: 'ZIP export started',
      zipExportFailed: 'ZIP export failed',
      backupRestored: 'Backup restored',
      backupAppendedWithSettings: 'Backup appended and system settings overwritten',
      backupAppended: 'Backup appended',
      wallosImported: 'Wallos data imported',
      webhookSaved: 'Webhook settings saved',
      webhookDisabled: 'Webhook disabled',
      webhookTestSuccessWithPreview: 'Webhook test succeeded, HTTP {statusCode}: {preview}',
      webhookTestSuccess: 'Webhook test succeeded, HTTP {statusCode}',
      webhookTestFailed: 'Webhook test failed'
    },
    about: {
      releaseNotes: 'Release Notes',
      license: 'License',
      issues: 'Issues and Requests',
      author: 'The author',
      documentation: 'Documentation',
      readmeDeployment: 'README / DEPLOYMENT',
      credits: {
        wallos: 'Wallos',
        vueVite: 'Vue 3 / Vite',
        naiveUi: 'Naive UI',
        fastifyPrisma: 'Fastify / Prisma',
        piniaTanstackEcharts: 'Pinia / TanStack Query / ECharts'
      }
    }
  },
  dashboard: {
    page: {
      title: 'Dashboard',
      subtitle: 'Overview subscription scale, budget usage, upcoming renewals, and spend distribution'
    },
    cards: {
      activeSubscriptions: 'Active subscriptions',
      renewalsIn7Days: 'Renewals in 7 days',
      estimatedMonthlySpend: 'Estimated monthly spend',
      estimatedYearlySpend: 'Estimated yearly spend'
    },
    sections: {
      monthlyBudgetUsage: 'Monthly budget usage',
      yearlyBudgetUsage: 'Yearly budget usage',
      tagBudgetOverview: 'Tag budget overview',
      tagMonthlySpend: 'Tag monthly spend',
      monthlyTrend: 'Monthly payment trend (next 12 months)',
      upcoming30: 'Upcoming renewals (30 days)'
    },
    labels: {
      usedPrefix: 'Used',
      budgetPrefix: '/ Budget',
      configuredTagBudgets: 'Configured tag budgets',
      nearingBudget: 'Near budget',
      overBudget: 'Over budget',
      topUsageRate: 'Top usage rate'
    },
    empty: {
      noMonthlyBudget: 'No monthly budget set',
      noYearlyBudget: 'No yearly budget set',
      noTagBudgetConfigured: 'No tag budgets configured',
      noData: 'No data'
    },
    table: {
      subscription: 'Subscription',
      nextRenewal: 'Next renewal',
      originalAmount: 'Original amount',
      convertedAmount: 'Converted amount',
      status: 'Status'
    }
  },
  budgets: {
    page: {
      title: 'Budget statistics',
      subtitle: 'Review overall budget usage and tag monthly budget analysis'
    },
    sections: {
      monthlyBudgetUsage: 'Monthly budget usage',
      yearlyBudgetUsage: 'Yearly budget usage',
      tagBudgetUsageRate: 'Tag budget usage rate',
      budgetSummary: 'Budget summary',
      topUsageRate: 'Top 3 usage rates',
      tagBudgetUsageTable: 'Tag budget usage table',
      tagBudget: 'Tag budgets'
    },
    labels: {
      usedPrefix: 'Used',
      budgetPrefix: '/ Budget',
      configuredTagBudgets: 'Configured tag budgets',
      nearingBudget: 'Near budget',
      overBudget: 'Over budget',
      tag: 'Tag',
      spent: 'Spent',
      budget: 'Budget',
      remainingOrOver: 'Remaining / Over',
      usageRate: 'Usage rate',
      status: 'Status',
      remainingPrefix: 'Remaining',
      overPrefix: 'Over'
    },
    empty: {
      noMonthlyBudget: 'No monthly budget set',
      noYearlyBudget: 'No yearly budget set',
      noTagBudgetData: 'No tag budget data',
      noConfiguredTagBudgets: 'No tag budgets configured'
    },
    hints: {
      section: 'Tag monthly budgets are independent from overall budgets and only apply to tags with configured budgets.'
    },
    buttons: {
      setTagBudgets: 'Set tag monthly budgets'
    },
    status: {
      normal: 'Normal',
      warning: 'Near budget',
      over: 'Over budget'
    },
    messages: {
      saved: 'Tag monthly budgets saved'
    }
  },
  calendar: {
    page: {
      title: 'Subscription calendar',
      subtitle: 'Review subscription date distribution with month and list views'
    },
    cards: {
      currentMonth: 'Current month',
      currentMonthSuffix: 'Currently viewed month',
      monthlyRenewalCount: 'Renewals this month',
      monthlyRenewalCountSuffix: 'Subscriptions in the current month',
      monthlySpend: 'Estimated spend this month',
      convertedSuffix: 'Converted by exchange rate',
      selectedDateRenewals: 'Renewals on selected date'
    },
    tabs: {
      month: 'Month view',
      list: 'List view'
    },
    detail: {
      dayRenewalsTitle: 'Renewals on {date}',
      dayRenewalsSummary: '{count} items · {currency} {amount}',
      noRenewalOnDay: 'No renewals on this day',
      converted: 'Converted',
      itemsSuffix: 'items'
    },
    table: {
      subscription: 'Subscription',
      date: 'Date',
      amount: 'Original amount',
      convertedAmount: 'Converted amount',
      status: 'Status'
    }
  },
  statistics: {
    page: {
      title: 'Expense statistics',
      subtitle: 'Analyze subscription spend through trend, structure, and risk'
    },
    ai: {
      title: 'AI summary',
      generatedAtPrefix: 'Last generated: ',
      collapseDetails: 'Collapse details',
      viewDetails: 'View details',
      regenerate: 'Regenerate summary',
      expandedHint: 'Generated from current statistics and does not modify subscription data',
      generatingHint: 'Generating an AI summary from current statistics, please wait...',
      unconfiguredHint: 'Enable AI and AI summaries in Settings first. The statistics page will then generate summaries automatically.',
      failedFallback: 'AI summary generation failed. Please try again later.',
      noSummary: 'No AI summary',
      previewLabel: 'Preview',
      updated: 'AI summary updated',
      failed: 'Failed to generate AI summary'
    },
    sections: {
      monthlyTrend: 'Monthly payment trend (next 12 months)',
      tagSpend: 'Tag monthly spend share',
      statusDistribution: 'Status distribution',
      autoRenewShare: 'Auto-renew share',
      currencyDistribution: 'Subscription currency distribution',
      upcoming30: 'Renewal distribution in the next 30 days',
      top10: 'Top 10 monthly subscription spend'
    },
    empty: {
      noData: 'No data',
      noUpcoming30: 'No renewals in the next 30 days'
    },
    series: {
      trend: 'Projected amount',
      renewalCount: 'Renewals',
      amount: 'Amount'
    },
    labels: {
      renewalsCountAxis: 'Renewals',
      autoRenew: 'Auto renew',
      manualRenew: 'Manual renew',
      renewalCountTooltip: 'Subscriptions',
      amountTooltip: 'Monthly amount'
    },
    status: {
      active: 'Active',
      paused: 'Paused',
      cancelled: 'Cancelled',
      expired: 'Expired'
    }
  },
  tags: {
    manage: {
      title: 'Tag management',
      description: 'Create, edit, and delete tags here.',
      create: 'New tag',
      tag: 'Tag',
      sortOrder: 'Order',
      subscriptionCount: 'Subscriptions',
      actions: 'Actions',
      deleteInUseConfirm: 'Deleting this tag removes it from subscriptions. Continue?',
      deleteConfirm: 'Delete this tag?'
    },
    form: {
      editTitle: 'Edit tag',
      createTitle: 'New tag',
      nameLabel: 'Tag name',
      namePlaceholder: 'Example: Cloud services',
      colorLabel: 'Color',
      colorPlaceholder: '#3b82f6 or rgb(59,130,246)',
      sortOrderLabel: 'Order'
    },
    budget: {
      title: 'Set tag monthly budgets',
      description: 'Set monthly budgets for tags that need separate spend control. Tags without a budget are excluded from tag budget analysis.',
      searchPlaceholder: 'Search tags',
      budgetPlaceholder: 'Not set ({currency})'
    }
  },
  subscriptions: {
    page: {
      title: 'Subscriptions',
      subtitle: 'Manage subscriptions across billing cycles and currencies',
      searchPlaceholder: 'Search by name or description',
      statusPlaceholder: 'Status',
      sortPlaceholder: 'Sort by',
      collapseTagFilter: 'Collapse tag filter',
      expandTagFilter: 'Expand tag filter',
      listTitle: 'Subscription list',
      noSubscriptions: 'No subscriptions',
      selectedItems: '{count} selected',
      selectCurrentPage: 'Select current page',
      clearSelection: 'Clear selection',
      batchMode: 'Batch mode',
      exitBatchMode: 'Exit batch mode',
      dragHandleEnabledTitle: 'Drag to reorder',
      dragHandleDisabledTitle: 'Drag sorting is unavailable for the current sort mode'
    },
    sort: {
      custom: 'Custom order',
      renewal: 'By next renewal',
      amountDesc: 'By amount descending',
      name: 'By name'
    },
    status: {
      active: 'Active',
      paused: 'Paused',
      cancelled: 'Cancelled',
      expired: 'Expired'
    },
    actions: {
      tagManagement: 'Tag management',
      create: 'New subscription',
      batchRenew: 'Batch renew',
      setActive: 'Set active',
      setPaused: 'Set paused',
      setCancelled: 'Set cancelled',
      batchDelete: 'Batch delete',
      reorder: 'Reorder',
      finishReorder: 'Done reordering',
      detail: 'Details',
      records: 'Records',
      edit: 'Edit',
      renew: 'Renew',
      pause: 'Pause',
      cancel: 'Cancel',
      resume: 'Resume'
    },
    labels: {
      nextRenewal: 'Next renewal',
      autoRenew: 'Auto renew',
      note: 'Notes:',
      currentCycle: 'Current cycle',
      remainingValue: 'Remaining value',
      interval: 'Billing interval',
      originalAmount: 'Original amount',
      advanceReminders: 'Advance reminders',
      overdueReminders: 'Overdue reminders'
    },
    values: {
      interval: 'Every {count} {unit}'
    },
    confirm: {
      pause: 'Pause this subscription?',
      cancel: 'Cancel this subscription?',
      resume: 'Resume this subscription to active status?',
      delete: 'Delete "{name}" and its renewal records/history? This action cannot be undone.'
    },
    messages: {
      subscriptionUpdated: 'Subscription updated',
      subscriptionCreated: 'Subscription created',
      subscriptionSaveFailed: 'Save failed: {message}',
      tagCreated: 'Tag created',
      tagCreateFailed: 'Failed to create tag: {message}',
      tagUpdated: 'Tag updated',
      tagUpdateFailed: 'Failed to update tag: {message}',
      tagDeleted: 'Deleted tag: {name}',
      tagDeleteFailed: 'Failed to delete tag: {message}',
      resetToCurrent: 'Reset to the current subscription content',
      resetForm: 'Form reset',
      logoSearchEmpty: 'No logos found',
      logoSearchFailed: 'Failed to search logos',
      localLogoLoadFailed: 'Failed to load local logos',
      localLogoFirst: 'No name or website provided, showing saved local logos first.',
      logoSavedAndApplied: 'Saved locally and applied',
      logoImportFailed: 'Failed to import logo',
      logoReused: 'Reused from local library',
      localLogoDeleted: 'Local logo deleted',
      logoDeleteFailed: 'Failed to delete logo',
      logoUploadSuccess: 'Logo uploaded successfully',
      logoUploadFailed: 'Failed to upload logo',
      chooseRequiredDates: 'Select the start date and next renewal date',
      dragSortEnabled: 'Drag sorting enabled. Use the handle to reorder items.',
      orderUpdated: 'Order updated',
      orderUpdateFailed: 'Failed to update sort order',
      batchActionSuccess: '{label} succeeded for {count} items',
      batchActionPartial: '{label} finished: {success} succeeded, {failure} failed',
      batchDeleteSuccess: 'Batch delete succeeded for {count} items',
      batchDeletePartial:
        'Batch delete finished: deleted {success} items, skipped {skipped} active items, and failed {failure} items',
      renewed: 'Renewed: {name}',
      paused: 'Paused',
      resumed: 'Resumed',
      cancelled: 'Cancelled',
      deleted: 'Deleted: {name}'
    },
    batch: {
      selectFirst: 'Select subscriptions first',
      renewSuccess: 'Batch renew succeeded for {count} items',
      renewPartial: 'Batch renew finished: {success} succeeded, {failure} failed',
      statusConfirm: 'Set the selected {count} subscriptions to {status}?',
      deleteConfirmAll: 'Delete the selected {count} subscriptions? This action cannot be undone.',
      deleteConfirmPartial:
        'Delete subscriptions in batch? {deletable} items will be deleted and {blocked} active items will be skipped. This action cannot be undone.'
    },
    detail: {
      title: 'Subscription details',
      remainingDays: '{days} days remaining / {ratio}'
    },
    form: {
      titleCreate: 'Create subscription',
      titleEdit: 'Subscription details',
      savingDescription: 'Saving, please wait...',
      namePlaceholder: 'For example: GitHub Pro',
      descriptionPlaceholder: 'Optional, briefly describe the subscription',
      amountPlaceholder: 'Enter an amount, use 0 for free subscriptions',
      currencyPlaceholder: 'Select a currency',
      frequencyPlaceholder: 'Select frequency',
      unitPlaceholder: 'Select a unit',
      tagPlaceholder: 'Select tags',
      websiteLabel: 'Official / platform URL',
      nextRenewalLabel: 'Next renewal',
      recalculateNextRenewal: 'Recalculate next renewal based on start date and billing interval',
      advanceReminderRulesPlaceholder: 'Leave empty to use the system default, e.g. 3&09:30;0&09:30;',
      overdueReminderRulesPlaceholder: 'Leave empty to use the system default, e.g. 1&09:30;2&09:30;',
      notesPlaceholder: 'Optional, record account, plan, or special notes',
      notificationEnabledLabel: 'Enable reminder notifications',
      logo: {
        upload: 'Click to upload',
        placeholder: 'Logo',
        panelTitle: 'Select a logo',
        webTab: 'Web search ({count})',
        libraryTab: 'Saved locally ({count})',
        searching: 'Searching for logos...',
        noSearchResults: 'No web search results are available right now',
        loadingLocal: 'Loading local logos...',
        noLocalResults: 'No reusable local logos yet',
        usedCount: 'Used {count} times',
        source: {
          upload: 'Local upload',
          remote: 'Remote import',
          wallosZip: 'Wallos ZIP',
          local: 'Local library'
        }
      },
      actions: {
        aiRecognize: 'AI fill',
        previewReminderRules: 'Preview reminders',
        collapseReminderPreview: 'Hide reminder preview'
      }
    },
    aiModal: {
      title: 'AI subscription recognition',
      description:
        'Enter text, upload an image, or paste a screenshot directly. If the current model does not support image recognition, the system falls back to local OCR before sending text to the model. Results only fill the form and are not saved automatically.',
      loading: 'Recognizing, please wait...',
      loadingHint: 'The result appears automatically when ready. No need to click again.',
      textInput: 'Text input',
      textLabel: 'Text',
      textPlaceholder: 'Paste subscription emails, payment records, order text, and more',
      imageInput: 'Image input',
      imageLabel: 'Image',
      uploadImage: 'Upload image',
      clearImage: 'Clear image',
      imageTip: 'Supports screenshot upload and direct paste',
      pasteHint: 'You can also paste a screenshot directly here',
      imagePreviewAlt: 'Recognition image preview',
      confidence: 'Confidence',
      confidenceWithValue: 'Confidence: {value}%',
      recognize: 'Start recognition',
      recognizing: 'Recognizing',
      applyResult: 'Apply result',
      resultTitle: 'Recognition result',
      rawText: 'Raw extracted text',
      rawTextTitle: 'Raw extracted text',
      result: 'Recognition result',
      noInput: 'Enter text or upload an image first',
      pleaseProvideInput: 'Enter text or upload an image first',
      recognitionCompleted: 'Recognition completed',
      recognitionFailed: 'AI recognition failed',
      field: 'Field',
      recognizedResult: 'Recognized result',
      fields: {
        name: 'Name',
        description: 'Description',
        amount: 'Amount',
        currency: 'Currency',
        billingIntervalCount: 'Frequency',
        billingIntervalUnit: 'Unit',
        startDate: 'Start date',
        nextRenewalDate: 'Next renewal',
        notifyDaysBefore: 'Reminder days',
        websiteUrl: 'Website',
        notes: 'Notes'
      }
    },
    paymentRecords: {
      title: 'Renewal records',
      noData: 'No renewal records',
      renewedAt: 'Renewed at',
      convertedAmount: 'Converted amount',
      periodStart: 'Period start',
      periodEnd: 'Period end'
    },
    backupModal: {
      title: 'Restore backup',
      description:
        'This ZIP restores subscriptions, tags, payment records, ordering, settings, and local logos. It does not restore credentials, session secrets, webhook history, or exchange rate snapshots.',
      pickZip: 'Choose ZIP file',
      noFileSelected: 'No file selected',
      previewBackup: 'Preview backup',
      subscriptions: 'Subscriptions',
      tags: 'Tags',
      paymentRecords: 'Payment records',
      localLogos: 'Local logos',
      restoreMode: 'Restore mode',
      replaceMode: 'Clear existing data and restore',
      appendMode: 'Keep existing data and append restore',
      replaceWarning:
        'This deletes current subscriptions, tags, payment records, ordering, settings, and local logos before restoring from the file.',
      appendHelp:
        'For append restore: tags with the same name are reused; subscriptions and payment records are skipped idempotently by backup CUID; settings overwrite is controlled separately.',
      restoreSettingsLabel: 'Also overwrite current settings',
      restorePreview: 'Restore preview',
      existingSameNameTags: 'Existing tags with the same name:',
      existingSubscriptions: 'Existing subscriptions with the same CUID:',
      existingPaymentRecords: 'Existing payment records with the same CUID:',
      warnings: 'Warnings',
      confirmRestore: 'Confirm restore',
      invalidZip: 'The backup ZIP could not be parsed',
      previewFailed: 'Failed to preview backup',
      previewGenerated: 'Backup preview generated',
      nothingImported: 'No new data was imported. Duplicate entries were skipped automatically.',
      restoreCompleted: 'Restore completed: {subscriptions} subscriptions, {tags} new tags, {payments} payment records, {logos} logos',
      restoreFailed: 'Restore failed'
    }
  },
  imports: {
    wallos: {
      title: 'Import Wallos data',
      description: 'Upload Wallos JSON, SQLite database, or ZIP files. Only tags actually used by subscriptions are imported.',
      pickFile: 'Choose file',
      preview: 'Generate preview',
      confirmImport: 'Confirm import',
      previewTitle: 'Import preview',
      warningTitle: 'Warnings',
      sourceTimezoneLabel: 'Wallos source timezone (advanced)',
      sourceTimezonePlaceholder: 'Defaults to the current business timezone',
      sourceTimezoneHint: 'Adjust this only if the exported Wallos instance used a different TZ. Otherwise keep the default.',
      importTypeLabel: 'Import type',
      importableSubscriptionsLabel: 'Importable subscriptions',
      importedTagsLabel: 'Imported tags',
      zipLogoLabel: 'ZIP logo matches',
      tagPreviewTitle: 'Tag preview',
      noImportableTags: 'No importable tags',
      subscriptionPreviewTitle: 'Subscription preview',
      jsonWarning:
        'Wallos JSON import detected. Wallos DB import is recommended first because the DB includes more complete data such as start_date and full currency codes. JSON can still be imported, but some fields may degrade, such as inferred currency or fallback start dates.',
      noWarnings: 'No extra warnings',
      warningCount: '{count} warnings',
      sourceId: 'Source ID',
      tagName: 'Tag name',
      order: 'Order',
      name: 'Name',
      amount: 'Amount',
      frequency: 'Frequency',
      nextRenewal: 'Next renewal',
      tags: 'Tags',
      noTags: 'No tags',
      autoRenew: 'Auto renew',
      yes: 'Yes',
      no: 'No',
      status: 'Status',
      logo: 'Logo',
      logoNone: 'None',
      logoPending: 'Pending match',
      logoReady: 'Ready from ZIP',
      previewGenerated: 'Import preview generated',
      previewFailed: 'Failed to generate preview',
      importCompleted: 'Import completed: {subscriptions} subscriptions, {tags} tags, {logos} logos',
      importFailed: 'Import failed',
      fileTypes: {
        json: 'JSON',
        db: 'SQLite',
        zip: 'ZIP'
      }
    }
  },
  notifications: {
    channels: {
      email: 'Email',
      pushplus: 'PushPlus',
      telegram: 'Telegram',
      serverchan: 'ServerChan',
      gotify: 'Gotify',
      webhook: 'Webhook'
    },
    status: {
      success: 'Success',
      skipped: 'Skipped',
      failed: 'Failed'
    },
    phases: {
      summary: 'Subscription reminder summary',
      upcoming: 'Upcoming renewals',
      dueToday: 'Due today',
      overdue: 'Overdue reminders',
      daysUntil: 'Due in {days} days',
      overdueDay: 'Overdue day {days}'
    },
    labels: {
      reminderType: 'Reminder type: {value}',
      subscriptionCount: 'Subscriptions: {count}',
      subscriptionName: 'Subscription: {name}',
      date: 'Date: {value}',
      amount: 'Amount: {value}',
      details: 'Details: {value}',
      tags: 'Tags: {value}',
      website: 'Website: {value}',
      notes: 'Notes: {value}',
      sectionTitle: '{title} ({count})'
    },
    values: {
      daysUntil: '{days} days left',
      overdueDays: '{days} days overdue'
    },
    titles: {
      summaryCount: '{phase}: {count} subscriptions',
      single: '{phase}: {name}'
    },
    forgotPassword: {
      title: 'SubTracker password reset verification code',
      username: 'Username: {username}',
      code: 'Verification code: {code}',
      expiresInMinutes: 'Expires in: {minutes} minutes',
      ignoreHint: 'If this was not requested by you, you can ignore this notification.'
    },
    tests: {
      subscriptionName: 'Test subscription',
      tagName: 'Test tag',
      note: 'This is a test notification.'
    }
  },
  validation: {
    websiteUrlInvalid: 'Enter a valid URL, for example https://example.com',
    subscriptionForm: {
      nameRequired: 'Enter a name',
      nameTooLong: 'Name cannot exceed 150 characters',
      descriptionTooLong: 'Description cannot exceed 500 characters',
      amountInvalid: 'Enter a valid amount',
      currencyInvalid: 'Select a valid currency',
      billingIntervalCountInvalid: 'Frequency must be a positive integer',
      billingIntervalUnitRequired: 'Select a billing interval unit',
      startDateRequired: 'Select a start date',
      nextRenewalDateRequired: 'Select the next renewal date',
      nextRenewalDateEarlierThanStartDate: 'The next renewal date cannot be earlier than the start date',
      notesTooLong: 'Notes cannot exceed 1000 characters'
    },
    reminderRules: {
      fallback: 'Use system default',
      emptyTitle: 'Enter rules before previewing',
      resultTitle: 'Preview result',
      invalidTitle: 'Invalid rule format',
      defaultRulesLabel: 'system default rules',
      defaultAdvanceRulesLabel: 'System default advance rules',
      defaultOverdueRulesLabel: 'System default overdue rules',
      fallbackPreviewTitle: 'No value entered. Previewing with {label}',
      fallbackInvalidTitle: '{label} is invalid',
      noAdvance: 'No advance reminder rules',
      noOverdue: 'No overdue reminder rules',
      parseFailed: 'Failed to parse rules',
      invalidSegmentFormat: 'Rule "{segment}" is invalid. Expected format: days&HH:mm',
      invalidDaysInteger: 'The days value in rule "{segment}" must be an integer',
      invalidOverdueDays: 'The days value in rule "{segment}" must be greater than or equal to 1',
      invalidAdvanceDays: 'The days value in rule "{segment}" cannot be less than 0',
      invalidTime: 'The time value in rule "{segment}" must use HH:mm',
      inlineAdvanceSameDay: 'On the due day at {time}',
      inlineAdvanceBefore: '{days} day(s) before at {time}',
      inlineOverdue: '{days} overdue day(s) at {time}',
      evalAdvanceSameDay: 'Remind on the due day at {time}',
      evalAdvanceBefore: 'Remind {days} day(s) before at {time}',
      evalOverdue: 'Remind {days} overdue day(s) later at {time}'
    }
  },
  ai: {
    status: {
      textFast: 'Recognizing. This usually finishes within a few seconds. Please do not click repeatedly.',
      textSlow: 'Still recognizing. The model may be responding slowly, please wait a little longer.',
      imageFast: 'Recognizing image and text. This usually takes 5-10 seconds. Please do not close the window.',
      imageSlow: 'Image recognition is still running. The external model is responding slowly, please wait a bit longer.'
    },
    prompts: {
      subscription: {
        default: `You are a subscription billing extractor. Extract subscription details from the input text or screenshot and return JSON only.
Output fields:
- name
- description
- amount
- currency
- billingIntervalCount
- billingIntervalUnit(day|week|month|quarter|year)
- startDate(YYYY-MM-DD)
- nextRenewalDate(YYYY-MM-DD)
- notifyDaysBefore
- websiteUrl
- notes
- confidence(0~1)
- rawText

Rules:
1. Leave uncertain fields empty. Do not guess.
2. Amount must be numeric.
3. Currency must be a 3-letter uppercase code such as CNY or USD.
4. billingIntervalUnit must be one of day/week/month/quarter/year.
5. Return JSON only. Do not return Markdown.`
      },
      dashboard: {
        summary: {
          default: `You are a subscription operations summary assistant. Based on the user's current subscription statistics, generate a concise, accurate, and actionable Markdown summary.

Goals:
1. Help the user quickly understand subscription scale, spending structure, budget pressure, and short-term renewal risk.
2. Summarize clear patterns, anomalies, and items worth attention in the data.
3. Provide neutral, actionable advice without relying on knowledge of specific subscription services.

Hard requirements:
- Analyze only the input data. Do not invent facts.
- Do not assume you understand the feature details of any subscription service.
- Do not suggest things like "canceling a service saves money" or "two services overlap".
- Do not speculate about user preference, usage frequency, or intent.
- Do not output JSON or code blocks. Output Markdown body only.

Suggested output structure:
## Overview
## Spending structure
## Near-term risk
## Notable patterns
## Neutral suggestions

Writing requirements:
- Use clear English.
- Be decisive and concise.
- Keep each section to 2 to 5 bullets.
- If a section has no clear anomaly, say so directly.`
        },
        user: {
          request: 'Here are the current subscription statistics. Generate a Markdown summary:\n\n{payload}'
        },
        preview: {
          default: `You are a summary compression assistant. Based on an already generated full AI summary, condense it into a very short preview suitable for a collapsed default view.

Hard requirements:
- Output plain English text only. No Markdown and no code blocks.
- Output 2 to 3 lines, one sentence per line, with natural line breaks.
- Do not output a title, bullets, or numbering.
- Keep only the most important conclusions: subscription scale, budget pressure, and short-term risk.
- Do not add information that was not present in the original summary.
- If the original summary is limited, return 1 to 2 natural sentences directly.`
        },
        previewUser: {
          request: 'Here is the full AI summary that has already been generated. Condense it into a very short default collapsed preview:\n\n{payload}'
        }
      }
    }
  },
  api: {
    errors: {
      unauthorized: 'Please sign in first',
      tooManyAttempts: 'Too many failed sign-in attempts. Please try again later.',
      internal: 'Unknown server error',
      logoNotFound: 'Logo not found',
      conflict: 'Resource conflict',
      validation: {
        invalidSettingsPayload: 'Invalid settings payload',
        invalidReminderRules: 'Invalid reminder rules',
        invalidEmailConfigPayload: 'Invalid email config payload',
        invalidPushplusConfigPayload: 'Invalid PushPlus config payload',
        invalidTelegramConfigPayload: 'Invalid Telegram config payload',
        invalidServerchanConfigPayload: 'Invalid ServerChan config payload',
        invalidGotifyConfigPayload: 'Invalid Gotify config payload',
        invalidWebhookSettingsPayload: 'Invalid webhook settings payload',
        invalidForgotPasswordRequestPayload: 'Invalid forgot password request payload',
        invalidForgotPasswordResetPayload: 'Invalid forgot password reset payload',
        invalidPasswordPayload: 'Invalid password payload',
        invalidCredentialsPayload: 'Invalid credentials payload',
        invalidAiConfigPayload: 'Invalid AI config payload',
        invalidScanDebugPayload: 'Invalid notification scan debug payload',
        invalidWallosInspectPayload: 'Invalid Wallos inspect payload',
        invalidWallosCommitPayload: 'Invalid Wallos import payload',
        invalidSubtrackerBackupInspectPayload: 'Invalid SubTracker backup inspect payload',
        invalidSubtrackerBackupCommitPayload: 'Invalid SubTracker backup commit payload',
        invalidTagPayload: 'Invalid tag payload',
        invalidTagId: 'Invalid tag id',
        invalidCurrentVersionQuery: 'Invalid currentVersion query',
        invalidLogoSearchPayload: 'Invalid logo search payload',
        invalidLogoFilename: 'Invalid logo filename',
        invalidLogoUploadPayload: 'Invalid logo upload payload',
        invalidLogoImportPayload: 'Invalid logo import payload',
        invalidQuery: 'Invalid query',
        invalidReorderPayload: 'Invalid reorder payload',
        invalidBatchRenewPayload: 'Invalid batch renew payload',
        invalidBatchStatusPayload: 'Invalid batch status payload',
        invalidBatchPausePayload: 'Invalid batch pause payload',
        invalidBatchCancelPayload: 'Invalid batch cancel payload',
        invalidBatchDeletePayload: 'Invalid batch delete payload',
        invalidSubscriptionId: 'Invalid subscription id',
        invalidSubscriptionPayload: 'Invalid subscription payload',
        invalidUpdatePayload: 'Invalid update payload',
        invalidRenewPayload: 'Invalid renew payload',
        invalidWebhookUrlRequired: 'URL is required when Webhook is enabled'
      },
      auth: {
        invalidCredentials: 'Incorrect username or password',
        currentCredentialsInvalid: 'Incorrect current username or password',
        defaultPasswordChangeNotAllowed: 'Default password change is not allowed right now',
        forgotPasswordDisabled: 'Forgot password is disabled or no available notification channel is configured.',
        forgotPasswordRequestRateLimited: 'Verification codes are being requested too frequently. Please try again later.',
        forgotPasswordRequestCooldown: 'A verification code was just sent. Please try again later.',
        forgotPasswordDeliveryFailed: 'Failed to send the verification code. Check the notification configuration.',
        forgotPasswordResetRateLimited: 'Too many failed verification attempts. Please try again later.',
        forgotPasswordChallengeNotFound: 'The verification code is invalid or has expired.',
        forgotPasswordAttemptsExhausted: 'No verification attempts remain. Request a new code.',
        forgotPasswordCodeInvalid: 'Too many incorrect verification attempts. Request a new code.',
        forgotPasswordCodeInvalidWithAttempts: 'Incorrect verification code. {attempts} attempt(s) remaining.',
        forgotPasswordResetFailed: 'Failed to reset the password',
        forgotPasswordChannelRequired: 'Enable at least one direct notification channel before turning on forgot password.'
      },
      settings: {
        emailFieldsRequired: 'To enable Email notifications, fill in: {fields}',
        pushplusTokenRequired: 'To enable PushPlus, fill in Token',
        telegramFieldsRequired: 'To enable Telegram notifications, fill in: {fields}',
        serverchanSendKeyRequired: 'To enable ServerChan, fill in SendKey',
        gotifyFieldsRequired: 'To enable Gotify, fill in: {fields}',
        aiFieldsRequired: 'To enable AI capability, fill in: {fields}'
      },
      ai: {
        disabled: 'AI capability is disabled',
        configIncomplete: 'AI configuration is incomplete',
        summaryDisabled: 'AI summary is disabled',
        summaryConfigIncomplete: 'AI summary configuration is incomplete',
        invalidRecognitionInput: 'Invalid AI recognition input',
        noValidContent: 'AI did not return valid content',
        noRecognizableText: 'No text content is available for recognition',
        ocrNoValidText: 'OCR did not extract valid text from the image. Enter the text manually instead.',
        connectionTestFailed: 'AI connection test failed',
        visionTestFailed: 'AI vision test failed',
        recognitionFailed: 'AI recognition failed',
        summaryRequestFailed: 'AI summary request failed',
        summaryEmpty: 'AI summary returned empty content',
        summaryPreviewRequestFailed: 'AI summary preview request failed',
        summaryPreviewEmpty: 'AI summary preview returned empty content',
        summaryFetchFailed: 'Failed to fetch AI summary',
        summaryGenerateFailed: 'Failed to generate AI summary'
      },
      notifications: {
        emailDisabledOrIncomplete: 'Email notifications are disabled or incomplete',
        pushplusDisabledOrIncomplete: 'PushPlus notifications are disabled or incomplete',
        telegramDisabledOrIncomplete: 'Telegram notifications are disabled or incomplete',
        serverchanDisabledOrIncomplete: 'ServerChan notifications are disabled or incomplete',
        gotifyDisabledOrIncomplete: 'Gotify notifications are disabled or incomplete',
        webhookConfigIncomplete: 'Webhook configuration is incomplete',
        webhookTestFailed: 'Webhook test failed',
        emailTestFailed: 'Email test failed',
        pushplusTestFailed: 'PushPlus test failed',
        telegramTestFailed: 'Telegram test failed',
        serverchanTestFailed: 'ServerChan test failed',
        gotifyTestFailed: 'Gotify test failed'
      },
      imports: {
        wallosInspectFailed: 'Wallos inspect failed',
        wallosCommitFailed: 'Wallos import failed',
        subtrackerBackupInspectFailed: 'SubTracker backup inspect failed',
        subtrackerBackupCommitFailed: 'SubTracker backup restore failed'
      },
      tags: {
        nameExists: 'Tag name already exists',
        updateFailed: 'Failed to update tag',
        notFound: 'Tag not found'
      },
      version: {
        updateFetchFailed: 'Failed to fetch version updates'
      },
      exchangeRates: {
        refreshFailed: 'Failed to refresh exchange rates'
      },
      subscriptions: {
        notFound: 'Subscription not found',
        logoDeleteFailed: 'Failed to delete logo',
        logoUploadFailed: 'Failed to upload logo',
        logoImportFailed: 'Failed to import logo',
        renewFailed: 'Renew failed',
        activeDeleteNotAllowed: 'Active subscriptions cannot be deleted directly. Pause or cancel them first.',
        batchPauseOnlyActive: 'Only active subscriptions can be paused in batch mode',
        batchCancelOnlyActive: 'Only active subscriptions can be cancelled in batch mode',
        activeDeleteBlocked: 'Active subscriptions cannot be deleted directly',
        websiteUrlInvalid: 'websiteUrl is invalid. Enter a valid URL'
      }
    }
  }
} as const
