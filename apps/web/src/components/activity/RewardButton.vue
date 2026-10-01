<script setup lang="ts">
import type { ActivityRewardDto, ActivityState } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { rewardStatus } from '../../utils/activity';
import { rewardSummary } from '../../utils/reward';

/** 一份奖励：摘要 + 状态按钮 */
const props = defineProps<{
  activityId: number;
  reward: ActivityRewardDto;
  state: ActivityState;
  busy: boolean;
}>();
defineEmits<{ claim: [key: string] }>();
const catalog = useCatalogStore();
const LABEL = { locked: '未达成', page: '已领', mail: '已邮寄', missed: '未达成' } as const;
const status = () => rewardStatus(props.reward, props.state);
</script>

<template>
  <span class="d-inline-flex align-items-center gap-1">
    <span class="small">{{ rewardSummary(reward.award, catalog) }}</span>
    <button
      v-if="status() === 'claim'"
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy"
      :data-testid="`claim-${activityId}-${reward.key}`"
      @click="$emit('claim', reward.key)"
    >
      领取
    </button>
    <span v-else class="badge text-bg-light">{{ LABEL[status() as keyof typeof LABEL] }}</span>
  </span>
</template>
