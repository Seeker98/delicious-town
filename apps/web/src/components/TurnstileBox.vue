<script setup lang="ts">
import { onMounted, ref } from 'vue';

const emit = defineEmits<{ token: [value: string] }>();
const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY ?? '';
const el = ref<HTMLDivElement | null>(null);

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile script failed to load'));
    document.head.appendChild(s);
  });
}

onMounted(async () => {
  // 开发环境没配置 site key：服务端同样关闭了校验，直接给一个占位令牌
  if (!siteKey) {
    emit('token', 'dev-token');
    return;
  }
  await loadScript();
  window.turnstile!.render(el.value!, { sitekey: siteKey, callback: (t) => emit('token', t) });
});
</script>

<template>
  <div ref="el" class="my-2"></div>
</template>
