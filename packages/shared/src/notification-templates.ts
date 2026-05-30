import { z } from 'zod'
import { getMessage } from './i18n'
import { DEFAULT_APP_LOCALE, type AppLocale } from './locale-core'

export const NotificationTemplateGroupSchema = z.enum(['text', 'markdown', 'html'])
export const NotificationTemplateSceneSchema = z.enum(['singleReminder', 'mergedReminder', 'testNotification', 'forgotPassword'])

export type NotificationTemplateGroup = z.infer<typeof NotificationTemplateGroupSchema>
export type NotificationTemplateScene = z.infer<typeof NotificationTemplateSceneSchema>

export const NotificationTemplateEntrySchema = z.object({
  titleTemplate: z.string().max(5000).default(''),
  bodyTemplate: z.string().max(20000).default('')
})

export type NotificationTemplateEntryInput = z.infer<typeof NotificationTemplateEntrySchema>

export const NotificationTemplateSectionSchema = z.object({
  singleReminder: NotificationTemplateEntrySchema.default({}),
  mergedReminder: NotificationTemplateEntrySchema.default({}),
  testNotification: NotificationTemplateEntrySchema.default({}),
  forgotPassword: NotificationTemplateEntrySchema.default({})
})

export type NotificationTemplateSectionInput = z.infer<typeof NotificationTemplateSectionSchema>

export const NotificationTemplateConfigSchema = z.object({
  text: NotificationTemplateSectionSchema.default({}),
  markdown: NotificationTemplateSectionSchema.default({}),
  html: NotificationTemplateSectionSchema.default({})
})

export type NotificationTemplateConfigInput = z.infer<typeof NotificationTemplateConfigSchema>

export const NOTIFICATION_TEMPLATE_GROUPS = NotificationTemplateGroupSchema.options
export const NOTIFICATION_TEMPLATE_SCENES = NotificationTemplateSceneSchema.options

function buildSingleTitleTemplate(locale: AppLocale) {
  return getMessage(locale, 'notifications.titles.single', {
    phase: '{{phaseLabel}}',
    name: '{{subscription.name}}'
  })
}

function buildMergedTitleTemplate(locale: AppLocale) {
  return getMessage(locale, 'notifications.presentation.mergedTitle', {
    prefix: '{{phaseLabel}}',
    count: '{{subscriptionCount}}'
  })
}

function buildForgotPasswordTitleTemplate(locale: AppLocale) {
  return getMessage(locale, 'notifications.forgotPassword.title')
}

function buildTestTitleTemplate(locale: AppLocale) {
  return getMessage(locale, 'notifications.tests.title', {
    name: '{{subscription.name}}'
  })
}

function buildBodyTemplate(group: NotificationTemplateGroup, scene: NotificationTemplateScene, locale: AppLocale) {
  if (scene === 'forgotPassword') {
    return group === 'html'
      ? '<div class="subtracker-notification subtracker-notification--forgot-password">{{forgotPasswordBlock}}</div>'
      : '{{forgotPasswordBlock}}'
  }

  if (scene === 'testNotification') {
    if (group === 'html') {
      return ['<div class="subtracker-notification subtracker-notification--test">', '{{testIntroBlock}}', '{{detailsBlock}}', '</div>'].join('\n')
    }

    return ['{{testIntroBlock}}', '', '{{detailsBlock}}'].join('\n')
  }

  if (scene === 'mergedReminder') {
    if (group === 'html') {
      return ['<div class="subtracker-notification subtracker-notification--merged">', '{{summaryBlock}}', '{{sectionsBlock}}', '</div>'].join('\n')
    }

    return ['{{summaryBlock}}', '', '{{sectionsBlock}}'].join('\n')
  }

  if (group === 'html') {
    return ['<div class="subtracker-notification subtracker-notification--single">', '{{detailsBlock}}', '</div>'].join('\n')
  }

  return '{{detailsBlock}}'
}

export function getDefaultNotificationTemplate(
  group: NotificationTemplateGroup,
  scene: NotificationTemplateScene,
  locale: AppLocale = DEFAULT_APP_LOCALE
): NotificationTemplateEntryInput {
  const titleTemplate =
    scene === 'singleReminder'
      ? buildSingleTitleTemplate(locale)
      : scene === 'mergedReminder'
        ? buildMergedTitleTemplate(locale)
        : scene === 'forgotPassword'
          ? buildForgotPasswordTitleTemplate(locale)
          : buildTestTitleTemplate(locale)

  return {
    titleTemplate,
    bodyTemplate: buildBodyTemplate(group, scene, locale)
  }
}

export function createEmptyNotificationTemplateConfig(): NotificationTemplateConfigInput {
  return NotificationTemplateConfigSchema.parse({})
}

export function resolveNotificationTemplateConfig(
  input: Partial<NotificationTemplateConfigInput> | null | undefined,
  locale: AppLocale = DEFAULT_APP_LOCALE
): NotificationTemplateConfigInput {
  const parsed = NotificationTemplateConfigSchema.parse(input ?? {})
  const resolved = createEmptyNotificationTemplateConfig()

  for (const group of NOTIFICATION_TEMPLATE_GROUPS) {
    for (const scene of NOTIFICATION_TEMPLATE_SCENES) {
      const defaults = getDefaultNotificationTemplate(group, scene, locale)
      const current = parsed[group][scene]
      resolved[group][scene] = {
        titleTemplate: current.titleTemplate.trim() || defaults.titleTemplate,
        bodyTemplate: current.bodyTemplate.trim() || defaults.bodyTemplate
      }
    }
  }

  return resolved
}

export function applyNotificationTemplate(template: string, values: Record<string, string>) {
  return String(template ?? '')
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, rawKey) => {
      const key = String(rawKey).trim()
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
    })
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
