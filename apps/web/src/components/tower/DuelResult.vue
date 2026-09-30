<script setup lang="ts">
import { computed } from 'vue';
import type { DuelResultDto } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { awardText } from '../bar/award';

const props = defineProps<{ result: DuelResultDto }>();
const catalog = useCatalogStore();
const ITEMS = ['色', '香', '味', '形', '养'];
const rows = computed(() =>
  ITEMS.map((label, i) => ({
    label,
    me: props.result.me.scores[i] ?? 0,
    them: props.result.them.scores[i] ?? 0,
  })),
);
const headline = computed(() => {
  const r = props.result;
  const head = r.test ? `试打：${r.win ? '赢了' : '输了'}` : r.win ? '你赢了' : '你输了';
  const renown = r.renown === 0 ? '' : `，声望 ${r.renown > 0 ? '+' : ''}${r.renown}`;
  const rank = r.win && r.rank !== null ? `，你现在是第 ${r.rank} 名` : '';
  return `${head}${renown}${rank}`;
});
const awards = computed(() => props.result.awards.map((a) => awardText(a, catalog)).join('、'));
</script>

<template>
  <div class="border rounded p-2 small mt-2" data-testid="duel-result">
    <div :class="['fw-bold mb-1', result.win ? 'text-success' : 'text-danger']" data-testid="duel-headline">
      {{ headline }}
    </div>
    <table class="table table-sm mb-1 text-center">
      <thead>
        <tr>
          <th></th>
          <th>{{ result.me.name }}（厨力 {{ result.me.power }}）</th>
          <th>{{ result.them.name }}（厨力 {{ result.them.power }}）</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.label">
          <th>{{ r.label }}</th>
          <td :class="{ 'text-success fw-bold': r.me > r.them }">{{ r.me }}</td>
          <td :class="{ 'text-success fw-bold': r.them > r.me }">{{ r.them }}</td>
        </tr>
        <tr>
          <th>总和</th>
          <td>{{ result.me.sum }}</td>
          <td>{{ result.them.sum }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="awards" data-testid="duel-awards">得到 {{ awards }}</div>
  </div>
</template>
