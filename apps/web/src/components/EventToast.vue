<script setup lang="ts">
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
</script>

<template>
  <div class="dt-toasts" aria-live="polite">
    <div
      v-for="t in toast.items"
      :key="t.id"
      :class="['alert', `alert-${t.variant}`, 'py-1', 'px-2', 'mb-1', 'small', 'shadow-sm']"
      data-testid="toast"
      @click="toast.remove(t.id)"
    >
      {{ t.render ? t.render() : t.text }}
    </div>
  </div>
</template>
