<script setup lang="ts">
import type { ActivityRewardDto, ActivityState } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { rewardStatus } from '../../utils/activity';
import { rewardSummary } from '../../utils/reward';
import { useT } from '../../composables/useT';

/** 一份奖励：摘要 + 状态按钮 */
const props = defineProps<{
  activityId: number;
  reward: ActivityRewardDto;
  state: ActivityState;
  busy: boolean;
}>();
defineEmits<{ claim: [key: string] }>();
const catalog = useCatalogStore();
const t = useT();
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
      {{ t.activity.rewards.claim }}
    </button>
    <span v-else class="badge text-bg-light">{{
      t.activity.rewards[status() as 'locked' | 'page' | 'mail' | 'missed']
    }}</span>
  </span>
</template>
