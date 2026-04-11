import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('vue-router') || id.includes('/vue/') || id.includes('pinia')) {
            return 'vendor-vue'
          }

          if (id.includes('naive-ui')) {
            if (id.includes('/data-table') || id.includes('/pagination')) {
              return 'vendor-naive-table'
            }
            if (id.includes('/date-picker') || id.includes('/select') || id.includes('/input') || id.includes('/form')) {
              return 'vendor-naive-form'
            }
            if (id.includes('/layout') || id.includes('/drawer') || id.includes('/menu') || id.includes('/tabs')) {
              return 'vendor-naive-layout'
            }
            return 'vendor-naive-core'
          }

          if (id.includes('@vicons')) {
            return 'vendor-icons'
          }

          if (id.includes('vue-echarts')) {
            return 'vendor-vcharts'
          }

          if (id.includes('echarts') || id.includes('zrender')) {
            return 'vendor-echarts'
          }

          if (id.includes('dayjs') || id.includes('axios') || id.includes('@tanstack') || id.includes('@vueuse')) {
            return 'vendor-utils'
          }
        }
      }
    }
  }
})
