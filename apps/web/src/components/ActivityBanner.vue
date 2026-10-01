<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { ActivitySummaryDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

/** 首页活动横幅（设计 §7.2）：没有进行中的活动、或功能关闭报错时不显示 */
const s = ref<ActivitySummaryDto | null>(null);
onMounted(async () => {
  try {
    s.value = await endpoints.activitySummary();
  } catch {
    s.value = null;
  }
});
</script>

<template>
  <RouterLink
    v-if="s && s.running > 0"
    to="/activities"
    class="dt-card my-2 small d-flex align-items-center gap-1 text-reset text-decoration-none"
    data-testid="activity-banner"
  >
    <i class="bi bi-calendar-event text-primary"></i>
    <span class="flex-fill">进行中的活动 {{ s.running }} 个</span>
    <span v-if="s.claimable > 0" class="badge text-bg-danger">可领 {{ s.claimable }} 份</span>
  </RouterLink>
</template>
