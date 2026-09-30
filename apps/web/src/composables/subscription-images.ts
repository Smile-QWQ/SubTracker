import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { detectLogoContentType } from '@subtracker/shared'
import { api } from '@/composables/api'
import { t } from '@/locales'
import { AUTH_SESSION_CHANGE_EVENT, getStoredToken } from '@/utils/auth-storage'
import type { SubscriptionImage, SubscriptionImageUpload } from '@/types/api'

export const SUBSCRIPTION_IMAGE_LIMIT = 20
export const SUBSCRIPTION_IMAGE_MAX_BYTES = 20 * 1024 * 1024

interface ImagePreview extends SubscriptionImage {
  previewUrl: string
  previewFailed: boolean
}

/** Owns private blob URLs and pending uploads for exactly one form/drawer session. */
export function useSubscriptionImages(options: {
  active: () => boolean
  subscriptionId: () => string | undefined
  source?: () => unknown
  disabled?: () => boolean
}) {
  const state = reactive({
    images: [] as ImagePreview[],
    loaded: false,
    loading: false,
    working: false,
    currentFile: '',
    loadError: '',
    errors: [] as string[],
    confirmingSvg: false
  })
  const pending = new Set<string>()
  let generation = 0
  const open = ref(false)
  let sessionToken = getStoredToken()
  let settleConfirmation: ((accepted: boolean) => void) | undefined
  const ready = computed(() => open.value && state.loaded && !state.loading && !state.working)
  const editable = () => ready.value && !options.disabled?.()
  const current = (version: number) => open.value && version === generation && options.active() && sessionToken === getStoredToken()

  async function deletePending(id: string, version: number) {
    try {
      await api.deleteSubscriptionImage(id)
      return true
    } catch (error) {
      if (current(version)) state.errors.push(errorText(error))
      return false
    }
  }

  function dispose() {
    open.value = false
    const previousGeneration = generation++
    confirmSvg(false)
    for (const image of state.images) revoke(image)
    state.images = []
    for (const id of pending) void deletePending(id, previousGeneration)
    pending.clear()
    state.loaded = false
    state.loading = false
    state.working = false
    state.currentFile = ''
    state.loadError = ''
    state.errors = []
  }

  async function reset() {
    dispose()
    if (!options.active()) return
    open.value = true
    sessionToken = getStoredToken()
    const version = generation
    const id = options.subscriptionId()
    if (!id) {
      state.loaded = true
      return
    }
    state.loading = true
    try {
      const images = await api.getSubscriptionImages(id)
      if (!current(version)) return
      state.images = images.map(image => ({ ...image, previewUrl: '', previewFailed: false }))
      for (const image of state.images) {
        await loadPreview(image, version)
        if (!current(version)) return
      }
      state.loaded = true
    } catch (error) {
      if (current(version)) state.loadError = errorText(error)
    } finally {
      if (current(version)) state.loading = false
    }
  }

  async function loadPreview(image: ImagePreview, version: number) {
    try {
      const blob = await api.getSubscriptionImageContent(image.id)
      if (!current(version) || !state.images.includes(image)) return
      revoke(image)
      image.previewUrl = URL.createObjectURL(blob)
      image.previewFailed = false
    } catch {
      if (current(version)) image.previewFailed = true
    }
  }

  async function retryPreview(id: string) {
    if (!editable()) return
    const image = state.images.find(item => item.id === id)
    if (!image) return
    const version = generation
    state.working = true
    try { await loadPreview(image, version) }
    finally { if (current(version)) state.working = false }
  }

  async function append(image: SubscriptionImage, version: number) {
    if (!current(version)) {
      await deletePending(image.id, version)
      return
    }
    pending.add(image.id)
    state.images.push({ ...image, previewUrl: '', previewFailed: false })
    await loadPreview(state.images[state.images.length - 1], version)
  }

  function requestSvgConfirmation() {
    state.confirmingSvg = true
    return new Promise<boolean>(resolve => { settleConfirmation = resolve })
  }

  function confirmSvg(accepted: boolean) {
    state.confirmingSvg = false
    settleConfirmation?.(accepted)
    settleConfirmation = undefined
  }

  async function uploadFiles(files: File[]) {
    if (!editable()) return
    const version = generation
    state.working = true
    state.errors = []
    try {
      // Only one file's bytes/base64 are retained at a time, including during SVG confirmation.
      for (const file of files) {
        if (!current(version)) break
        if (state.images.length >= SUBSCRIPTION_IMAGE_LIMIT) {
          state.errors.push(t('api.errors.subscriptionImages.limitExceeded'))
          break
        }
        state.currentFile = file.name
        try {
          if (file.size > SUBSCRIPTION_IMAGE_MAX_BYTES) throw new Error(t('api.errors.subscriptionImages.tooLarge'))
          if (!file.size) throw new Error(t('api.errors.subscriptionImages.invalidImage'))
          const bytes = new Uint8Array(await readFile(file, 'buffer') as ArrayBuffer)
          if (!current(version)) break
          const contentType = detectLogoContentType(bytes)
          if (!contentType) throw new Error(t('api.errors.subscriptionImages.invalidImage'))
          const svg = contentType === 'image/svg+xml'
          if (svg && !await requestSvgConfirmation()) continue
          if (!current(version)) break
          const dataUrl = await readFile(file, 'url') as string
          if (!current(version)) break
          const payload: SubscriptionImageUpload = {
            fileName: file.name, contentType, dataBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
            ...(svg ? { svgConfirmed: true } : {})
          }
          await append(await api.uploadSubscriptionImage(payload), version)
        } catch (error) {
          if (current(version)) state.errors.push(`${file.name}: ${errorText(error)}`)
        }
      }
    } finally {
      if (current(version)) {
        state.working = false
        state.currentFile = ''
      }
    }
  }

  async function importUrl(url: string) {
    if (!url.trim() || !editable()) return
    if (state.images.length >= SUBSCRIPTION_IMAGE_LIMIT) {
      state.errors = [t('api.errors.subscriptionImages.limitExceeded')]
      return
    }
    const version = generation
    state.working = true
    state.errors = []
    try {
      const result = await api.importSubscriptionImage({ url: url.trim() })
      if (!result.requiresConfirmation) {
        await append(result.image, version)
      } else {
        if (!current(version) || !await requestSvgConfirmation() || !current(version)) return
        await append(await api.uploadSubscriptionImage({
          fileName: result.fileName, contentType: result.contentType,
          dataBase64: result.dataBase64, svgConfirmed: true
        }), version)
      }
    } catch (error) {
      if (current(version)) state.errors.push(errorText(error))
    } finally {
      if (current(version)) state.working = false
    }
  }

  async function remove(id: string) {
    if (!editable()) return
    const image = state.images.find(item => item.id === id)
    if (!image) return
    revoke(image)
    state.images = state.images.filter(item => item.id !== id)
    // Saved images are never deleted here: imageIds binds/removes atomically on form save.
    if (pending.has(id)) {
      const version = generation
      state.working = true
      try {
        if (await deletePending(id, version) && current(version)) pending.delete(id)
      } finally { if (current(version)) state.working = false }
    }
  }

  function selection() {
    if (!ready.value) return null
    const version = generation
    const imageIds = state.images.map(image => image.id)
    return {
      imageIds,
      // The parent must acknowledge a successful save before resetting/closing the form.
      committed: () => {
        if (version === generation) for (const id of imageIds) pending.delete(id)
      }
    }
  }

  function onAuthChange() {
    if (getStoredToken() !== sessionToken) dispose()
  }
  window.addEventListener(AUTH_SESSION_CHANGE_EVENT, onAuthChange)
  window.addEventListener('storage', onAuthChange)
  watch(() => [options.active(), options.subscriptionId(), options.source?.()], reset, { immediate: true })
  onBeforeUnmount(() => {
    dispose()
    window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, onAuthChange)
    window.removeEventListener('storage', onAuthChange)
  })

  return { state, ready, reset, cancel: dispose, selection, uploadFiles, importUrl, remove, confirmSvg, retryPreview }
}

export type SubscriptionImagesController = ReturnType<typeof useSubscriptionImages>

function revoke(image: ImagePreview) {
  if (image.previewUrl) URL.revokeObjectURL(image.previewUrl)
  image.previewUrl = ''
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : t('common.errors.requestFailed')
}

function readFile(file: File, mode: 'buffer' | 'url') {
  return new Promise<ArrayBuffer | string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer | string)
    reader.onerror = () => reject(reader.error)
    if (mode === 'buffer') reader.readAsArrayBuffer(file)
    else reader.readAsDataURL(file)
  })
}
