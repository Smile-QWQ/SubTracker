import { createApp } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia } from 'pinia'
import { create, NConfigProvider, NMessageProvider } from 'naive-ui'
import App from './App.vue'
import { router } from './router'
import './style.css'

const naive = create({
  components: [NConfigProvider, NMessageProvider]
})

const app = createApp(App)
const queryClient = new QueryClient()

app.use(createPinia())
app.use(router)
app.use(naive)
app.use(VueQueryPlugin, { queryClient })
app.mount('#app')
