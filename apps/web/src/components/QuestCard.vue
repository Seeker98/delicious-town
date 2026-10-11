<script setup lang="ts">
import type { QuestDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { formatNum } from '../utils/format';

/** 一个任务（问题记录 318）：主线、支线当前档、每周任务共用；界面改版 P3 起是卡片里的一行，不再一个任务一张卡片 */
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
    :class="['dt-item dt-quest', { 'is-ready': quest.done && !quest.claimed, 'is-claimed': quest.claimed }]"
    :data-testid="`task-${quest.id}`"
  >
    <div class="dt-item-main">
      <div class="d-flex align-items-baseline gap-2">
        <b class="dt-shrink">{{ name }}</b>
        <!-- 目标为 0 的（每周“领取本周探险图”，问题记录 515）不写进度 -->
        <span v-if="!quest.claimed && !locked && quest.target > 0" class="text-nowrap dt-meta"
          >{{ formatNum(Math.min(quest.progress, quest.target)) }}/{{ formatNum(quest.target) }}</span
        >
      </div>
      <div class="dt-meta">{{ t.rest.tasks.award(award) }}</div>
      <!-- 没完成的下面一条细进度条 -->
      <div v-if="!quest.claimed && !locked && !quest.done" class="dt-quest-bar">
        <div :style="{ width: `${pct(quest.progress, quest.target)}%` }"></div>
      </div>
    </div>
    <div class="dt-item-actions">
      <span v-if="quest.claimed" class="text-success text-nowrap small">{{ t.rest.tasks.claimedTask }}</span>
      <span v-else-if="locked" class="text-nowrap small">{{ locked }}</span>
      <button
        v-else-if="quest.done"
        class="btn btn-sm btn-primary"
        :data-testid="`claim-task-${quest.id}`"
        :disabled="busy"
        @click="$emit('claim')"
      >
        {{ t.rest.tasks.claimTask }}
      </button>
    </div>
  </div>
</template>
