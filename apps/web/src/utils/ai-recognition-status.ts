import { getMessage } from '@subtracker/shared'
import { getAppLocale } from '@/locales'

export function getAiRecognitionStatusText(input: { hasImage: boolean; elapsedMs: number }) {
  const locale = getAppLocale()
  if (input.hasImage) {
    if (input.elapsedMs >= 12_000) {
      return getMessage(locale, 'ai.status.imageSlow')
    }
    return getMessage(locale, 'ai.status.imageFast')
  }

  if (input.elapsedMs >= 6_000) {
    return getMessage(locale, 'ai.status.textSlow')
  }

  return getMessage(locale, 'ai.status.textFast')
}
