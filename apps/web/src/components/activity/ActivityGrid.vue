<script setup lang="ts">
import { computed } from 'vue';
import type { ActivityDto, GridDef } from '@dt/shared';
import { actionName } from '../../utils/activity';
import { useT } from '../../composables/useT';
import RewardButton from './RewardButton.vue';

const props = defineProps<{ a: ActivityDto & { kind: 'grid'; def: GridDef }; busy: boolean }>();
defineEmits<{ claim: [key: string] }>();
const t = useT();
const byKey = computed(() => new Map(props.a.rewards.map((r) => [r.key, r])));
const LINE_NAME = (k: string) => {
  const g = t.value.activity.grid;
  if (k === 'full') return g.full;
  if (k === 'd0') return g.d0;
  if (k === 'd1') return g.d1;
  return k[0] === 'r' ? g.row(Number(k.slice(1)) + 1) : g.col(Number(k.slice(1)) + 1);
};
const lines = computed(() => props.a.rewards.filter((r) => !r.key.startsWith('c')));
</script>

<template>
  <div class="dt-grid-board" :style="{ gridTemplateColumns: `repeat(${a.def.size}, minmax(0, 1fr))` }">
    <div
      v-for="(c, i) in a.def.cells"
      :key="i"
      :class="['dt-grid-cell', { 'dt-cell-done': byKey.get(`c${i}`)?.reached }]"
      :data-testid="`cell-${a.id}-${i}`"
    >
      <div class="dt-grid-name">{{ actionName(c.key) }}</div>
      <div class="dt-grid-count">
        <i v-if="byKey.get(`c${i}`)?.reached" class="bi bi-check2" aria-hidden="true"></i
        >{{ Math.min(a.counters[c.key] ?? 0, c.target) }}/{{ c.target }}
      </div>
      <RewardButton
        wrap
        :activity-id="a.id"
        :reward="byKey.get(`c${i}`)!"
        :state="a.state"
        :busy="busy"
        @claim="$emit('claim', $event)"
      />
    </div>
  </div>
  <!-- 连线奖励（界面改版 P7）：一张卡片一行一条，右边奖励和状态小标签 -->
  <div class="dt-block-head mt-3">
    <h3 class="dt-block-title dt-act-sub">{{ t.activity.grid.linesTitle }}</h3>
  </div>
  <div class="dt-rows-card dt-act-lines">
    <div v-for="r in lines" :key="r.key" :class="['dt-row', { 'is-ready': r.reached && !r.claimed }]">
      <span :class="['dt-row-main', { 'fw-bold': r.reached }]">{{ LINE_NAME(r.key) }}</span>
      <RewardButton
        :activity-id="a.id"
        :reward="r"
        :state="a.state"
        :busy="busy"
        @claim="$emit('claim', $event)"
      />
    </div>
  </div>
</template>
