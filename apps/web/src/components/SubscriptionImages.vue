<template>
  <section class="subscription-images" :aria-label="t('subscriptions.images.title')">
    <template v-if="!readonly">
      <p class="subscription-images__hint">{{ t('subscriptions.images.hint') }}</p>
      <div class="subscription-images__actions">
        <n-button :disabled="blocked || atLimit" @click="fileInput?.click()">{{ t('subscriptions.images.upload') }}</n-button>
        <input ref="fileInput" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.svg,.gif,.ico,.avif,.bmp" hidden @change="pickFiles" />
        <n-input v-model:value="url" :disabled="blocked || atLimit" :aria-label="t('subscriptions.images.url')" :placeholder="t('subscriptions.images.url')" @keyup.enter="importUrl" />
        <n-button :disabled="blocked || atLimit || !url.trim()" @click="importUrl">{{ t('subscriptions.images.import') }}</n-button>
      </div>
    </template>
    <p v-if="controller.state.loading" role="status">{{ t('subscriptions.images.loading') }}</p>
    <p v-if="controller.state.working" role="status">{{ t('subscriptions.images.working', { name: controller.state.currentFile }) }}</p>
    <div v-if="controller.state.loadError" role="alert">
      <p>{{ t('subscriptions.images.loadFailed') }} {{ controller.state.loadError }}</p>
      <n-button @click="controller.reset()">{{ t('subscriptions.images.retry') }}</n-button>
    </div>
    <ul v-if="controller.state.errors.length" class="subscription-images__errors" role="alert">
      <li v-for="(error, index) in controller.state.errors" :key="index">{{ error }}</li>
    </ul>
    <n-image-group v-if="controller.state.images.length" @update:show="emit('preview-change', $event)">
      <div class="subscription-images__grid">
        <div v-for="image in controller.state.images" :key="image.id" class="subscription-images__item">
          <n-image v-if="image.previewUrl" :src="image.previewUrl" :alt="image.fileName" :width="96" :height="80" object-fit="contain" />
          <div v-else class="subscription-images__missing">{{ t(image.previewFailed ? 'subscriptions.images.previewFailed' : 'subscriptions.images.loading') }}</div>
          <span class="subscription-images__filename" :title="image.fileName">{{ image.fileName }}</span>
          <n-button v-if="image.previewFailed" size="tiny" :disabled="blocked" @click="controller.retryPreview(image.id)">{{ t('subscriptions.images.retry') }}</n-button>
          <n-button v-if="!readonly" size="tiny" :disabled="blocked" :aria-label="t('subscriptions.images.removeNamed', { name: image.fileName })" @click="controller.remove(image.id)">{{ t('subscriptions.images.remove') }}</n-button>
        </div>
      </div>
    </n-image-group>
    <p v-else-if="controller.state.loaded && !controller.state.working" class="subscription-images__hint">{{ t('subscriptions.images.empty') }}</p>
    <n-modal
      v-if="controller.state.confirmingSvg"
      :show="true"
      preset="dialog"
      type="warning"
      :title="t('subscriptions.form.logo.svgRiskTitle')"
      :content="t('subscriptions.form.logo.svgRiskDescription')"
      :positive-text="t('subscriptions.form.logo.acceptRisk')"
      :negative-text="t('common.actions.cancel')"
      @positive-click="controller.confirmSvg(true)"
      @negative-click="controller.confirmSvg(false)"
      @update:show="(value: boolean) => { if (!value) controller.confirmSvg(false) }"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NImage, NImageGroup, NInput, NModal } from 'naive-ui'
import { t } from '@/locales'
import { SUBSCRIPTION_IMAGE_LIMIT, type SubscriptionImagesController } from '@/composables/subscription-images'

const props = defineProps<{ controller: SubscriptionImagesController; readonly?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'preview-change': [show: boolean] }>()
const fileInput = ref<HTMLInputElement | null>(null)
const url = ref('')
const blocked = computed(() => props.disabled || !props.controller.ready.value)
const atLimit = computed(() => props.controller.state.images.length >= SUBSCRIPTION_IMAGE_LIMIT)
watch(() => props.controller.state.images, () => { url.value = '' })

function pickFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!props.readonly && !blocked.value) void props.controller.uploadFiles(files)
}

async function importUrl() {
  if (props.readonly || blocked.value) return
  const value = url.value
  url.value = ''
  await props.controller.importUrl(value)
}
</script>

<style scoped>
.subscription-images { min-width: 0; }
.subscription-images__hint { color: var(--app-text-secondary); font-size: 12px; }
.subscription-images__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.subscription-images__actions .n-input { flex: 1 1 180px; }
.subscription-images__grid { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.subscription-images__item { width: 108px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.subscription-images__missing { width: 96px; height: 80px; display: grid; place-items: center; font-size: 12px; text-align: center; }
.subscription-images__filename { width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; }
.subscription-images__errors { color: var(--app-text-secondary); overflow-wrap: anywhere; }
</style>
