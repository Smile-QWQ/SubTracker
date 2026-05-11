import { t } from '@/locales'

export function getAiRecognitionStatusText(input: { hasImage: boolean; elapsedMs: number }) {
  if (!input.hasImage) {
    return input.elapsedMs >= 6_000
      ? t('ai.status.textSlow')
      : t('ai.status.textFast')
  }

  return input.elapsedMs >= 12_000
    ? t('ai.status.imageSlow')
    : t('ai.status.imageFast')
}
