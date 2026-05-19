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
      connectionTest: 'Test connection',
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
      autoRenew: 'Auto-renew',
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
      topic: 'Topic',
      gotifyTargetUrl: 'Gotify URL',
      webhookTargetUrl: 'Webhook URL'
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
      list: ', ',
      fieldList: ', ',
      notificationDetail: '; '
    },
    locales: {
      zhCN: '简体中文',
      enUS: 'English'
    },
    units: {
      day: 'day',
      week: 'week',
      month: 'month',
      quarter: 'quarter',
      year: 'year',
      minutes: 'minutes'
    }
  },
  app: {
    brand: 'SubTracker',
    shellTitle: 'Subscription Console',
    shellSubtitle: 'Multi-currency · Reminders · Analytics · Calendar',
    notSignedIn: 'Not signed in',
    changeDefaultPasswordTitle: 'Change default password first',
    changeDefaultPasswordWarning: 'You are still using the default admin password. Change it before continuing.',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    versionUpdates: 'Version updates',
    releaseUnknown: 'Unknown release date',
    viewRelease: 'View release',
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
      current: 'Theme: {current}. Click to switch to {next}',
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
      passwordResetAndLoggedIn: 'Password reset complete. You have been signed in automatically.',
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
    collapseForgotPassword: 'Hide password reset',
    sendCode: 'Send code',
    verifyAndResetPassword: 'Verify code and reset password',
    usernamePlaceholder: 'Enter username',
    passwordPlaceholder: 'Enter password',
    codePlaceholder: 'Enter the 6-digit verification code',
    newPasswordPlaceholder: 'Enter the new password',
    confirmNewPasswordPlaceholder: 'Enter the new password again'
  },
  settings: {
    page: {
      title: 'Settings',
      subtitle: 'Manage settings, budgets, exchange rates, notifications, and AI'
    },
    sections: {
      basic: 'General settings',
      exchangeSnapshot: 'Exchange rate snapshot',
      currentRates: 'Current exchange rates',
      converter: 'Currency converter',
      notifications: 'Notifications',
      ai: 'AI settings',
      credentials: 'Account',
      importExport: 'Import & export',
      backup: 'Backup',
      migration: 'Migration',
      about: 'About',
      credits: 'Credits'
    },
    labels: {
      baseCurrency: 'Base currency',
      timezone: 'Working time zone',
      rememberSessionDays: 'Days to stay signed in',
      timezoneSample: 'Current time in this time zone',
      monthlyBudget: 'Monthly budget (base currency)',
      yearlyBudget: 'Yearly budget (base currency)',
      advanceReminderRules: 'Pre-renewal reminder rules',
      overdueReminderRules: 'Overdue reminder rules',
      mergeNotifications: 'Merge reminders for multiple subscriptions',
      enableTagBudgets: 'Enable monthly budgets by tag',
      sourceCurrency: 'Source currency',
      targetCurrency: 'Target currency',
      providerPreset: 'Provider preset',
      capabilitySwitches: 'Feature toggles',
      structuredOutput: 'Prefer structured JSON output',
      requestTimeout: 'Request timeout (ms)',
      customRecognitionPrompt: 'Custom recognition prompt',
      customSummaryPrompt: 'Custom summary prompt',
      enableAi: 'Enable AI',
      aiSummary: 'AI summaries',
      aiVisionCapability: 'Image input',
      configurationDetails: 'Configuration details',
      advancedConfig: 'Advanced settings',
      notificationProvider: 'Provider',
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
      gotifyTargetUrl: 'Gotify URL',
      webhookTargetUrl: 'Webhook URL',
      oldUsername: 'Current username',
      oldPassword: 'Current password',
      newUsername: 'New username',
      newPassword: 'New password',
      enableForgotPassword: 'Allow password reset via notification code',
      restoreSettings: 'Also overwrite current settings'
    },
    helps: {
      advanceReminderRules:
        'Format: days&time;. For example, 3&09:30; reminds 3 days before the due date at 09:30, and 0&09:30; reminds on the due date. Separate multiple rules with ;',
      overdueReminderRules:
        'Format: days&time;. For example, 1&09:30; reminds at 09:30 on overdue day 1. Separate multiple rules with ;',
      notificationSettings:
        'Manage Email, PushPlus, Telegram, ServerChan, Gotify, and Webhook in one place. Save and test each channel independently.',
      aiSettings: 'The main AI switch controls recognition and connection tests. AI summaries can be turned on or off separately.',
      forgotPasswordChannelRequired: 'Enable at least one direct notification channel first',
      structuredOutput:
        'When enabled, the system prefers vendor-supported structured JSON output. If unsupported, it automatically falls back to prompt-based JSON output.',
      backup: 'Backup and restore via ZIP, including subscriptions, tags, payment records, ordering, settings, and local logos.',
      migration: 'Import data from similar third-party projects'
    },
    buttons: {
      previewReminderRules: 'Preview rules',
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
      fromAddress: 'SubTracker <noreply{at}example.com>',
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
      baseCurrencyTag: 'Base: {currency}',
      supportedCurrenciesTag: 'Supports {count} currencies',
      selectCurrenciesToConvert: 'Choose currencies to convert',
      emailResend: 'Resend · To: {to}',
      emailSmtp: 'SMTP {host} · To: {to}'
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
      basicSaved: 'General settings saved',
      basicSaveFailed: 'Failed to save general settings',
      emailSaved: 'Email settings saved',
      emailDisabled: 'Email disabled',
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
      ratesRefreshed: 'Exchange rates updated',
      credentialsUpdated: 'Credentials updated',
      forgotPasswordEnabled: 'Password reset via notifications enabled',
      forgotPasswordDisabled: 'Password reset via notifications disabled',
      forgotPasswordSaveFailed: 'Failed to save forgot password settings',
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
      zipExportStarted: 'Backup export started',
      zipExportFailed: 'Backup export failed',
      backupRestored: 'Backup restored',
      backupAppendedWithSettings: 'Backup appended and system settings overwritten',
      backupAppended: 'Backup appended',
      wallosImported: 'Wallos import completed',
      webhookSaved: 'Webhook settings saved',
      webhookDisabled: 'Webhook disabled',
      webhookTestSuccessWithPreview: 'Webhook test succeeded, HTTP {statusCode}: {preview}',
      webhookTestSuccess: 'Webhook test succeeded, HTTP {statusCode}',
      webhookTestFailed: 'Webhook test failed'
    },
    about: {
      releaseNotes: 'Release notes',
      license: 'License',
      issues: 'Issues & requests',
      author: 'Author',
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
      subtitle: 'See subscription count, budget usage, upcoming renewals, and spend breakdown'
    },
    cards: {
      activeSubscriptions: 'Active subscriptions',
      renewalsIn7Days: 'Renewals in the next 7 days',
      estimatedMonthlySpend: 'Estimated monthly spend',
      estimatedYearlySpend: 'Estimated yearly spend'
    },
    sections: {
      monthlyBudgetUsage: 'Monthly budget usage',
      yearlyBudgetUsage: 'Yearly budget usage',
      tagBudgetOverview: 'Tag budget overview',
      tagMonthlySpend: 'Monthly spend by tag',
      monthlyTrend: 'Projected monthly spend (next 12 months)',
      upcoming30: 'Renewals in the next 30 days'
    },
    labels: {
      usedPrefix: 'Used',
      budgetPrefix: '/ Budget',
      configuredTagBudgets: 'Configured tag budgets',
      nearingBudget: 'Near budget limit',
      overBudget: 'Over budget',
      topUsageRate: 'Highest usage rate'
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
      title: 'Budget analysis',
      subtitle: 'Review overall budget usage and monthly budgets by tag'
    },
    sections: {
      monthlyBudgetUsage: 'Monthly budget usage',
      yearlyBudgetUsage: 'Yearly budget usage',
      tagBudgetUsageRate: 'Tag budget utilization',
      budgetSummary: 'Budget overview',
      topUsageRate: 'Top 3 usage rates',
      tagBudgetUsageTable: 'Tag budget table',
      tagBudget: 'Tag budgets'
    },
    labels: {
      usedPrefix: 'Used',
      budgetPrefix: '/ Budget',
      configuredTagBudgets: 'Configured tag budgets',
      nearingBudget: 'Near budget limit',
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
      setTagBudgets: 'Edit tag budgets'
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
      subtitle: 'View subscription dates in calendar and list views'
    },
    cards: {
      currentMonth: 'Current month',
      currentMonthSuffix: 'Month currently in view',
      monthlyRenewalCount: 'Renewals this month',
      monthlyRenewalCountSuffix: 'Subscriptions in the selected month',
      monthlySpend: 'Estimated spend this month',
      convertedSuffix: 'Converted by exchange rate',
      selectedDateRenewals: 'Renewals on the selected date'
    },
    tabs: {
      month: 'Month view',
      list: 'List view'
    },
    detail: {
      dayRenewalsTitle: 'Renewals on {date}',
      dayRenewalsSummary: '{count} subscriptions · {currency} {amount}',
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
      title: 'Spending analysis',
      subtitle: 'Review subscription spending by trend, mix, and risk'
    },
    ai: {
      title: 'AI summary',
      generatedAtPrefix: 'Last generated: ',
      collapseDetails: 'Hide details',
      viewDetails: 'Show details',
      regenerate: 'Regenerate summary',
      expandedHint: 'Generated from current stats and does not change your subscription data',
      generatingHint: 'Generating an AI summary from current stats. Please wait...',
      unconfiguredHint: 'Turn on AI and AI summaries in Settings first. This page will then generate summaries automatically.',
      failedFallback: 'AI summary generation failed. Please try again later.',
      noSummary: 'No AI summary',
      previewLabel: 'Preview',
      updated: 'AI summary updated',
      failed: 'Failed to generate AI summary'
    },
    sections: {
      monthlyTrend: 'Projected monthly spend (next 12 months)',
      tagSpend: 'Spending share by tag',
      statusDistribution: 'Status distribution',
      autoRenewShare: 'Auto-renew share',
      currencyDistribution: 'Subscriptions by currency',
      upcoming30: 'Renewal distribution over the next 30 days',
      top10: 'Top 10 subscriptions by monthly spend'
    },
    empty: {
      noData: 'No data',
      noUpcoming30: 'No renewals in the next 30 days'
    },
    series: {
      trend: 'Projected spend',
      renewalCount: 'Renewals',
      amount: 'Amount'
    },
    labels: {
      renewalsCountAxis: 'Renewals',
      autoRenew: 'Auto-renew',
      manualRenew: 'Manual renewal',
      renewalCountTooltip: 'Subscriptions',
      amountTooltip: 'Monthly amount',
      amountAxis: 'Amount ({currency})'
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
      title: 'Tags',
      description: 'Create, edit, and delete tags.',
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
      description: 'Set monthly budgets for tags that need their own spending limits. Tags without budgets are excluded from tag budget analysis.',
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
      selectCurrentPage: 'Select this page',
      clearSelection: 'Clear selection',
      batchMode: 'Batch mode',
      exitBatchMode: 'Exit batch mode',
      dragHandleEnabledTitle: 'Drag to reorder',
      dragHandleDisabledTitle: 'Drag sorting is unavailable in the current sort mode'
    },
    sort: {
      custom: 'Custom order',
      renewal: 'Next renewal',
      amountDesc: 'Highest amount',
      name: 'Name A-Z'
    },
    status: {
      active: 'Active',
      paused: 'Paused',
      cancelled: 'Cancelled',
      expired: 'Expired'
    },
    actions: {
      tagManagement: 'Manage tags',
      create: 'New subscription',
      batchRenew: 'Renew selected',
      setActive: 'Set to active',
      setPaused: 'Set to paused',
      setCancelled: 'Set to cancelled',
      batchDelete: 'Batch delete',
      reorder: 'Reorder',
      finishReorder: 'Done reordering',
      detail: 'Details',
      records: 'History',
      edit: 'Edit',
      renew: 'Renew',
      pause: 'Pause',
      cancel: 'Cancel',
      resume: 'Resume'
    },
    labels: {
      nextRenewal: 'Next renewal',
      autoRenew: 'Auto-renew',
      note: 'Notes:',
      currentCycle: 'Current billing period',
      remainingValue: 'Remaining value',
      interval: 'Billing interval',
      originalAmount: 'Original amount',
      advanceReminders: 'Pre-renewal reminders',
      overdueReminders: 'Overdue reminders'
    },
    values: {
      interval: 'Every {count} {unit}'
    },
    confirm: {
      pause: 'Pause this subscription?',
      cancel: 'Cancel this subscription?',
      resume: 'Resume this subscription and set it back to active?',
      delete: 'Delete "{name}" along with its renewal records and related history? This action cannot be undone.'
    },
    messages: {
      subscriptionUpdated: 'Subscription updated',
      subscriptionCreated: 'Subscription created',
      subscriptionSaveFailed: 'Failed to save: {message}',
      tagCreated: 'Tag created',
      tagCreateFailed: 'Failed to create tag: {message}',
      tagUpdated: 'Tag updated',
      tagUpdateFailed: 'Failed to update tag: {message}',
      tagDeleted: 'Deleted tag: {name}',
      tagDeleteFailed: 'Failed to delete tag: {message}',
      resetToCurrent: 'Reset to the current subscription values',
      resetForm: 'Form reset',
      logoSearchEmpty: 'No logos found',
      logoSearchFailed: 'Failed to search logos',
      localLogoLoadFailed: 'Failed to load local logos',
      localLogoFirst: 'No name or website entered. Showing saved logos first.',
      logoSavedAndApplied: 'Saved locally and applied',
      logoImportFailed: 'Failed to import logo',
      logoReused: 'Reused from local library',
      localLogoDeleted: 'Local logo deleted',
      logoDeleteFailed: 'Failed to delete logo',
      logoUploadSuccess: 'Logo uploaded successfully',
      logoUploadFailed: 'Failed to upload logo',
      chooseRequiredDates: 'Choose a start date and next renewal date',
      dragSortEnabled: 'Drag sorting is on. Use the handle to reorder subscriptions.',
      orderUpdated: 'Order updated',
      orderUpdateFailed: 'Failed to update sort order',
      batchActionSuccess: '{label} succeeded for {count} subscriptions',
      batchActionPartial: '{label} complete: {success} succeeded, {failure} failed',
      batchDeleteSuccess: 'Deleted {count} subscriptions',
      batchDeletePartial:
        'Batch delete finished: deleted {success} subscriptions, skipped {skipped} active subscriptions, failed {failure}',
      renewed: 'Renewed: {name}',
      paused: 'Paused',
      resumed: 'Resumed',
      cancelled: 'Cancelled',
      deleted: 'Deleted: {name}'
    },
    batch: {
      selectFirst: 'Select subscriptions first',
      renewSuccess: 'Renewed {count} subscriptions',
      renewPartial: 'Batch renew complete: {success} succeeded, {failure} failed',
      statusConfirm: 'Set the selected {count} subscriptions to {status}?',
      deleteConfirmAll: 'Delete the selected {count} subscriptions? This action cannot be undone.',
      deleteConfirmPartial:
        'Delete subscriptions in batch? {deletable} subscriptions will be deleted, and {blocked} active subscriptions will be skipped. This action cannot be undone.'
    },
    detail: {
      title: 'Subscription details',
      remainingDays: '{days} days left / {ratio}'
    },
    form: {
      titleCreate: 'Create subscription',
      titleEdit: 'Edit subscription',
      savingDescription: 'Saving... Please wait.',
      namePlaceholder: 'For example: GitHub Pro',
      descriptionPlaceholder: 'Optional, briefly describe the subscription',
      amountPlaceholder: 'Enter an amount, use 0 for free subscriptions',
      currencyPlaceholder: 'Select a currency',
      frequencyPlaceholder: 'Select frequency',
      unitPlaceholder: 'Select a unit',
      tagPlaceholder: 'Select tags',
      websiteLabel: 'Official or platform URL',
      nextRenewalLabel: 'Next renewal',
      recalculateNextRenewal: 'Recalculate the next renewal from the start date and billing interval',
      advanceReminderRulesPlaceholder: 'Leave empty to use the system default, e.g. 3&09:30;0&09:30;',
      overdueReminderRulesPlaceholder: 'Leave empty to use the system default, e.g. 1&09:30;2&09:30;',
      notesPlaceholder: 'Optional: account, plan, or any special notes',
      notificationEnabledLabel: 'Enable reminders',
      logo: {
        upload: 'Click to upload',
        placeholder: 'Logo',
        panelTitle: 'Choose a logo',
        webTab: 'Web results ({count})',
        libraryTab: 'Saved logos ({count})',
        searching: 'Searching for logos...',
        noSearchResults: 'No web results are available right now',
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
        aiRecognize: 'Fill with AI',
        previewReminderRules: 'Preview rules',
        collapseReminderPreview: 'Hide reminder preview'
      }
    },
    aiModal: {
      title: 'AI subscription recognition',
      description:
        'Enter text, upload an image, or paste a screenshot. If the current model does not support image recognition, the app uses local OCR first and then sends the extracted text to the model. Results only fill the form and are not saved automatically.',
      loading: 'Recognizing...',
      loadingHint: 'The result will appear automatically when it is ready. No need to click again.',
      textInput: 'Text input',
      textLabel: 'Text',
      textPlaceholder: 'Paste subscription emails, payment records, order details, and more',
      imageInput: 'Image input',
      imageLabel: 'Image',
      uploadImage: 'Upload image',
      clearImage: 'Remove image',
      imageTip: 'Upload or paste a screenshot',
      pasteHint: 'You can also paste a screenshot here',
      imagePreviewAlt: 'Recognition image preview',
      confidence: 'Confidence',
      confidenceWithValue: 'Confidence: {value}%',
      recognize: 'Recognize',
      recognizing: 'Recognizing',
      applyResult: 'Apply',
      resultTitle: 'Recognition result',
      rawText: 'Raw extracted text',
      rawTextTitle: 'Raw extracted text',
      result: 'Recognition result',
      noInput: 'Add text or an image first',
      pleaseProvideInput: 'Add text or an image first',
      recognitionCompleted: 'Recognition complete',
      recognitionFailed: 'AI recognition failed',
      field: 'Field',
      recognizedResult: 'Value',
      fields: {
        name: 'Name',
        description: 'Description',
        amount: 'Amount',
        currency: 'Currency',
        billingIntervalCount: 'Frequency',
        billingIntervalUnit: 'Unit',
        startDate: 'Start date',
        nextRenewalDate: 'Next renewal',
        notifyDaysBefore: 'Reminder lead time',
        websiteUrl: 'Website',
        notes: 'Notes'
      }
    },
    paymentRecords: {
      title: 'Renewal history',
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
      pickZip: 'Choose a ZIP file',
      noFileSelected: 'No file selected',
      previewBackup: 'Preview backup',
      subscriptions: 'Subscriptions',
      tags: 'Tags',
      paymentRecords: 'Payment records',
      localLogos: 'Local logos',
      restoreMode: 'Restore mode',
      replaceMode: 'Clear existing data and restore',
      appendMode: 'Keep current data and append restored data',
      replaceWarning:
        'This deletes current subscriptions, tags, payment records, ordering, settings, and local logos before restoring from the file.',
      appendHelp:
        'For append restore, tags with the same name are reused; subscriptions and payment records are skipped idempotently by backup CUID; settings overwrite is controlled separately.',
      restoreSettingsLabel: 'Also overwrite current settings',
      restorePreview: 'Restore preview',
      existingSameNameTags: 'Existing tags with the same name:',
      existingSubscriptions: 'Existing subscriptions with the same CUID:',
      existingPaymentRecords: 'Existing payment records with the same CUID:',
      warnings: 'Warnings',
      confirmRestore: 'Confirm restore',
      invalidZip: 'The backup ZIP could not be parsed',
      previewFailed: 'Failed to preview backup',
      previewGenerated: 'Backup preview ready',
      nothingImported: 'No new data was imported. Duplicate entries were skipped automatically.',
      restoreCompleted: 'Restore complete: {subscriptions} subscriptions, {tags} new tags, {payments} payment records, {logos} logos',
      restoreFailed: 'Restore failed'
    }
  },
  imports: {
    wallos: {
      title: 'Import Wallos data',
      description: 'Upload a Wallos JSON file, SQLite database, or ZIP backup. Only tags actually used by imported subscriptions are kept.',
      pickFile: 'Choose a file',
      preview: 'Generate preview',
      confirmImport: 'Confirm import',
      previewTitle: 'Import preview',
      warningTitle: 'Warnings',
      sourceTimezoneLabel: 'Wallos source time zone (advanced)',
      sourceTimezonePlaceholder: 'Defaults to the current working time zone',
      sourceTimezoneHint: 'Change this only if the exported Wallos instance used a different time zone. Otherwise, keep the default.',
      importTypeLabel: 'Import type',
      importableSubscriptionsLabel: 'Importable subscriptions',
      importedTagsLabel: 'Imported tags',
      zipLogoLabel: 'ZIP logo matches',
      tagPreviewTitle: 'Tag preview',
      noImportableTags: 'No importable tags',
      subscriptionPreviewTitle: 'Subscription preview',
      jsonWarning:
        'Wallos JSON import detected. Wallos DB import is recommended first because the database includes more complete data such as start_date and full currency codes. JSON import still works, but some fields may fall back to inferred values, such as currency or start date.',
      noWarnings: 'No additional warnings',
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
      autoRenew: 'Auto-renew',
      yes: 'Yes',
      no: 'No',
      status: 'Status',
      logo: 'Logo',
      logoNone: 'None',
      logoPending: 'Pending match',
      logoReady: 'Ready from ZIP',
      previewGenerated: 'Import preview ready',
      previewFailed: 'Failed to generate preview',
      importCompleted: 'Import complete: {subscriptions} subscriptions, {tags} tags, {logos} logos',
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
      overdueDay: 'Day {days} overdue'
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
      title: 'SubTracker password reset code',
      username: 'Username: {username}',
      code: 'Verification code: {code}',
      expiresInMinutes: 'Expires in: {minutes} minutes',
      ignoreHint: 'If you did not request this, you can ignore this notification.'
    },
    tests: {
      subscriptionName: 'Test subscription',
      tagName: 'Test tag',
      note: 'This is a test notification.'
    },
    merge: {
      phaseUpcoming: 'Upcoming renewals',
      phaseDueToday: 'Due today',
      phaseOverdueDay: 'Day {days} overdue',
      summaryName: '{count} subscriptions total'
    },
    presentation: {
      unnamedSubscription: 'Unnamed subscription',
      mergedTitle: '{prefix}: {count} subscriptions',
      sectionTitle: '{title} ({count})',
      reminderType: 'Reminder type: {value}',
      subscriptionCount: 'Subscriptions: {count}',
      subscriptionName: 'Subscription: {name}',
      nextRenewal: 'Next renewal: {value}',
      amount: 'Amount: {value}',
      tags: 'Tags: {value}',
      website: 'Website: {value}',
      notes: 'Notes: {value}',
      details: 'Details: {value}',
      daysUntil: '{days} days left',
      overdueDays: '{days} days overdue'
    },
    logs: {
      dispatchSummary:
        '[notification] {name}: {successCount} channels succeeded, {failedCount} failed, and {skippedCount} were skipped. {details}',
      allSkipped: '[notification] {name}: all notification channels were skipped. {details}'
    },
    wrappers: {
      detailStart: ' (',
      detailEnd: ')'
    }
  },
  formatting: {
    monthLabel: {
      long: 'MMMM YYYY'
    }
  },
  validation: {
    timezoneInvalid: 'Invalid timezone',
    notificationTargetUrl: {
      invalidFormat: '{label} is invalid',
      unsupportedProtocol: '{label} must use http or https',
      privateHostBlocked: '{label} cannot point to local or private network addresses'
    },
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
      fallback: 'Use the system default',
      emptyTitle: 'Enter rules before previewing',
      resultTitle: 'Preview result',
      invalidTitle: 'Invalid rule format',
      defaultRulesLabel: 'system default rules',
      defaultAdvanceRulesLabel: 'system default pre-renewal rules',
      defaultOverdueRulesLabel: 'system default overdue rules',
      fallbackPreviewTitle: 'No value entered. Previewing with {label}',
      fallbackInvalidTitle: '{label} is invalid',
      noAdvance: 'No pre-renewal reminder rules',
      noOverdue: 'No overdue reminder rules',
      parseFailed: 'Failed to parse rules',
      invalidSegmentFormat: 'Rule "{segment}" is invalid. Expected format: days&HH:mm',
      invalidDaysInteger: 'The days value in rule "{segment}" must be an integer',
      invalidOverdueDays: 'The days value in rule "{segment}" must be greater than or equal to 1',
      invalidAdvanceDays: 'The days value in rule "{segment}" cannot be less than 0',
      invalidTime: 'The time value in rule "{segment}" must use HH:mm',
      inlineAdvanceSameDay: 'On the due date at {time}',
      inlineAdvanceBefore: '{days} day(s) before at {time}',
      inlineOverdue: 'On overdue day {days} at {time}',
      evalAdvanceSameDay: 'Remind on the due date at {time}',
      evalAdvanceBefore: 'Remind {days} day(s) before at {time}',
      evalOverdue: 'Remind on overdue day {days} at {time}'
    }
  },
  ai: {
    status: {
      textFast: 'Recognizing. This usually takes just a few seconds. No need to click again.',
      textSlow: 'Still working. The model is responding slowly, so please wait a little longer.',
      imageFast: 'Recognizing the image and text. This usually takes 5-10 seconds. Please keep this window open.',
      imageSlow: 'Image recognition is still running. The external model is responding slowly, so please wait a little longer.'
    },
    prompts: {
      common: {
        jsonOnlySuffix: 'Return a valid JSON object only. Do not return Markdown, code fences, or any extra explanation.',
        originalTextLabel: 'Original text',
        ocrExtractedTextLabel: 'OCR extracted text',
        returnOkOnly: 'Return OK only',
        visionConfirmSystem: 'Respond to the image from the user and return one short confirmation sentence only.',
        visionConfirmUser: 'Please confirm that you have received this test image successfully.'
      },
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
  scheduler: {
    channelSummary: {
      item: '{channel}: success {success}/failed {failed}/skipped {skipped}'
    },
    logs: {
      reminderScan:
        '[cron] subscription reminders scanned: candidates {processedCount}, matched {matchedReminderCount}, notified {notificationCount}{channelSummary}',
      notificationDedupCleanup: '[cron] notification dedup cleanup: deleted {deleted} old records',
      exchangeRatesRefreshed: '[cron] exchange rates refreshed',
      exchangeRateRefreshFailed: '[cron] exchange rate refresh failed',
      reminderScanFailed: '[cron] reminder scan failed'
    }
  },
  logos: {
    search: {
      manifestIcon: 'Manifest icon{sizeLabel}',
      appleTouchIcon: 'Apple Touch Icon',
      maskIcon: 'Mask Icon',
      siteIcon: 'Site icon',
      siteShareImage: 'Site share image',
      duckduckgoCandidate: 'DuckDuckGo candidate {index}',
      braveCandidate: 'Brave candidate {index}',
      siteFavicon: 'Site favicon',
      googleFavicon: 'Google Favicon',
      iconHorse: 'Icon Horse',
      clearbitLogo: 'Clearbit Logo'
    },
    library: {
      unusedLogo: 'Unused logo'
    }
  },
  api: {
    runtime: {
      initialExchangeRateRefreshFailed: '[api] Initial exchange rate refresh failed. Falling back to the existing snapshot.',
      started: '[api] Started: http://{host}:{port}'
    },
    errors: {
      unauthorized: 'Please sign in first',
      tooManyAttempts: 'Too many failed sign-in attempts. Please try again later.',
      internal: 'Unexpected server error',
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
        forgotPasswordDisabled: 'Forgot password is unavailable because it is disabled or no notification channel is configured.',
        forgotPasswordRequestRateLimited: 'Verification codes are being requested too frequently. Please try again later.',
        forgotPasswordRequestCooldown: 'A verification code was just sent. Please try again later.',
        forgotPasswordDeliveryFailed: 'Failed to send the verification code. Check the notification configuration.',
        forgotPasswordResetRateLimited: 'Too many failed verification attempts. Please try again later.',
        forgotPasswordChallengeNotFound: 'The verification code is invalid or has expired.',
        forgotPasswordAttemptsExhausted: 'No verification attempts remain. Request a new code.',
        forgotPasswordCodeInvalid: 'Too many incorrect verification attempts. Request a new code.',
        forgotPasswordCodeInvalidWithAttempts: 'Incorrect verification code. Attempts remaining: {attempts}.',
        forgotPasswordResetFailed: 'Failed to reset the password',
        forgotPasswordChannelRequired: 'Enable at least one direct notification channel before turning on forgot password.'
      },
      settings: {
        emailFieldsRequired: 'To enable email notifications, fill in: {fields}',
        pushplusTokenRequired: 'To enable PushPlus, fill in Token',
        telegramFieldsRequired: 'To enable Telegram notifications, fill in: {fields}',
        serverchanSendKeyRequired: 'To enable ServerChan, fill in SendKey',
        gotifyFieldsRequired: 'To enable Gotify, fill in: {fields}',
        aiFieldsRequired: 'To enable AI, fill in: {fields}'
      },
      ai: {
        disabled: 'AI is disabled',
        configIncomplete: 'AI configuration is incomplete',
        summaryDisabled: 'AI summary is disabled',
        summaryConfigIncomplete: 'AI summary settings are incomplete',
        invalidRecognitionInput: 'Invalid AI recognition input',
        noValidContent: 'AI did not return valid content',
        noRecognizableText: 'No text content is available for recognition',
        ocrNoValidText: 'OCR did not extract valid text from the image. Enter the text manually instead.',
        visionCapabilityDisabled: 'The current provider does not support image input.',
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
        emptyDedupEntries: 'Cannot build notification dispatch params from empty dedup entries',
        resendRequestFailed: 'Resend request failed',
        pushplusRequestFailed: 'PushPlus request failed',
        pushplusInvalidResponse: 'PushPlus returned an invalid response',
        pushplusRejected: 'PushPlus request was rejected',
        pushplusSubmitted: 'Request submitted',
        telegramRequestFailed: 'Telegram request failed',
        telegramInvalidResponse: 'Telegram returned an invalid response',
        telegramRejected: 'Telegram request was rejected',
        serverchanRequestFailed: 'ServerChan request failed',
        serverchanInvalidResponse: 'ServerChan returned an invalid response',
        serverchanRejected: 'ServerChan request was rejected',
        gotifyRequestFailed: 'Gotify request failed',
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
        subtrackerBackupCommitFailed: 'SubTracker backup restore failed',
        subtrackerBackupManifestInvalid: 'The backup manifest is invalid',
        subtrackerBackupInvalidFile: 'This is not a valid SubTracker backup file',
        subtrackerBackupUnsupportedVersion: 'Unsupported backup version: {version}',
        subtrackerBackupUnsupportedScope: 'Unsupported backup scope: {scope}',
        subtrackerBackupManifestMissingData: 'The backup manifest is missing required data',
        subtrackerBackupFileEmpty: 'The backup file is empty',
        subtrackerBackupMissingManifest: 'The backup ZIP is missing manifest.json',
        subtrackerBackupMissingLogo: 'The backup ZIP is missing logo file: {path}',
        importTokenInvalid: 'The import token is missing or expired. Generate a new preview first.',
        wallosDatabaseEmpty: 'The database file is empty'
      },
      wallosWarnings: {
        cycleMissingFallback: 'cycle is missing. Falling back to every 1 month.',
        cycleDaysFallback: 'cycle.days={days} cannot be mapped directly. Falling back to every {mappedDays} days.',
        priceEmptyFallback: 'The price is empty. Falling back to 0 CNY.',
        priceParseFallback: 'The price "{text}" could not be fully parsed. Falling back to 0 {currency}.',
        priceCurrencyAmbiguousUsd: 'The currency symbol in "{text}" is ambiguous. Importing as USD by default.',
        priceCurrencyAmbiguousCny: 'The currency symbol in "{text}" is ambiguous. Importing as CNY by default.',
        priceCurrencyMissing: 'The price "{text}" does not specify a currency. Importing as CNY by default.',
        websiteMissingProtocol: 'The URL "{raw}" is missing a protocol. Auto-completed to {withHttps}.',
        websiteInvalidIgnored: 'The URL "{raw}" is not recognized as a valid link and has been ignored.',
        paymentCycleFallback: 'Payment Cycle "{text}" could not be fully parsed. Falling back to every 1 month.',
        jsonStartDateFallback: 'Wallos JSON does not include start_date. Next Payment is used as the start date.',
        jsonMissingRequiredSkipped: 'json#{index} is missing the name or next payment date and has been skipped.',
        subscriptionMissingRequiredSkipped: 'subscription#{id} is missing required fields and has been skipped.',
        subscriptionPrefix: 'subscription#{id}',
        subscriptionPrefixed: 'subscription#{id} {warning}',
        subscriptionLogoMissing: 'subscription#{id} references a logo file, but no matching image was found in the package.',
        logoNeedsManualFill: 'The logo file must be restored later from a directory or ZIP package.'
      },
      subtrackerBackupWarnings: {
        noLocalLogos: 'This backup does not include local logo files.',
        noPaymentRecords: 'This backup does not include payment records.',
        excludedSecretsAndHistory: 'Login credentials, session secrets, webhook history, and exchange-rate snapshots will not be restored.',
        appendModeDedup:
          'In append mode, subscriptions and payment records are skipped idempotently by their backup CUIDs, and tags with the same name are reused.'
      },
      wallosZipMissingDatabase: 'The ZIP package does not contain db/wallos.db',
      wallosMissingTables: 'Missing required Wallos tables: {tables}',
      wallosJsonParseFailed: 'Failed to parse JSON',
      wallosJsonMustBeArray: 'The exported Wallos JSON content must be an array',
      tags: {
        nameExists: 'Tag name already exists',
        updateFailed: 'Failed to update tag',
        notFound: 'Tag not found'
      },
      version: {
        updateFetchFailed: 'Failed to fetch version updates'
      },
      exchangeRates: {
        refreshFailed: 'Failed to refresh exchange rates',
        payloadEmpty: 'The exchange-rate payload is empty'
      },
      subscriptions: {
        notFound: 'Subscription not found',
        logoDeleteFailed: 'Failed to delete logo',
        logoUploadFailed: 'Failed to upload logo',
        logoImportFailed: 'Failed to import logo',
        logoUnsupportedImageType: 'Unsupported logo image type',
        logoBufferEmpty: 'The logo image content is empty',
        logoUploadTypeUnsupported: 'Only PNG, JPG, WEBP, and SVG images are supported',
        imageBufferEmpty: 'The image content is empty',
        logoRemoteUnavailable: 'Failed to download the remote logo or the image is unavailable',
        logoFilenameInvalid: 'Invalid logo filename',
        logoInUseCannotDelete: 'This logo is currently used by subscriptions and cannot be deleted',
        renewFailed: 'Renew failed',
        activeDeleteNotAllowed: 'Active subscriptions cannot be deleted directly. Pause or cancel them first.',
        batchPauseOnlyActive: 'Only active subscriptions can be paused in batch mode',
        batchCancelOnlyActive: 'Only active subscriptions can be cancelled in batch mode',
        activeDeleteBlocked: 'Active subscriptions cannot be deleted directly',
        websiteUrlInvalid: 'Website URL is invalid. Enter a valid URL.'
      }
    }
  }
} as const
