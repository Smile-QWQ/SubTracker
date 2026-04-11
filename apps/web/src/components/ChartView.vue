<template>
  <component :is="VChart" :option="option" autoresize class="chart-view" />
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'

use([CanvasRenderer, BarChart, LineChart, PieChart, TooltipComponent, GridComponent, LegendComponent, TitleComponent])

const VChart = defineAsyncComponent(() => import('vue-echarts'))

defineProps<{ option: Record<string, unknown> }>()
</script>

<style scoped>
.chart-view {
  width: 100%;
  height: 320px;
}

@media (max-width: 900px) {
  .chart-view {
    height: 260px;
  }
}
</style>
