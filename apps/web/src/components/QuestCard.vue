<script setup lang="ts">
import type { QuestDto } from '@dt/shared';
import { useT } from '../composables/useT';
import { formatNum } from '../utils/format';

/**
 * 一个任务（问题记录 318）：主线、支线当前档、每周任务共用；卡片里的一行（界面改版 P7：和别处一样的行，
 * 名字一行、奖励灰字一行，右边进度、领奖按钮或状态小标签）
 */
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
/** 锁定原因去掉前面的锁符号（行里另画锁图标） */
const lockReason = (s: string) => s.replace(/^🔒\s*/u, '');
</script>

<template>
  <div
    :class="['dt-row dt-quest', { 'is-ready': quest.done && !quest.claimed, 'is-claimed': quest.claimed }]"
    :data-testid="`task-${quest.id}`"
  >
    <span class="dt-row-main">
      <span class="dt-row-title">{{ name }}</span>
      <span class="dt-row-sub">{{ award }}</span>
    </span>
    <span v-if="quest.claimed" class="dt-tag dt-tag-ok">{{ t.rest.tasks.claimedShort }}</span>
    <span v-else-if="locked" class="dt-tag dt-tag-mute"
      ><i class="bi bi-lock-fill" aria-hidden="true"></i> {{ lockReason(locked) }}</span
    >
    <button
      v-else-if="quest.done"
      class="btn btn-sm btn-primary"
      :data-testid="`claim-task-${quest.id}`"
      :disabled="busy"
      @click="$emit('claim')"
    >
      {{ t.rest.tasks.claimTask }}
    </button>
    <!-- 目标为 0 的（每周“领取本周探险图”，问题记录 515）不写进度 -->
    <span v-else-if="quest.target > 0" class="dt-act-count"
      >{{ formatNum(Math.min(quest.progress, quest.target)) }}/{{ formatNum(quest.target) }}</span
    >
  </div>
</template>
