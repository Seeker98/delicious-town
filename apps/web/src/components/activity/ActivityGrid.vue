<script setup lang="ts">
import { computed } from 'vue';
import type { ActivityDto, GridDef } from '@dt/shared';
import { actionName } from '../../utils/activity';
import RewardButton from './RewardButton.vue';

const props = defineProps<{ a: ActivityDto & { kind: 'grid'; def: GridDef }; busy: boolean }>();
defineEmits<{ claim: [key: string] }>();
const byKey = computed(() => new Map(props.a.rewards.map((r) => [r.key, r])));
const LINE_NAME = (k: string) =>
  k === 'full'
    ? '全部完成'
    : k === 'd0'
      ? '对角线 ↘'
      : k === 'd1'
        ? '对角线 ↙'
        : k[0] === 'r'
          ? `第 ${Number(k.slice(1)) + 1} 行`
          : `第 ${Number(k.slice(1)) + 1} 列`;
const lines = computed(() => props.a.rewards.filter((r) => !r.key.startsWith('c')));
</script>

<template>
  <div class="dt-grid-board" :style="{ gridTemplateColumns: `repeat(${a.def.size}, 1fr)` }">
    <div
      v-for="(c, i) in a.def.cells"
      :key="i"
      :class="['dt-grid-cell', { 'dt-cell-done': byKey.get(`c${i}`)?.reached }]"
      :data-testid="`cell-${a.id}-${i}`"
    >
      <div class="small fw-bold">{{ actionName(c.key) }}</div>
      <div class="small text-muted">{{ Math.min(a.counters[c.key] ?? 0, c.target) }}/{{ c.target }}</div>
      <RewardButton
        :activity-id="a.id"
        :reward="byKey.get(`c${i}`)!"
        :state="a.state"
        :busy="busy"
        @claim="$emit('claim', $event)"
      />
    </div>
  </div>
  <div v-for="r in lines" :key="r.key" class="d-flex align-items-center gap-2 border-bottom py-1">
    <span :class="['flex-fill', { 'fw-bold': r.reached }]">{{ LINE_NAME(r.key) }}</span>
    <RewardButton
      :activity-id="a.id"
      :reward="r"
      :state="a.state"
      :busy="busy"
      @claim="$emit('claim', $event)"
    />
  </div>
</template>
