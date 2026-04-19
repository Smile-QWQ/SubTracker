import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiTarget = env.VITE_DEV_API_TARGET?.trim() || 'http://127.0.0.1:3001'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true
        },
        '/static/logos': {
          target: devApiTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return

            if (id.includes('vue-router') || id.includes('/vue/') || id.includes('pinia') || id.includes('naive-ui')) {
              return 'vendor-ui'
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
  }
})
