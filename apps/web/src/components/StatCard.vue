<template>
  <n-card size="small" :bordered="false" class="stat-card">
    <div class="stat-card__top">
      <div class="label">{{ label }}</div>
      <div v-if="icon" class="stat-card__icon" :style="{ background: iconBackground }">
        <n-icon :size="18">
          <component :is="icon" />
        </n-icon>
      </div>
    </div>
    <div class="value">{{ value }}</div>
    <div v-if="suffix" class="suffix">{{ suffix }}</div>
  </n-card>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { NCard, NIcon } from 'naive-ui'

withDefaults(
  defineProps<{
    label: string
    value: string | number
    suffix?: string
    icon?: Component
    iconBackground?: string
  }>(),
  {
    iconBackground: 'rgba(37, 99, 235, 0.12)'
  }
)
</script>

<style scoped>
.stat-card {
  background: #fff;
  border-radius: 16px;
}

.stat-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stat-card__icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2563eb;
}

.label {
  color: #6b7280;
  font-size: 13px;
}

.value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.suffix {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}
</style>
