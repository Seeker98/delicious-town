<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ActivitySummaryDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import DtRow from './DtRow.vue';

/**
 * 首页提醒卡里的限时活动一行（设计 §7.2、问题记录 280）：没有进行中的活动、或功能关闭报错时不显示。
 * 界面改版 P5：和交易所、理财同一种行（图标、标题、灰色副行，右边能领几份）
 */
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
  <DtRow
    v-if="s && s.running > 0"
    to="/activities"
    art="place-activities"
    :title="t.home.row.activities"
    :sub="t.home.row.activitiesSub(s.running)"
    data-testid="activity-banner"
  >
    <template v-if="s.claimable > 0" #value
      ><span class="badge text-bg-danger">{{ t.nav.activity.claimable(s.claimable) }}</span></template
    >
  </DtRow>
</template>
