<script setup lang="ts">
import { ref } from 'vue';
import type { AnnouncementDto } from '@dt/shared';

/** 公告横幅（子项目 6A）：显示最新一条的标题，点开看全部；没有公告时不渲染 */
defineProps<{ items: AnnouncementDto[] }>();
const open = ref(false);
</script>

<template>
  <div v-if="items.length > 0" class="dt-card my-2 small">
    <button
      type="button"
      class="btn btn-link p-0 text-reset text-decoration-none text-start w-100 d-flex align-items-center gap-1"
      :aria-expanded="open"
      data-testid="announce-banner"
      @click="open = !open"
    >
      <i class="bi bi-megaphone text-primary"></i>
      <span class="flex-fill">{{ items[0]!.title }}</span>
      <span v-if="items.length > 1" class="dt-meta">等 {{ items.length }} 条</span>
      <i :class="['bi', open ? 'bi-chevron-up' : 'bi-chevron-down']"></i>
    </button>
    <div v-if="open" class="mt-2">
      <div v-for="a in items" :key="a.id" class="mb-2">
        <div class="fw-bold">{{ a.title }}</div>
        <div class="dt-announce-body">{{ a.body }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dt-announce-body {
  white-space: pre-wrap;
}
</style>
