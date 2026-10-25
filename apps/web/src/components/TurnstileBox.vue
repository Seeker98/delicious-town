<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** error：脚本加载失败或验证组件报错（防脚本 PR②：验证面板据此关掉，不留空框） */
const emit = defineEmits<{ token: [value: string]; error: [] }>();
const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY ?? '';
const el = ref<HTMLDivElement | null>(null);
let widgetId: string | null = null;

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

/** 令牌只能用一次：提交失败后调用，让验证组件重新出题 */
function reset(): void {
  if (!siteKey) {
    emit('token', 'dev-token');
    return;
  }
  if (widgetId !== null) window.turnstile?.reset(widgetId);
}

defineExpose({ reset });

// 关掉时释放验证组件，免得它在后台继续刷新令牌（防脚本 PR② 审阅）
onBeforeUnmount(() => {
  if (widgetId !== null) window.turnstile?.remove?.(widgetId);
  widgetId = null;
});

onMounted(async () => {
  // 开发环境没配置 site key：服务端同样关闭了校验，直接给一个占位令牌
  if (!siteKey) {
    emit('token', 'dev-token');
    return;
  }
  try {
    await loadScript();
    // 脚本加载期间组件已经关掉（卸载）了：不再渲染
    if (!el.value || !window.turnstile) return;
    widgetId = window.turnstile.render(el.value, {
      sitekey: siteKey,
      callback: (t) => emit('token', t),
      'error-callback': () => emit('error'),
    });
  } catch {
    emit('error');
  }
});
</script>

<template>
  <div ref="el" class="my-2"></div>
</template>
