<script setup lang="ts">
import type { QuestDto } from '@dt/shared';
import { useT } from '../composables/useT';

/** 一个任务卡片（问题记录 318）：主线、支线当前档、每周任务共用 */
defineProps<{
  quest: QuestDto;
  name: string;
  /** 奖励文字 */
  award: string;
  busy: boolean;
  /** 锁定原因（如"🔒 2 星解锁"）：锁定时不放领奖按钮 */
  locked?: string | null;
}>();
defineEmits<{ claim: [] }>();
const t = useT();
const pct = (p: number, target: number) => Math.min(100, Math.round((p / Math.max(1, target)) * 100));
</script>

<template>
  <div
    :class="[
      'border rounded p-2 small mb-1',
      { 'border-success dt-task-done': quest.done && !quest.claimed, 'text-muted': quest.claimed },
    ]"
    :data-testid="`task-${quest.id}`"
  >
    <div class="d-flex align-items-center gap-2">
      <b>{{ name }}</b>
      <span v-if="quest.claimed" class="ms-auto text-success text-nowrap">{{
        t.rest.tasks.claimedTask
      }}</span>
      <span v-else-if="locked" class="ms-auto text-nowrap">{{ locked }}</span>
      <span v-else class="ms-auto">{{ Math.min(quest.progress, quest.target) }}/{{ quest.target }}</span>
    </div>
    <div class="text-muted">{{ t.rest.tasks.award(award) }}</div>
    <template v-if="!quest.claimed && !locked">
      <button
        v-if="quest.done"
        class="btn btn-sm btn-primary mt-1"
        :data-testid="`claim-task-${quest.id}`"
        :disabled="busy"
        @click="$emit('claim')"
      >
        {{ t.rest.tasks.claimTask }}
      </button>
      <div v-else class="progress mt-1" style="height: 6px">
        <div
          class="progress-bar bg-warning"
          :style="{ width: `${pct(quest.progress, quest.target)}%` }"
        ></div>
      </div>
    </template>
  </div>
</template>
