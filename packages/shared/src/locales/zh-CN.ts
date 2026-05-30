export default {
  common: {
    actions: {
      save: '保存',
      refresh: '刷新',
      update: '修改',
      test: '测试',
      cancel: '取消',
      confirm: '确认',
      close: '关闭',
      expand: '展开',
      collapse: '收起',
      delete: '删除',
      keep: '保留',
      restore: '恢复',
      search: '查询',
      reset: '重置',
      preview: '预览',
      import: '导入',
      export: '导出',
      create: '新建',
      edit: '编辑',
      reorder: '调整顺序',
      done: '完成调整',
      manage: '管理',
      signOut: '退出登录',
      connectionTest: '连接测试',
      visionTest: '视觉测试'
    },
    status: {
      enabled: '已启用',
      disabled: '未启用',
      active: '正常',
      paused: '暂停',
      cancelled: '停用',
      expired: '过期',
      stale: '需刷新',
      fresh: '正常'
    },
    labels: {
      name: '名称',
      description: '描述',
      notes: '备注',
      amount: '金额',
      currency: '货币',
      status: '状态',
      tags: '标签',
      startDate: '开始日期',
      nextRenewal: '下次续订',
      autoRenew: '自动续订',
      notifications: '提醒通知',
      createdAt: '创建时间',
      from: '发件人',
      to: '收件人',
      provider: '来源名称',
      username: '用户名',
      password: '密码',
      token: 'Token',
      url: 'URL',
      unit: '单位',
      frequency: '频率',
      actions: '操作',
      port: '端口',
      code: '验证码',
      model: 'Model',
      requestMethod: '请求方法',
      host: 'Host',
      secure: 'Secure',
      chatId: 'Chat ID',
      botToken: 'Bot Token',
      sendKey: 'SendKey',
      serverUrl: 'Server URL',
      deviceKey: 'Device Key',
      apiBaseUrl: 'API Base URL',
      apiKey: 'API Key',
      key: 'Key',
      team: 'Team ID',
      topic: 'Topic',
      gotifyTargetUrl: 'Gotify URL',
      webhookTargetUrl: 'Webhook URL'
    },
    empty: {
      noData: '暂无数据',
      noDescription: '暂无描述',
      noNotes: '暂无备注',
      noTags: '未打标签'
    },
    errors: {
      requestFailed: '请求失败'
    },
    placeholders: {
      noFileSelected: '未选择文件'
    },
    separators: {
      list: '、',
      fieldList: '、',
      notificationDetail: '；'
    },
    locales: {
      zhCN: '简体中文',
      enUS: 'English'
    },
    units: {
      day: '天',
      week: '周',
      month: '月',
      quarter: '季',
      year: '年',
      minutes: '分钟'
    }
  },
  app: {
    brand: 'SubTracker',
    shellTitle: '订阅管理台',
    shellSubtitle: '多币种 · 提醒 · 统计 · 日历',
    notSignedIn: '未登录',
    changeDefaultPasswordTitle: '请先修改默认密码',
    changeDefaultPasswordWarning: '当前仍在使用默认管理员密码。为了继续使用系统，请先修改密码。',
    newPassword: '新密码',
    confirmNewPassword: '再次输入新密码',
    versionUpdates: '版本更新',
    releaseUnknown: '发布时间未知',
    viewRelease: '查看 Commit',
    noNewRelease: '暂无比当前版本更新的 lite 提交。',
    updateAvailable: '检测到新版本，当前版本 {currentVersion}，最新版本 {latestVersion}',
    alreadyLatest: '当前已经是最新版本（{version}）',
    menu: {
      dashboard: '仪表盘',
      subscriptions: '订阅管理',
      calendar: '订阅日历',
      statistics: '费用统计',
      budgets: '预算统计',
      settings: '系统设置'
    },
    auth: {
      login: '登录'
    },
    theme: {
      current: '当前主题：{current}，点击切换到{next}',
      light: '浅色',
      dark: '深色'
    }
  },
  auth: {
    validation: {
      usernameAndPasswordRequired: '请输入用户名和密码',
      usernameRequired: '请输入用户名',
      passwordRequired: '请输入密码',
      loginPayloadInvalid: '登录信息格式不正确',
      codeRequired: '请输入 6 位验证码',
      codeFormat: '验证码必须为 6 位数字',
      newPasswordRequired: '请输入新密码',
      newPasswordMin: '新密码至少 4 位',
      passwordMismatch: '两次输入的新密码不一致'
    },
    success: {
      login: '登录成功',
      forgotPasswordCodeSent: '如果用户名有效且通知已启用，验证码已发送',
      passwordResetAndLoggedIn: '密码已重置并自动登录',
      defaultPasswordChanged: '默认密码已修改'
    },
    error: {
      login: '登录失败',
      forgotPasswordCodeSend: '验证码发送失败',
      passwordReset: '密码重置失败'
    }
  },
  login: {
    title: '登录 SubTracker Lite',
    subtitle: '请输入您的用户名和密码',
    rememberMe: '记住我',
    rememberMeDays: '（{days} 天）',
    forgotPassword: '忘记密码',
    collapseForgotPassword: '收起找回密码',
    sendCode: '发送验证码',
    verifyAndResetPassword: '验证并重置密码',
    usernamePlaceholder: '请输入用户名',
    passwordPlaceholder: '请输入密码',
    codePlaceholder: '请输入 6 位验证码',
    newPasswordPlaceholder: '请输入新密码',
    confirmNewPasswordPlaceholder: '请再次输入新密码'
  },
  settings: {
    page: {
      title: '系统设置',
      subtitle: '管理基础参数、预算、汇率、通知与 AI 能力'
    },
    sections: {
      basic: '基础设置',
      exchangeSnapshot: '汇率状态',
      currentRates: '当前汇率（常用货币）',
      converter: '汇率转换器',
      notifications: '通知设置',
      ai: 'AI 能力设置',
      credentials: '登录凭据',
      importExport: '导入和导出',
      backup: '备份',
      migration: '迁移',
      about: 'About',
      credits: 'Credits'
    },
    labels: {
      baseCurrency: '基准货币',
      timezone: '业务时区',
      rememberSessionDays: '记住登录天数',
      timezoneSample: '当前时区示例',
      monthlyBudget: '月预算（基准货币）',
      yearlyBudget: '年预算（基准货币）',
      advanceReminderRules: '到期前提醒规则',
      overdueReminderRules: '过期提醒规则',
      mergeNotifications: '多订阅合并通知',
      enableTagBudgets: '启用标签月预算',
      sourceCurrency: '源货币',
      targetCurrency: '目标货币',
      providerPreset: 'Provider 预设',
      capabilitySwitches: '能力开关',
      structuredOutput: '优先结构化 JSON 输出',
      requestTimeout: '请求超时（毫秒）',
      customRecognitionPrompt: '自定义识别提示词',
      customSummaryPrompt: '自定义总结提示词',
      enableAi: '启用 AI 能力',
      aiSummary: 'AI 总结',
      aiVisionCapability: '模型视觉输入',
      configurationDetails: '配置详情',
      advancedConfig: '高级配置',
      notificationProvider: '通知提供商',
      providerName: 'Provider 名称',
      providerUrl: '接口地址',
      fetchedAt: '最近获取时间',
      snapshotStatus: '刷新状态',
      requestMethod: '请求方法',
      customHeaders: '自定义请求头',
      payloadTemplate: 'Payload 模板',
      availableVariables: '可用变量：',
      ignoreSsl: '忽略 SSL 校验',
      smtpHost: 'SMTP Host',
      secure: 'Secure',
      resendApiUrl: 'Resend API URL',
      resendApiKey: 'Resend API Key',
      botToken: 'Bot Token',
      chatId: 'Chat ID',
      sendKey: 'SendKey',
      barkServerUrl: 'Bark Server URL',
      deviceKey: 'Device Key',
      archiveNotification: '在设备端归档通知',
      topic: 'Topic',
      apiBaseUrl: 'API Base URL',
      apiKey: 'API Key',
      team: 'Team ID',
      gotifyTargetUrl: 'Gotify URL',
      webhookTargetUrl: 'Webhook URL',
      appriseApiBaseUrl: 'Apprise API Base URL',
      appriseKey: 'Apprise Key',
      appriseTargets: 'Apprise 通知地址',
      appriseTargetName: '地址名称',
      appriseTargetUrl: 'Apprise URL',
      appriseTargetEnabled: '启用此地址',
      appriseSyncStatus: '同步状态',
      oldUsername: '原用户名',
      oldPassword: '原密码',
      newUsername: '新用户名',
      newPassword: '新密码',
      enableForgotPassword: '允许通过通知验证码找回密码',
      restoreSettings: '同时覆盖当前系统设置'
    },
    helps: {
      advanceReminderRules:
        '格式说明：天数&时间;，例如 3&09:30; 表示提前 3 天在 09:30 提醒，0&09:30; 表示到期当天提醒；多条规则用 ; 分隔',
      overdueReminderRules:
        '格式说明：天数&时间;，例如 1&09:30; 表示过期 1 天后在 09:30 提醒；多条规则用 ; 分隔',
      notificationSettings:
        '统一管理邮箱、PushPlus、Telegram、Server 酱、Gotify、Bark、NotifyX、Apprise 与 Webhook。每个渠道都可以单独保存并单独测试。',
      notificationSettingsWorkerLite:
        'Cloudflare Worker 运行时仅支持 Resend 邮件，Webhook / Gotify 的忽略 SSL 校验不可用。',
      aiSettings: 'AI 能力总开关控制识别与连接测试；AI 总结可单独开启或关闭。',
      forgotPasswordChannelRequired: '需先启用至少一个直达通知渠道',
      structuredOutput:
        '开启后会优先使用厂商支持的结构化 JSON 输出；若不支持，系统会自动降级为普通 JSON 提示词模式。',
      workerRuntime: '当前运行环境为 Cloudflare Worker + D1',
      workerRuntimeR2Enabled: '，R2 已启用',
      workerRuntimeR2Disabled: '，R2 未启用，仅支持远程 Logo 引用',
      backup:
        '支持通过 ZIP 进行备份与恢复，包含订阅、标签、支付记录、排序、系统设置与本地 Logo',
      migration: '从第三方同类项目导入数据'
    },
    buttons: {
      previewReminderRules: '预览提醒规则',
      collapseReminderPreview: '收起提醒预览',
      exportBackup: '导出备份',
      restoreBackup: '恢复备份',
      importWallos: '导入 Wallos',
      swapCurrencies: '交换源货币和目标货币'
    },
    apprise: {
      summary: {
        targets: '地址 {count} 个',
        enabledTargets: '启用 {count} 个',
        syncStatus: '同步：{status}'
      },
      syncStatus: {
        idle: '未同步',
        synced: '已同步',
        failed: '同步失败'
      },
      modal: {
        title: '管理 Apprise 通知地址',
        description: '在这里添加多个 Apprise 通知地址，每个地址都可以单独启用、测试或删除',
        addTarget: '新增地址',
        empty: '还没有 Apprise 通知地址',
        testHint: '单独测试只会发送到当前地址',
        namePlaceholder: '例如：我的手机通知',
        urlPlaceholder: '例如：tgram://bot_token/chat_id'
      }
    },
    templates: {
      button: '模板编辑',
      title: '编辑通知模板',
      description: '按纯文本、Markdown 和 HTML 三种能力分别管理通知模板。Webhook Payload 继续单独配置。',
      groups: {
        text: '纯文本',
        markdown: 'Markdown',
        html: 'HTML'
      },
      scenes: {
        singleReminder: '单条提醒',
        mergedReminder: '合并提醒',
        testNotification: '测试通知',
        forgotPassword: '忘记密码'
      },
      labels: {
        titleTemplate: '标题模板',
        bodyTemplate: '正文模板',
        placeholders: '可用占位符',
        preview: '预览',
        supportedChannels: '适用渠道'
      },
      helps: {
        text: '适合纯文本回退场景，不依赖富文本解析。',
        markdown: '适合支持 Markdown 排版的渠道，例如 Telegram、Server 酱、Gotify、Bark、NotifyX、Apprise。',
        html: '适合直接渲染 HTML 的渠道，例如邮件和 PushPlus。',
        placeholders: '点击占位符可插入到当前聚焦的输入框。',
        preview: '预览使用固定示例数据，不会修改真实通知内容。'
      },
      supportedChannels: {
        text: '纯文本回退',
        markdown: 'Telegram、Server 酱、Gotify、Bark、NotifyX、Apprise',
        html: '邮件、PushPlus'
      },
      placeholders: {
        appName: '应用名称',
        title: '最终标题',
        phaseLabel: '提醒阶段',
        subscriptionCount: '订阅数量',
        detailsBlock: '当前分组格式化后的单条详情块',
        summaryBlock: '当前分组格式化后的汇总头部块',
        sectionsBlock: '当前分组格式化后的合并列表块',
        testIntroBlock: '测试通知说明块',
        forgotPasswordBlock: '忘记密码说明块',
        subscriptionName: '订阅名称',
        subscriptionNextRenewalDate: '下次续订日期',
        subscriptionAmount: '金额',
        subscriptionCurrency: '货币',
        subscriptionAmountWithCurrency: '金额和货币',
        subscriptionTags: '标签列表',
        subscriptionWebsiteUrl: '网址',
        subscriptionNotes: '备注',
        subscriptionDaysUntilRenewal: '距离到期天数',
        subscriptionDaysOverdue: '过期天数',
        username: '用户名',
        code: '验证码',
        expiresInMinutes: '有效分钟数'
      },
      actions: {
        restoreDefault: '恢复默认模板'
      }
    },
    placeholders: {
      optional: '可选',
      notFilledRecipient: '未填写收件人',
      notFilledSmtpHost: '未填写 SMTP Host',
      fromAddress: 'SubTracker Lite <noreply{at}example.com>',
      advanceReminderRules: '例如：3&09:30;0&09:30;',
      overdueReminderRules: '例如：1&09:30;2&09:30;3&09:30;',
      multiEmail: '多个邮箱请用英文逗号分隔',
      chatIdExample: '例如：123456789 或 -100xxxxxxxxxx',
      gotifyUrl: 'https://gotify.example.com',
      barkServerUrl: 'https://api.day.app',
      appriseApiBaseUrl: '例如：http://apprise:8000 或 https://apprise.example.com',
      webhookUrl: 'https://example.com/hook',
      aiBaseUrl: 'https://api.deepseek.com',
      customHeaders:
        '支持 JSON 对象或每行一个 Header，例如：\nContent-Type: application/json\nX-App: SubTracker Lite',
      customRecognitionPrompt:
        '留空时，订阅识别使用系统识别提示词；仪表盘 AI 总结始终使用系统总结提示词',
      customSummaryPrompt: '留空时，AI 总结使用系统预设总结提示词'
    },
    summary: {
      baseCurrencyTag: '基准货币 {currency}',
      supportedCurrenciesTag: '支持 {count} 种货币',
      selectCurrenciesToConvert: '请选择要转换的货币',
      emailResend: 'Resend · 收件人：{to}',
      emailSmtp: 'Host：{host} · 收件人：{to}'
    },
    channels: {
      email: '邮箱通知',
      pushplus: 'PushPlus',
      telegram: 'Telegram Bot',
      serverchan: 'Server 酱',
      gotify: 'Gotify',
      bark: 'Bark',
      notifyx: 'NotifyX',
      apprise: 'Apprise',
      webhook: 'Webhook'
    },
    options: {
      emailProvider: {
        smtp: 'SMTP',
        resend: 'Resend'
      },
      aiProviderPreset: {
        custom: '自定义',
        aliyunBailian: '阿里百炼',
        tencentHunyuan: '腾讯混元',
        volcengineArk: '火山方舟'
      }
    },
    validation: {
      emailMissingFields: '邮箱通知缺少必填项：{fields}',
      pushplusMissingFields: 'PushPlus 缺少必填项：{fields}',
      telegramMissingFields: 'Telegram 缺少必填项：{fields}',
      serverchanMissingFields: 'Server 酱缺少必填项：{fields}',
      gotifyMissingFields: 'Gotify 缺少必填项：{fields}',
      barkMissingFields: 'Bark 缺少必填项：{fields}',
      notifyxMissingFields: 'NotifyX 缺少必填项：{fields}',
      appriseMissingFields: 'Apprise 缺少必填项：{fields}',
      webhookMissingFields: 'Webhook 缺少必填项：{fields}',
      aiMissingFields: 'AI 能力缺少必填项：{fields}'
    },
    messages: {
      basicSaved: '基础设置已保存',
      basicSaveFailed: '基础设置保存失败',
      emailSaved: '邮箱通知配置已保存',
      emailDisabled: '邮箱通知已关闭',
      pushplusSaved: 'PushPlus 配置已保存',
      pushplusDisabled: 'PushPlus 已关闭',
      telegramSaved: 'Telegram 配置已保存',
      telegramDisabled: 'Telegram 已关闭',
      serverchanSaved: 'Server 酱配置已保存',
      serverchanDisabled: 'Server 酱已关闭',
      gotifySaved: 'Gotify 配置已保存',
      gotifyDisabled: 'Gotify 已关闭',
      barkSaved: 'Bark 配置已保存',
      barkDisabled: 'Bark 已关闭',
      notifyxSaved: 'NotifyX 配置已保存',
      notifyxDisabled: 'NotifyX 已关闭',
      appriseSaved: 'Apprise 配置已保存',
      appriseDisabled: 'Apprise 已关闭',
      appriseSavedWithSyncFailure: 'Apprise 配置已保存到本地，但同步到 Apprise API 失败：{error}',
      notificationTemplatesSaved: '通知模板已保存',
      notificationTemplatesSaveFailed: '通知模板保存失败',
      aiSaved: 'AI 能力配置已保存',
      aiDisabled: 'AI 能力已关闭',
      aiConnectionTestSuccess: '连接测试成功：{provider} / {model} / {response}',
      aiConnectionTestFailed: 'AI 连接测试失败',
      aiVisionTestSuccess: '视觉测试成功：{provider} / {model} / {response}',
      aiVisionTestFailed: 'AI 视觉测试失败',
      ratesRefreshed: '汇率已刷新',
      credentialsUpdated: '登录凭据已更新',
      forgotPasswordEnabled: '找回密码已开启',
      forgotPasswordDisabled: '找回密码已关闭',
      forgotPasswordSaveFailed: '找回密码设置保存失败',
      emailTestSent: '测试邮件已发送',
      emailTestFailed: '邮箱测试失败',
      pushplusTestSubmittedWithCode: 'PushPlus 测试请求已提交，流水号：{code}',
      pushplusTestSubmitted: 'PushPlus 测试请求已提交',
      pushplusTestFailed: 'PushPlus 测试失败',
      telegramTestSent: 'Telegram 测试消息已发送',
      telegramTestFailed: 'Telegram 测试失败',
      serverchanTestSent: 'Server 酱测试消息已发送',
      serverchanTestFailed: 'Server 酱测试失败',
      gotifyTestSent: 'Gotify 测试消息已发送',
      gotifyTestFailed: 'Gotify 测试失败',
      barkTestSent: 'Bark 测试消息已发送',
      barkTestFailed: 'Bark 测试失败',
      notifyxTestSent: 'NotifyX 测试消息已发送',
      notifyxTestFailed: 'NotifyX 测试失败',
      appriseTestSent: 'Apprise 测试消息已发送',
      appriseTestFailed: 'Apprise 测试失败',
      zipExportStarted: 'ZIP 导出已开始',
      zipExportFailed: 'ZIP 导出失败',
      backupRestored: '备份已恢复',
      backupAppendedWithSettings: '备份已追加恢复，并覆盖了系统设置',
      backupAppended: '备份已追加恢复',
      wallosImported: 'Wallos 数据已导入',
      webhookSaved: 'Webhook 配置已保存',
      webhookDisabled: 'Webhook 已关闭',
      webhookTestSuccessWithPreview: 'Webhook 测试成功，HTTP {statusCode}：{preview}',
      webhookTestSuccess: 'Webhook 测试成功，HTTP {statusCode}',
      webhookTestFailed: 'Webhook 测试失败'
    },
    about: {
      liteBranch: 'Lite Branch',
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
      title: '仪表盘',
      subtitle: '总览订阅规模、预算使用、待续订与支出分布'
    },
    cards: {
      activeSubscriptions: '活跃订阅',
      renewalsIn7Days: '7 天内续订',
      estimatedMonthlySpend: '本月预计支出',
      estimatedYearlySpend: '年度预计支出'
    },
    sections: {
      monthlyBudgetUsage: '月预算使用',
      yearlyBudgetUsage: '年预算使用',
      tagBudgetOverview: '标签预算概况',
      tagMonthlySpend: '标签月度支出',
      monthlyTrend: '月支付趋势（未来12个月）',
      upcoming30: '即将续订（30天）'
    },
    labels: {
      usedPrefix: '已使用',
      budgetPrefix: '/ 预算',
      configuredTagBudgets: '已配置标签预算',
      nearingBudget: '接近预算',
      overBudget: '超标',
      topUsageRate: '使用率最高'
    },
    empty: {
      noMonthlyBudget: '未设置月预算',
      noYearlyBudget: '未设置年预算',
      noTagBudgetConfigured: '尚未配置标签预算',
      noData: '暂无数据'
    },
    table: {
      subscription: '订阅',
      nextRenewal: '下次续订',
      originalAmount: '原始金额',
      convertedAmount: '折算金额',
      status: '状态'
    }
  },
  budgets: {
    page: {
      title: '预算统计',
      subtitle: '查看总预算使用情况与标签月预算分析'
    },
    sections: {
      monthlyBudgetUsage: '月预算使用',
      yearlyBudgetUsage: '年预算使用',
      tagBudgetUsageRate: '标签预算使用率',
      budgetSummary: '预算摘要',
      topUsageRate: '使用率最高 Top 3',
      tagBudgetUsageTable: '标签预算使用表',
      tagBudget: '标签预算'
    },
    labels: {
      usedPrefix: '已使用',
      budgetPrefix: '/ 预算',
      configuredTagBudgets: '已配置标签预算',
      nearingBudget: '接近预算',
      overBudget: '超标',
      tag: '标签',
      spent: '已使用',
      budget: '预算',
      remainingOrOver: '剩余 / 超出',
      usageRate: '使用率',
      status: '状态',
      remainingPrefix: '剩余',
      overPrefix: '超出'
    },
    empty: {
      noMonthlyBudget: '未设置月预算',
      noYearlyBudget: '未设置年预算',
      noTagBudgetData: '暂无标签预算数据',
      noConfiguredTagBudgets: '尚未配置标签预算'
    },
    hints: {
      section: '标签月预算与总预算相互独立，仅对已配置预算的标签生效。'
    },
    buttons: {
      setTagBudgets: '设置标签月预算'
    },
    status: {
      normal: '正常',
      warning: '接近预算',
      over: '超标'
    },
    messages: {
      saved: '标签月预算已保存'
    }
  },
  calendar: {
    page: {
      title: '订阅日历',
      subtitle: '查看订阅日期分布，支持月视图和列表视图'
    },
    cards: {
      currentMonth: '当前月份',
      currentMonthSuffix: '当前正在查看的月份',
      monthlyRenewalCount: '本月应续订数量',
      monthlyRenewalCountSuffix: '当前月份内的订阅数',
      monthlySpend: '本月预计需支出',
      convertedSuffix: '已按汇率折算',
      selectedDateRenewals: '选中日期订阅数'
    },
    tabs: {
      month: '月视图',
      list: '列表视图'
    },
    detail: {
      dayRenewalsTitle: '当天续订（{date}）',
      dayRenewalsSummary: '共 {count} 笔 · {currency} {amount}',
      noRenewalOnDay: '当天无续订',
      converted: '折算',
      itemsSuffix: '笔'
    },
    table: {
      subscription: '订阅',
      date: '日期',
      amount: '原始金额',
      convertedAmount: '折算金额',
      status: '状态'
    }
  },
  statistics: {
    page: {
      title: '费用统计',
      subtitle: '从趋势、结构和风险三个维度分析订阅支出'
    },
    ai: {
      title: 'AI 总结',
      generatedAtPrefix: '最近生成：',
      collapseDetails: '收起详情',
      viewDetails: '查看详情',
      regenerate: '重新生成总结',
      expandedHint: '基于当前统计自动生成，不会修改订阅数据',
      generatingHint: '正在基于当前统计生成 AI 总结，请稍候…',
      unconfiguredHint: '请先前往系统设置启用 AI 能力与 AI 总结，之后统计页面会自动生成总结。',
      failedFallback: 'AI 总结生成失败，请稍后重试。',
      noSummary: '暂无 AI 总结',
      previewLabel: '摘要',
      updated: 'AI 总结已更新',
      failed: 'AI 总结生成失败'
    },
    sections: {
      monthlyTrend: '月支付趋势（未来12个月）',
      tagSpend: '标签月度支出占比',
      statusDistribution: '状态分布',
      autoRenewShare: '自动续订占比',
      currencyDistribution: '订阅币种分布',
      upcoming30: '未来30天续订分布',
      top10: '月订阅支出 TOP10'
    },
    empty: {
      noData: '暂无数据',
      noUpcoming30: '未来30天暂无续订'
    },
    series: {
      trend: '预测金额',
      renewalCount: '续订数',
      amount: '金额'
    },
    labels: {
      renewalsCountAxis: '续订数',
      autoRenew: '自动续订',
      manualRenew: '手动续订',
      renewalCountTooltip: '订阅数',
      amountTooltip: '月度金额',
      amountAxis: '金额（{currency}）'
    },
    status: {
      active: '正常',
      paused: '暂停',
      cancelled: '停用',
      expired: '过期'
    }
  },
  tags: {
    manage: {
      title: '标签管理',
      description: '在这里统一新增、编辑和删除标签。',
      create: '新增标签',
      tag: '标签',
      sortOrder: '排序',
      subscriptionCount: '订阅数',
      actions: '操作',
      deleteInUseConfirm: '删除后，该标签会从订阅上移除，确认继续？',
      deleteConfirm: '确认删除该标签？'
    },
    form: {
      editTitle: '编辑标签',
      createTitle: '新增标签',
      nameLabel: '标签名称',
      namePlaceholder: '例如：云服务',
      colorLabel: '颜色',
      colorPlaceholder: '#3b82f6 或 rgb(59,130,246)',
      sortOrderLabel: '排序',
      invalidColor: '请输入合法的颜色值，例如 #3b82f6 或 rgb(59,130,246)'
    },
    budget: {
      title: '设置标签月预算',
      description: '为需要单独控制支出的标签设置月预算。未设置的标签不会参与标签预算分析。',
      searchPlaceholder: '搜索标签',
      budgetPlaceholder: '未设置（{currency}）'
    }
  },
  subscriptions: {
    page: {
      title: '订阅管理',
      subtitle: '管理不同周期、不同币种的订阅',
      searchPlaceholder: '搜索名称/描述',
      statusPlaceholder: '状态',
      sortPlaceholder: '排序方式',
      collapseTagFilter: '收起标签筛选',
      expandTagFilter: '展开标签筛选',
      listTitle: '订阅列表',
      noSubscriptions: '暂无订阅',
      selectedItems: '已选 {count} 项',
      selectCurrentPage: '全选当前页',
      clearSelection: '清空选择',
      batchMode: '批量管理',
      exitBatchMode: '退出批量管理',
      dragHandleEnabledTitle: '拖拽调整顺序',
      dragHandleDisabledTitle: '当前排序不可拖拽'
    },
    sort: {
      custom: '自定义顺序',
      renewal: '按下次续订',
      amountDesc: '按金额从高到低',
      name: '按名称'
    },
    status: {
      active: '正常',
      paused: '暂停',
      cancelled: '停用',
      expired: '过期'
    },
    actions: {
      tagManagement: '标签管理',
      create: '新建订阅',
      batchRenew: '批量续订',
      setActive: '设为正常',
      setPaused: '设为暂停',
      setCancelled: '设为停用',
      batchDelete: '批量删除',
      reorder: '调整顺序',
      finishReorder: '完成调整',
      detail: '详情',
      records: '记录',
      edit: '编辑',
      renew: '续订',
      pause: '暂停',
      cancel: '取消',
      resume: '恢复'
    },
    labels: {
      nextRenewal: '下次续订',
      autoRenew: '自动续订',
      note: '备注：',
      currentCycle: '当前周期',
      remainingValue: '剩余价值',
      interval: '订阅频率',
      originalAmount: '原始金额',
      advanceReminders: '到期前提醒',
      overdueReminders: '过期提醒'
    },
    values: {
      interval: '每 {count} {unit}'
    },
    confirm: {
      pause: '确认暂停该订阅？',
      cancel: '确认取消该订阅？',
      resume: '确认恢复该订阅为正常状态？',
      delete: '将删除“{name}”及其续订记录与相关历史，此操作不可恢复，确认继续？'
    },
    messages: {
      subscriptionUpdated: '订阅已更新',
      subscriptionCreated: '订阅已创建',
      subscriptionSaveFailed: '保存失败：{message}',
      tagCreated: '标签已创建',
      tagCreateFailed: '标签创建失败：{message}',
      tagUpdated: '标签已更新',
      tagUpdateFailed: '标签更新失败：{message}',
      tagDeleted: '已删除标签：{name}',
      tagDeleteFailed: '标签删除失败：{message}',
      resetToCurrent: '已重置为当前订阅内容',
      resetForm: '已重置表单',
      logoSearchEmpty: '没有找到可用 Logo',
      logoSearchFailed: 'Logo 搜索失败',
      localLogoLoadFailed: '读取本地 Logo 失败',
      localLogoFirst: '未填写名称或官网时，先为你展示本地已保存 Logo。',
      logoSavedAndApplied: '已保存到本地并应用',
      logoImportFailed: 'Logo 导入失败',
      logoReused: '已从本地库复用',
      localLogoDeleted: '本地 Logo 已删除',
      invalidCustomFrequency: '频率必须为正整数',
      logoDeleteFailed: '删除 Logo 失败',
      logoUploadSuccess: 'Logo 上传成功',
      logoUploadFailed: 'Logo 上传失败',
      chooseRequiredDates: '请选择开始日期和下次续订日期',
      dragSortEnabled: '已开启拖拽排序，仅拖拽手柄可调整顺序',
      orderUpdated: '顺序已更新',
      orderUpdateFailed: '排序更新失败',
      batchActionSuccess: '{label}成功，共 {count} 项',
      batchActionPartial: '{label}完成：成功 {success} 项，失败 {failure} 项',
      batchDeleteSuccess: '批量删除成功，共 {count} 项',
      batchDeletePartial: '批量删除完成：已删除 {success} 项，跳过 {skipped} 项正常订阅，失败 {failure} 项',
      renewed: '已续订：{name}',
      paused: '已暂停',
      resumed: '已恢复',
      cancelled: '已停用',
      deleted: '已删除：{name}'
    },
    batch: {
      selectFirst: '请先选择订阅',
      renewSuccess: '批量续订成功，共 {count} 项',
      renewPartial: '批量续订完成：成功 {success} 项，失败 {failure} 项',
      statusConfirm: '确认将已选的 {count} 项订阅设为{status}吗？',
      deleteConfirmAll: '确认批量删除已选的 {count} 项订阅吗？此操作不可恢复。',
      deleteConfirmPartial: '确认批量删除吗？将删除 {deletable} 项，并跳过 {blocked} 项正常订阅。此操作不可恢复。'
    },
    detail: {
      title: '订阅详情',
      remainingDays: '剩余 {days} 天 / {ratio}'
    },
    form: {
      titleCreate: '新建订阅',
      titleEdit: '订阅信息',
      savingDescription: '保存中，请稍候...',
      namePlaceholder: '例如：GitHub Pro',
      descriptionPlaceholder: '可选，简单记录订阅用途',
      amountPlaceholder: '输入金额，免费可填 0',
      currencyPlaceholder: '选择货币',
      frequencyPlaceholder: '可选 1-12，也可输入任意正整数',
      unitPlaceholder: '选择单位',
      tagPlaceholder: '选择标签',
      websiteLabel: '官网 / 平台地址',
      nextRenewalLabel: '下次续订',
      recalculateNextRenewal: '按开始日期和频率重新计算下次续订',
      advanceReminderRulesPlaceholder: '留空则沿用系统默认，例如：3&09:30;0&09:30;',
      overdueReminderRulesPlaceholder: '留空则沿用系统默认，例如：1&09:30;2&09:30;',
      notesPlaceholder: '可选，记录账号、套餐或特别说明',
      notificationEnabledLabel: '启用提醒通知',
      logo: {
        upload: '点击上传',
        placeholder: 'Logo',
        panelTitle: '选择 Logo',
        webTab: '网络搜索 ({count})',
        libraryTab: '本地已保存 ({count})',
        searching: '正在搜索 Logo...',
        noSearchResults: '当前没有可用的网络搜索结果',
        loadingLocal: '正在加载本地 Logo...',
        noLocalResults: '本地还没有可复用的 Logo',
        noLocalMatches: '没有匹配的本地 Logo',
        localSearchPlaceholder: '搜索已保存 Logo',
        usedCount: '已用 {count} 次',
        source: {
          upload: '本地上传',
          remote: '远程导入',
          wallosZip: 'Wallos ZIP',
          local: '本地库'
        }
      },
      actions: {
        aiRecognize: 'AI 识别',
        previewReminderRules: '预览提醒规则',
        collapseReminderPreview: '收起提醒预览'
      }
    },
    aiModal: {
      title: 'AI 识别订阅',
      description:
        '支持输入文本、上传图片或直接粘贴截图。若当前模型不支持图片识别，将自动回退到本地 OCR 提取文本后再交给模型清洗。识别结果只会回填表单，不会自动保存。',
      loading: '识别中，请稍候...',
      loadingHint: '完成后会自动展示识别结果，无需重复点击。',
      textInput: '文本输入',
      textLabel: '文本内容',
      textPlaceholder: '粘贴订阅邮件、支付记录、订单文本等',
      imageInput: '图片输入',
      imageLabel: '图片',
      uploadImage: '上传图片',
      clearImage: '清空图片',
      imageTip: '支持截图上传，也支持直接粘贴图片',
      pasteHint: '也可以直接在此区域粘贴截图',
      imagePreviewAlt: '识别图片预览',
      confidence: '置信度',
      confidenceWithValue: '置信度：{value}%',
      recognize: '开始识别',
      recognizing: '识别中',
      applyResult: '应用结果',
      resultTitle: '识别结果',
      rawText: '原始提取文本',
      rawTextTitle: '原始提取文本',
      result: '识别结果',
      field: '字段',
      recognizedResult: '识别结果',
      noInput: '请先输入文本或上传图片',
      pleaseProvideInput: '请先输入文本或上传图片',
      recognitionCompleted: '识别完成',
      recognitionFailed: 'AI 识别失败',
      fields: {
        name: '名称',
        description: '描述',
        amount: '金额',
        currency: '货币',
        billingIntervalCount: '频率',
        billingIntervalUnit: '单位',
        startDate: '开始日期',
        nextRenewalDate: '下次续订',
        notifyDaysBefore: '提醒天数',
        websiteUrl: '网址',
        notes: '备注'
      }
    },
    paymentRecords: {
      title: '续订记录',
      noData: '暂无续订记录',
      renewedAt: '续订时间',
      convertedAmount: '折算金额',
      periodStart: '周期开始',
      periodEnd: '周期结束'
    },
    backupModal: {
      title: '恢复备份',
      description:
        '该 ZIP 会恢复订阅、标签、支付记录、排序、系统设置与本地 Logo；不会恢复登录凭据、会话密钥、Webhook 历史和汇率数据',
      pickZip: '选择 ZIP 文件',
      noFileSelected: '未选择文件',
      previewBackup: '预览备份',
      subscriptions: '订阅',
      tags: '标签',
      paymentRecords: '支付记录',
      localLogos: '本地 Logo',
      restoreMode: '恢复模式',
      replaceMode: '清空现有数据后恢复',
      appendMode: '保留现有数据并追加恢复',
      replaceWarning:
        '将删除当前实例中的订阅、标签、支付记录、排序、系统设置和本地 Logo，然后再按文件内容重新恢复',
      appendHelp:
        '追加恢复时：同名标签会复用现有标签；订阅与支付记录按备份中的唯一标识（CUID）幂等跳过；系统设置是否覆盖由你单独选择',
      restoreSettingsLabel: '同时覆盖当前系统设置',
      restorePreview: '恢复预览',
      existingSameNameTags: '现有同名标签：',
      existingSubscriptions: '现有同唯一标识（CUID）订阅：',
      existingPaymentRecords: '现有同唯一标识（CUID）支付记录：',
      warnings: '警告信息',
      confirmRestore: '确认恢复',
      invalidZip: '备份 ZIP 无法解析',
      previewFailed: '备份预览失败',
      previewGenerated: '已生成备份预览',
      nothingImported: '未导入任何新数据，重复项已自动跳过',
      restoreCompleted: '恢复完成：{subscriptions} 条订阅，{tags} 个新标签，{payments} 条支付记录，{logos} 个 Logo',
      restoreFailed: '恢复失败'
    }
  },
  imports: {
    wallos: {
      title: '导入 Wallos 数据',
      description: '支持上传 Wallos 的 JSON、SQLite 数据库或 ZIP 包。当前只导入实际被订阅使用到的标签。',
      pickFile: '选择文件',
      preview: '生成预览',
      confirmImport: '确认导入',
      previewTitle: '导入预览',
      warningTitle: '警告信息',
      sourceTimezoneLabel: 'Wallos 源时区（高级）',
      sourceTimezonePlaceholder: '默认使用当前业务时区',
      sourceTimezoneHint: '仅在导出的 Wallos 实例使用了不同的 TZ 时需要调整，否则保持默认即可。',
      importTypeLabel: '导入类型',
      importableSubscriptionsLabel: '可导入订阅',
      importedTagsLabel: '实际导入标签',
      zipLogoLabel: 'ZIP Logo 匹配',
      tagPreviewTitle: '标签预览',
      noImportableTags: '没有可导入的标签',
      subscriptionPreviewTitle: '订阅预览',
      jsonWarning:
        '检测到 Wallos JSON 导入。推荐优先使用 Wallos DB 导入：DB 包含 start_date、完整币种代码等更完整信息；JSON 虽可导入，但可能出现开始日期代填、币种推断等字段降级。',
      noWarnings: '没有额外警告',
      warningCount: '共 {count} 条警告',
      sourceId: '来源 ID',
      tagName: '标签名',
      order: '排序',
      name: '名称',
      amount: '金额',
      frequency: '频率',
      nextRenewal: '下次续订',
      tags: '标签',
      noTags: '未打标签',
      autoRenew: '自动续订',
      yes: '是',
      no: '否',
      status: '状态',
      logo: 'Logo',
      logoNone: '无',
      logoPending: '待匹配',
      logoReady: 'ZIP 可导入',
      previewGenerated: '已生成导入预览',
      previewFailed: '预览生成失败',
      importCompleted: '导入完成：{subscriptions} 条订阅，{tags} 个标签，{logos} 个 Logo',
      importFailed: '导入失败',
      fileTypes: {
        json: 'JSON',
        db: 'SQLite',
        zip: 'ZIP'
      }
    }
  },
  notifications: {
    channels: {
      email: '邮箱',
      pushplus: 'PushPlus',
      telegram: 'Telegram',
      serverchan: 'Server 酱',
      gotify: 'Gotify',
      bark: 'Bark',
      notifyx: 'NotifyX',
      apprise: 'Apprise',
      webhook: 'Webhook'
    },
    status: {
      success: '成功',
      skipped: '跳过',
      failed: '失败'
    },
    phases: {
      summary: '订阅提醒汇总',
      upcoming: '即将到期',
      dueToday: '今天到期',
      overdue: '过期提醒',
      daysUntil: '还有 {days} 天到期',
      overdueDay: '已过期第 {days} 天'
    },
    labels: {
      reminderType: '提醒类型：{value}',
      subscriptionCount: '订阅数量：{count} 项',
      subscriptionName: '订阅名称：{name}',
      date: '日期：{value}',
      amount: '金额：{value}',
      details: '说明：{value}',
      tags: '标签：{value}',
      website: '网址：{value}',
      notes: '备注：{value}',
      sectionTitle: '{title}（{count} 项）'
    },
    values: {
      daysUntil: '还有 {days} 天',
      overdueDays: '过期 {days} 天'
    },
    titles: {
      summaryCount: '{phase}：共 {count} 项订阅',
      single: '{phase}：{name}'
    },
    forgotPassword: {
      title: 'SubTracker 密码重置验证码',
      username: '用户名：{username}',
      code: '验证码：{code}',
      expiresInMinutes: '有效期：{minutes} 分钟',
      ignoreHint: '如果这不是你的操作，请忽略本次通知。'
    },
    tests: {
      title: '测试通知：{name}',
      intro: '这是一条测试通知，用于验证当前通知渠道和模板配置。',
      subscriptionName: '测试订阅',
      tagName: '测试标签',
      note: '这是一条测试通知'
    },
    merge: {
      phaseUpcoming: '即将到期',
      phaseDueToday: '今天到期',
      phaseOverdueDay: '已过期第 {days} 天',
      summaryName: '共 {count} 项订阅'
    },
    presentation: {
      unnamedSubscription: '未命名订阅',
      mergedTitle: '{prefix}：共 {count} 项订阅',
      sectionTitle: '{title}（{count} 项）',
      reminderType: '提醒类型：{value}',
      subscriptionCount: '订阅数量：{count} 项',
      subscriptionName: '订阅名称：{name}',
      nextRenewal: '下次续订：{value}',
      amount: '金额：{value}',
      tags: '标签：{value}',
      website: '网址：{value}',
      notes: '备注：{value}',
      details: '说明：{value}',
      daysUntil: '还有 {days} 天',
      overdueDays: '过期 {days} 天'
    },
    logs: {
      dispatchSummary: '[notification] {name}：通知渠道 {successCount} 个成功，{failedCount} 个失败，{skippedCount} 个跳过。{details}',
      allSkipped: '[notification] {name}：所有通知渠道均已跳过。{details}'
    },
    wrappers: {
      detailStart: '（',
      detailEnd: '）'
    }
  },
  formatting: {
    monthLabel: {
      long: 'YYYY 年 M 月'
    }
  },
  validation: {
    timezoneInvalid: '时区不合法',
    notificationTargetUrl: {
      invalidFormat: '{label} 格式无效',
      unsupportedProtocol: '{label} 仅支持 http 或 https',
      privateHostBlocked: '{label} 不允许指向本地或内网地址'
    },
    websiteUrlInvalid: '请输入合法网址，例如 https://example.com',
    subscriptionForm: {
      nameRequired: '请填写名称',
      nameTooLong: '名称不能超过 150 个字符',
      descriptionTooLong: '描述不能超过 500 个字符',
      amountInvalid: '请填写有效金额',
      currencyInvalid: '请选择合法货币',
      billingIntervalCountInvalid: '频率必须为正整数',
      billingIntervalUnitRequired: '请选择频率单位',
      startDateRequired: '请选择开始日期',
      nextRenewalDateRequired: '请选择下次续订日期',
      nextRenewalDateEarlierThanStartDate: '下次续订日期不能早于开始日期',
      notesTooLong: '备注不能超过 1000 个字符'
    },
    reminderRules: {
      fallback: '沿用系统默认',
      emptyTitle: '请先输入规则后再演算',
      resultTitle: '演算结果',
      invalidTitle: '规则格式有误',
      defaultRulesLabel: '系统默认规则',
      defaultAdvanceRulesLabel: '系统默认到期前规则',
      defaultOverdueRulesLabel: '系统默认过期规则',
      fallbackPreviewTitle: '当前未填写，以下按{label}演算',
      fallbackInvalidTitle: '{label}格式有误',
      noAdvance: '暂无到期前提醒规则',
      noOverdue: '暂无过期提醒规则',
      parseFailed: '规则解析失败',
      invalidSegmentFormat: '规则 "{segment}" 格式无效，应为 天数&HH:mm',
      invalidDaysInteger: '规则 "{segment}" 中的天数必须为整数',
      invalidOverdueDays: '规则 "{segment}" 中的天数必须大于等于 1',
      invalidAdvanceDays: '规则 "{segment}" 中的天数不能小于 0',
      invalidTime: '规则 "{segment}" 中的时间必须为 HH:mm',
      inlineAdvanceSameDay: '当天 {time}',
      inlineAdvanceBefore: '提前 {days} 天 {time}',
      inlineOverdue: '过期 {days} 天 {time}',
      evalAdvanceSameDay: '到期当天 {time} 提醒',
      evalAdvanceBefore: '提前 {days} 天 {time} 提醒',
      evalOverdue: '过期 {days} 天 {time} 提醒'
    }
  },
  ai: {
    status: {
      textFast: '识别中，通常几秒内完成，请勿重复点击。',
      textSlow: '仍在识别中，模型响应可能稍慢，请继续稍候。',
      imageFast: '正在识别图片与文本，通常需要 5-10 秒，请勿关闭窗口。',
      imageSlow: '图片识别仍在进行中，外部模型响应较慢，请再稍候片刻。'
    },
    prompts: {
      common: {
        jsonOnlySuffix: '必须只返回合法 JSON 对象，不要返回 Markdown、代码块或额外解释。',
        originalTextLabel: '原始文本',
        ocrExtractedTextLabel: 'OCR 提取文本',
        returnOkOnly: '请只返回 OK',
        visionConfirmSystem: '请根据用户发送的图片进行响应，只返回一句简短确认。',
        visionConfirmUser: '请确认你已成功接收到这张测试图片。'
      },
      subscription: {
        default: `你是订阅账单信息提取助手。请从输入的文本或截图中提取订阅信息，并且只返回 JSON。
输出字段：
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

规则：
1. 不确定就留空，不要猜。
2. 金额必须是数字。
3. 币种必须是 3 位大写代码，例如 CNY、USD。
4. 周期单位必须在 day/week/month/quarter/year 中。
5. 只返回 JSON，不要返回 Markdown。`
      },
      dashboard: {
        summary: {
          default: `你是订阅运营摘要助手。请基于用户当前的订阅统计数据，输出一份简洁、准确、可执行的 Markdown 总结。

目标：
1. 帮助用户快速理解当前订阅规模、支出结构、预算压力和近期续订风险。
2. 总结数据中的明显模式、异常点和需要关注的事项。
3. 给出中性、可执行、但不依赖具体服务功能知识的建议。

硬性要求：
- 只能基于输入数据分析，不要虚构事实。
- 不要假设你了解某个订阅服务的功能细节。
- 不要输出“取消某服务更省钱”“某两个服务功能重叠”之类的建议。
- 不要臆测用户偏好、使用频率或用途。
- 不要输出 JSON，不要输出代码块，只输出 Markdown 正文。

输出建议结构：
## 总览
## 支出结构
## 近期风险
## 值得注意的模式
## 中性建议

写作要求：
- 使用简体中文。
- 结论明确，少空话。
- 每个小节控制在 2~5 条要点内。
- 如果某部分没有明显异常，直接说明“暂无显著异常”或“整体平稳”。`
        },
        user: {
          request: '以下是当前订阅统计数据，请输出 Markdown 总结：\n\n{payload}'
        },
        preview: {
          default: `你是订阅统计摘要压缩助手。请根据已经生成好的完整 AI 总结，提炼出一个默认折叠展示用的超简短摘要。

硬性要求：
- 只输出简体中文纯文本，不要输出 Markdown，不要输出代码块。
- 输出 2 到 3 行，每行一句，自然换行。
- 不要输出标题，不要输出项目符号，不要编号。
- 只保留最重要的结论：订阅规模、预算压力、近期风险。
- 不要发散，不要补充原文没有的信息。
- 如果原文信息有限，就直接给出 1 到 2 句自然语言摘要。`
        },
        previewUser: {
          request: '以下是已经生成好的完整 AI 总结，请提炼一个默认折叠展示用的超简短摘要：\n\n{payload}'
        }
      }
    }
  },
  scheduler: {
    channelSummary: {
      item: '{channel}:成功{success}/失败{failed}/跳过{skipped}'
    },
    logs: {
      reminderScan:
        '[cron] subscription reminders scanned：候选 {processedCount}，命中 {matchedReminderCount}，通知 {notificationCount}{channelSummary}',
      notificationDedupCleanup: '[cron] notification dedup cleanup：清理 {deleted} 条旧记录',
      exchangeRatesRefreshed: '[cron] exchange rates refreshed',
      exchangeRateRefreshFailed: '[cron] exchange rate refresh failed',
      reminderScanFailed: '[cron] reminder scan failed'
    }
  },
  logos: {
    search: {
      manifestIcon: 'Manifest 图标{sizeLabel}',
      appleTouchIcon: 'Apple Touch Icon',
      maskIcon: 'Mask Icon',
      siteIcon: '站点图标',
      siteShareImage: '站点分享图',
      duckduckgoCandidate: 'DuckDuckGo 候选 {index}',
      braveCandidate: 'Brave 候选 {index}',
      siteFavicon: '站点 favicon',
      googleFavicon: 'Google Favicon',
      iconHorse: 'Icon Horse',
      clearbitLogo: 'Clearbit Logo'
    },
    library: {
      unusedLogo: '未使用 Logo'
    }
  },
  api: {
    runtime: {
      initialExchangeRateRefreshFailed: '[api] 初始汇率刷新失败，将回退到已有汇率数据。',
      started: '[api] 已启动: http://{host}:{port}'
    },
    errors: {
      unauthorized: '请先登录',
      tooManyAttempts: '登录失败次数过多，请稍后再试',
      internal: '未知服务端错误',
      logoNotFound: 'Logo 不存在',
      conflict: '资源冲突',
      validation: {
        invalidSettingsPayload: '设置请求体不合法',
        invalidReminderRules: '提醒规则不合法',
        invalidEmailConfigPayload: '邮箱配置请求体不合法',
        invalidPushplusConfigPayload: 'PushPlus 配置请求体不合法',
        invalidTelegramConfigPayload: 'Telegram 配置请求体不合法',
        invalidServerchanConfigPayload: 'Server 酱配置请求体不合法',
        invalidGotifyConfigPayload: 'Gotify 配置请求体不合法',
        invalidBarkConfigPayload: 'Bark 配置请求体不合法',
        invalidNotifyxConfigPayload: 'NotifyX 配置请求体不合法',
        invalidAppriseConfigPayload: 'Apprise 配置请求体不合法',
        invalidWebhookSettingsPayload: 'Webhook 配置请求体不合法',
        invalidForgotPasswordRequestPayload: '忘记密码请求体不合法',
        invalidForgotPasswordResetPayload: '忘记密码重置请求体不合法',
        invalidPasswordPayload: '密码请求体不合法',
        invalidCredentialsPayload: '账号密码请求体不合法',
        invalidAiConfigPayload: 'AI 配置请求体不合法',
        invalidScanDebugPayload: '通知调试扫描请求体不合法',
        invalidWallosInspectPayload: 'Wallos 预览请求体不合法',
        invalidWallosCommitPayload: 'Wallos 导入请求体不合法',
        invalidSubtrackerBackupInspectPayload: 'SubTracker 备份预览请求体不合法',
        invalidSubtrackerBackupCommitPayload: 'SubTracker 备份恢复请求体不合法',
        invalidTagPayload: '标签请求体不合法',
        invalidTagId: '标签 ID 不合法',
        invalidCurrentVersionQuery: '当前版本查询参数不合法',
        invalidLogoSearchPayload: 'Logo 搜索请求体不合法',
        invalidLogoFilename: 'Logo 文件名不合法',
        invalidLogoUploadPayload: 'Logo 上传请求体不合法',
        invalidLogoImportPayload: 'Logo 导入请求体不合法',
        invalidQuery: '查询参数不合法',
        invalidReorderPayload: '排序请求体不合法',
        invalidBatchRenewPayload: '批量续订请求体不合法',
        invalidBatchStatusPayload: '批量状态更新请求体不合法',
        invalidBatchPausePayload: '批量暂停请求体不合法',
        invalidBatchCancelPayload: '批量停用请求体不合法',
        invalidBatchDeletePayload: '批量删除请求体不合法',
        invalidSubscriptionId: '订阅 ID 不合法',
        invalidSubscriptionPayload: '订阅请求体不合法',
        invalidUpdatePayload: '订阅更新请求体不合法',
        invalidRenewPayload: '续订请求体不合法',
        invalidWebhookUrlRequired: '启用 Webhook 时必须填写 URL'
      },
      auth: {
        invalidCredentials: '用户名或密码错误',
        currentCredentialsInvalid: '原用户名或原密码错误',
        defaultPasswordChangeNotAllowed: '默认密码修改当前不可用',
        forgotPasswordDisabled: '当前未开启忘记密码，或未配置可用通知渠道',
        forgotPasswordRequestRateLimited: '验证码发送过于频繁，请稍后再试',
        forgotPasswordRequestCooldown: '验证码刚刚发送过，请稍后再试',
        forgotPasswordDeliveryFailed: '验证码发送失败，请检查通知配置',
        forgotPasswordResetRateLimited: '验证失败次数过多，请稍后再试',
        forgotPasswordChallengeNotFound: '验证码无效或已失效',
        forgotPasswordAttemptsExhausted: '验证码尝试次数已用尽，请重新获取',
        forgotPasswordCodeInvalid: '验证码错误次数过多，请重新获取',
        forgotPasswordCodeInvalidWithAttempts: '验证码错误，还可重试 {attempts} 次',
        forgotPasswordResetFailed: '密码重置失败',
        forgotPasswordChannelRequired: '请先启用至少一个可直达的通知渠道，再开启忘记密码'
      },
      settings: {
        emailFieldsRequired: '启用邮箱通知时必须填写：{fields}',
        pushplusTokenRequired: '启用 PushPlus 时必须填写 Token',
        telegramFieldsRequired: '启用 Telegram 通知时必须填写：{fields}',
        serverchanSendKeyRequired: '启用 Server 酱时必须填写 SendKey',
        gotifyFieldsRequired: '启用 Gotify 时必须填写：{fields}',
        barkFieldsRequired: '启用 Bark 时必须填写：{fields}',
        notifyxFieldsRequired: '启用 NotifyX 时必须填写：{fields}',
        appriseFieldsRequired: '启用 Apprise 时必须填写：{fields}',
        appriseTargetsRequired: '启用 Apprise 时至少需要一个通知地址',
        appriseEnabledTargetsRequired: '启用 Apprise 时至少要保留一个启用中的通知地址',
        appriseTargetFieldsRequired: '每个 Apprise 通知地址都必须包含 ID、名称和 URL',
        appriseTargetUrlDuplicate: 'Apprise 通知地址 URL 不能重复',
        aiFieldsRequired: '启用 AI 能力时必须填写：{fields}'
      },
      ai: {
        disabled: 'AI 能力未启用',
        configIncomplete: 'AI 配置不完整',
        summaryDisabled: 'AI 总结未启用',
        summaryConfigIncomplete: 'AI 总结配置不完整',
        invalidRecognitionInput: 'AI 识别输入不合法',
        noValidContent: 'AI 未返回有效内容',
        noRecognizableText: '未获取到可用于识别的文本内容',
        ocrNoValidText: '图片 OCR 未识别出有效文本，请改为手动输入文本内容',
        visionCapabilityDisabled: '当前 Provider 未启用视觉输入能力',
        connectionTestFailed: 'AI 连接测试失败',
        visionTestFailed: 'AI 视觉测试失败',
        recognitionFailed: 'AI 识别失败',
        summaryRequestFailed: 'AI 总结请求失败',
        summaryEmpty: 'AI 总结返回空内容',
        summaryPreviewRequestFailed: 'AI 摘要提炼失败',
        summaryPreviewEmpty: 'AI 摘要提炼返回空内容',
        summaryFetchFailed: '获取 AI 总结失败',
        summaryGenerateFailed: '生成 AI 总结失败'
      },
      notifications: {
        emailDisabledOrIncomplete: '邮箱通知未启用或配置不完整',
        pushplusDisabledOrIncomplete: 'PushPlus 通知未启用或配置不完整',
        telegramDisabledOrIncomplete: 'Telegram 通知未启用或配置不完整',
        serverchanDisabledOrIncomplete: 'Server 酱通知未启用或配置不完整',
        gotifyDisabledOrIncomplete: 'Gotify 通知未启用或配置不完整',
        barkDisabledOrIncomplete: 'Bark 通知未启用或配置不完整',
        notifyxDisabledOrIncomplete: 'NotifyX 通知未启用或配置不完整',
        appriseDisabledOrIncomplete: 'Apprise 通知未启用或配置不完整',
        appriseSyncFailed: '同步 Apprise 配置失败',
        appriseRequestFailed: 'Apprise 请求失败',
        appriseTargetNotFound: '指定的 Apprise 通知地址不存在',
        emptyDedupEntries: '无法从空的去重记录构建通知分发参数',
        resendRequestFailed: 'Resend 请求失败',
        pushplusRequestFailed: 'PushPlus 请求失败',
        pushplusInvalidResponse: 'PushPlus 返回了无法解析的响应',
        pushplusRejected: 'PushPlus 请求被拒绝',
        pushplusSubmitted: '请求已提交',
        telegramRequestFailed: 'Telegram 请求失败',
        telegramInvalidResponse: 'Telegram 返回了无法解析的响应',
        telegramRejected: 'Telegram 请求被拒绝',
        serverchanRequestFailed: 'Server 酱请求失败',
        serverchanInvalidResponse: 'Server 酱返回了无法解析的响应',
        serverchanRejected: 'Server 酱请求被拒绝',
        gotifyRequestFailed: 'Gotify 请求失败',
        barkRequestFailed: 'Bark 请求失败',
        barkInvalidResponse: 'Bark 返回了无法解析的响应',
        barkRejected: 'Bark 请求被拒绝',
        notifyxRequestFailed: 'NotifyX 请求失败',
        notifyxInvalidResponse: 'NotifyX 返回了无法解析的响应',
        notifyxRejected: 'NotifyX 请求被拒绝',
        webhookConfigIncomplete: 'Webhook 配置不完整',
        webhookTestFailed: 'Webhook 测试失败',
        emailTestFailed: '邮箱测试失败',
        pushplusTestFailed: 'PushPlus 测试失败',
        telegramTestFailed: 'Telegram 测试失败',
        serverchanTestFailed: 'Server 酱测试失败',
        gotifyTestFailed: 'Gotify 测试失败',
        barkTestFailed: 'Bark 测试失败',
        notifyxTestFailed: 'NotifyX 测试失败',
        appriseTestFailed: 'Apprise 测试失败'
      },
      imports: {
        wallosInspectFailed: 'Wallos 预览失败',
        wallosCommitFailed: 'Wallos 导入失败',
        subtrackerBackupInspectFailed: 'SubTracker 备份预览失败',
        subtrackerBackupCommitFailed: 'SubTracker 备份恢复失败',
        subtrackerBackupManifestInvalid: '备份 manifest 格式无效',
        subtrackerBackupInvalidFile: '不是合法的 SubTracker 备份文件',
        subtrackerBackupUnsupportedVersion: '不支持的备份版本：{version}',
        subtrackerBackupUnsupportedScope: '不支持的备份范围：{scope}',
        subtrackerBackupManifestMissingData: '备份 manifest 缺少关键数据',
        subtrackerBackupFileEmpty: '备份文件内容为空',
        subtrackerBackupMissingManifest: '备份 ZIP 缺少 manifest.json',
        subtrackerBackupMissingLogo: '备份 ZIP 缺少 Logo 文件：{path}',
        importTokenInvalid: '导入令牌不存在或已失效，请重新生成预览',
        wallosDatabaseEmpty: '数据库文件内容为空'
      },
      wallosWarnings: {
        cycleMissingFallback: 'cycle 缺失，已回退为每 1 月',
        cycleDaysFallback: 'cycle.days={days} 无法直接映射，已转为每 {mappedDays} 天',
        priceEmptyFallback: '价格为空，已回退为 0 CNY',
        priceParseFallback: '价格 "{text}" 无法完整解析，已回退为 0 {currency}',
        priceCurrencyAmbiguousUsd: '价格 "{text}" 的币种符号存在歧义，已默认按 USD 导入',
        priceCurrencyAmbiguousCny: '价格 "{text}" 的币种符号存在歧义，已默认按 CNY 导入',
        priceCurrencyMissing: '价格 "{text}" 未包含明确币种，已默认按 CNY 导入',
        websiteMissingProtocol: '网址 "{raw}" 缺少协议，已自动补全为 {withHttps}',
        websiteInvalidIgnored: '网址 "{raw}" 无法识别为合法链接，已忽略',
        paymentCycleFallback: 'Payment Cycle "{text}" 无法完整解析，已回退为每 1 月',
        jsonStartDateFallback: 'Wallos JSON 不包含 start_date，已使用 Next Payment 代填开始日期',
        jsonMissingRequiredSkipped: 'json#{index} 缺少名称或下次支付时间，已跳过',
        subscriptionMissingRequiredSkipped: 'subscription#{id} 缺少关键字段，已跳过',
        subscriptionPrefix: 'subscription#{id}',
        subscriptionPrefixed: 'subscription#{id} {warning}',
        subscriptionLogoMissing: 'subscription#{id} 存在 Logo 文件引用，当前包内未匹配到图片',
        logoNeedsManualFill: 'Logo 文件需后续通过目录或 zip 包补齐'
      },
      subtrackerBackupWarnings: {
        noLocalLogos: '该备份不包含本地 Logo 文件',
        noPaymentRecords: '该备份不包含支付记录',
        excludedSecretsAndHistory: '不会恢复登录凭据、会话密钥、Webhook 历史和汇率数据',
        appendModeDedup: '追加导入时，订阅与支付记录按备份中的唯一标识（CUID）幂等跳过；同名标签会复用现有标签'
      },
      wallosZipMissingDatabase: 'ZIP 中未找到 db/wallos.db',
      wallosMissingTables: '缺少 Wallos 关键表：{tables}',
      wallosJsonParseFailed: 'JSON 解析失败',
      wallosJsonMustBeArray: 'Wallos JSON 导出内容必须是数组',
      tags: {
        nameExists: '标签名称已存在',
        updateFailed: '标签更新失败',
        notFound: '标签不存在'
      },
      version: {
        updateFetchFailed: '获取版本更新失败'
      },
      exchangeRates: {
        refreshFailed: '刷新汇率失败',
        payloadEmpty: '汇率数据内容为空'
      },
      subscriptions: {
        notFound: '订阅不存在',
        logoDeleteFailed: 'Logo 删除失败',
        logoUploadFailed: 'Logo 上传失败',
        logoImportFailed: 'Logo 导入失败',
        logoUnsupportedImageType: '不支持的 Logo 图片类型',
        logoBufferEmpty: 'Logo 图片内容为空',
        logoUploadTypeUnsupported: '仅支持 PNG、JPG、WEBP、SVG 图片',
        imageBufferEmpty: '图片内容为空',
        logoRemoteUnavailable: '远程 Logo 下载失败或图片不可用',
        logoFilenameInvalid: '无效的 Logo 文件名',
        logoInUseCannotDelete: '该 Logo 已被订阅使用，不能删除',
        renewFailed: '续订失败',
        activeDeleteNotAllowed: '正常中的订阅不能直接删除，请先暂停或停用',
        batchPauseOnlyActive: '批量暂停仅支持正常状态的订阅',
        batchCancelOnlyActive: '批量停用仅支持正常状态的订阅',
        activeDeleteBlocked: '正常中的订阅不能直接删除',
        websiteUrlInvalid: 'websiteUrl 格式无效，请填写合法网址'
      }
    }
  }
} as const
