import { createApp } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import ui from '@nuxt/ui/vue-plugin';
import App from './App.vue';
import './assets/main.css';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
});

(self as any).MonacoEnvironment = {
  getWorker() {
    return new Worker(
      URL.createObjectURL(new Blob(['self.onmessage=()=>{}'], { type: 'text/javascript' }))
    );
  },
};

const app = createApp(App);
app.use(router);
app.use(ui);
app.mount('#app');
