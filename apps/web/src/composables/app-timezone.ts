import { computed } from 'vue'
import { useSettingsQuery } from '@/composables/settings-query'
import { DEFAULT_APP_TIMEZONE, normalizeAppTimezone } from '@/utils/timezone'

export function useAppTimezone() {
  const { data: settings } = useSettingsQuery()

  const timezone = computed(() => normalizeAppTimezone(settings.value?.timezone || DEFAULT_APP_TIMEZONE))

  return {
    timezone
  }
}
