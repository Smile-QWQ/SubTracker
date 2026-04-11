<template>
  <div class="page-header">
    <div class="page-header__icon" :style="{ background: iconBackground }">
      <n-icon :size="22">
        <component :is="icon" />
      </n-icon>
    </div>
    <div>
      <h1 class="page-title">{{ title }}</h1>
      <p class="page-subtitle">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { NIcon } from 'naive-ui'

withDefaults(
  defineProps<{
    title: string
    subtitle: string
    icon: Component
    iconBackground?: string
  }>(),
  {
    iconBackground: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)'
  }
)
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
}

.page-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 10px 30px rgba(37, 99, 235, 0.18);
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .page-header {
    gap: 12px;
    margin-bottom: 12px;
  }

  .page-header__icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }

  .page-title {
    font-size: 17px;
  }

  .page-subtitle {
    font-size: 13px;
  }
}
</style>
