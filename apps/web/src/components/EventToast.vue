<script setup lang="ts">
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
</script>

<template>
  <!-- 问题记录 344：放在顶栏下面，点击穿过提示落到下面的按钮上 -->
  <div class="dt-toasts dt-toasts-passthrough" aria-live="polite">
    <div
      v-for="t in toast.items"
      :key="t.id"
      :class="['alert', `alert-${t.variant}`, 'py-1', 'px-2', 'mb-1', 'small', 'shadow-sm']"
      data-testid="toast"
    >
      {{ t.render ? t.render() : t.text }}
    </div>
  </div>
</template>
