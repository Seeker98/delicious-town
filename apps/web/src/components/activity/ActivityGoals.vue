<script setup lang="ts">
import type { ActivityDto, GoalsDef } from '@dt/shared';
import { actionName } from '../../utils/activity';
import { useT } from '../../composables/useT';
import RewardButton from './RewardButton.vue';

const props = defineProps<{ a: ActivityDto & { kind: 'goals'; def: GoalsDef }; busy: boolean }>();
defineEmits<{ claim: [key: string] }>();
const t = useT();
const progress = (key: string) => props.a.counters[key] ?? 0;
</script>

<template>
  <!-- 一张卡片一行一个目标（界面改版 P7）：名字和进度，右边奖励和状态 -->
  <div class="dt-rows-card dt-act-lines">
    <div v-for="(g, i) in a.def.goals" :key="i" class="dt-row dt-row-wrap">
      <span class="dt-row-main"
        ><span class="dt-row-title">{{ t.activity.goalLine(actionName(g.key), g.target) }}</span
        ><span class="dt-row-sub">{{ Math.min(progress(g.key), g.target) }}/{{ g.target }}</span></span
      >
      <RewardButton
        :activity-id="a.id"
        :reward="a.rewards[i]!"
        :state="a.state"
        :busy="busy"
        @claim="$emit('claim', $event)"
      />
    </div>
  </div>
</template>
