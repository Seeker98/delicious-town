<script setup lang="ts">
import type { ActivityDto, GoalsDef } from '@dt/shared';
import { actionName } from '../../utils/activity';
import RewardButton from './RewardButton.vue';

const props = defineProps<{ a: ActivityDto & { kind: 'goals'; def: GoalsDef }; busy: boolean }>();
defineEmits<{ claim: [key: string] }>();
const progress = (key: string) => props.a.counters[key] ?? 0;
</script>

<template>
  <div
    v-for="(g, i) in a.def.goals"
    :key="i"
    class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1"
  >
    <span class="flex-fill">{{ actionName(g.key) }} {{ g.target }} 次</span>
    <span class="small text-muted">{{ Math.min(progress(g.key), g.target) }}/{{ g.target }}</span>
    <RewardButton
      :activity-id="a.id"
      :reward="a.rewards[i]!"
      :state="a.state"
      :busy="busy"
      @claim="$emit('claim', $event)"
    />
  </div>
</template>
