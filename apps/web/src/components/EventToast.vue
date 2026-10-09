<script setup lang="ts">
import { useToastStore } from '../stores/toast';

/** nav：页面有底栏（游戏内）；没有底栏时提示贴近底部（backlog 1010） */
withDefaults(defineProps<{ nav?: boolean }>(), { nav: true });
const toast = useToastStore();
</script>

<template>
  <!-- 问题记录 344：点击穿过提示落到下面的按钮上；545：改成屏幕下方、底栏上面的小胶囊，宽度跟着文字 -->
  <div
    :class="['dt-toasts', nav ? 'dt-toasts-bottom' : 'dt-toasts-low', 'dt-toasts-passthrough']"
    aria-live="polite"
  >
    <div
      v-for="t in toast.items"
      :key="t.id"
      :class="['alert', `alert-${t.variant}`, 'dt-toast-pill', 'py-1', 'px-3', 'mb-1', 'small', 'shadow-sm']"
      data-testid="toast"
    >
      {{ t.render ? t.render() : t.text }}
    </div>
  </div>
</template>
