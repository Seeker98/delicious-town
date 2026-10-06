<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { ActivitySummaryDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';

/** 首页待办卡里的限时活动一行（设计 §7.2、问题记录 280）：没有进行中的活动、或功能关闭报错时不显示 */
const s = ref<ActivitySummaryDto | null>(null);
const t = useT();
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
    class="dt-todo-row text-reset text-decoration-none"
    data-testid="activity-banner"
  >
    <span class="flex-fill"
      ><i class="bi bi-calendar-event me-1"></i>{{ t.nav.activity.running(s.running) }}</span
    >
    <span v-if="s.claimable > 0" class="badge text-bg-danger">{{
      t.nav.activity.claimable(s.claimable)
    }}</span>
    <span class="dt-go">{{ t.nav.activity.view }}</span>
  </RouterLink>
</template>
