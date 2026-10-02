<script setup lang="ts">
import { computed } from 'vue';
import type { DuelResultDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { awardText } from '../bar/award';

const props = defineProps<{ result: DuelResultDto }>();
const catalog = useCatalogStore();
const t = useT();
const rows = computed(() =>
  t.value.tower.duel.items.map((label, i) => ({
    label,
    me: props.result.me.scores[i] ?? 0,
    them: props.result.them.scores[i] ?? 0,
  })),
);
const headline = computed(() => {
  const r = props.result;
  const d = t.value.tower.duel;
  const head = r.test ? d.test(r.win) : r.win ? d.win : d.lose;
  const renown = r.renown === 0 ? '' : d.renown(r.renown);
  const rank = r.win && r.rank !== null ? d.rank(r.rank) : '';
  return `${head}${renown}${rank}`;
});
const awards = computed(() => props.result.awards.map((a) => awardText(a, catalog)).join(t.value.events.sep));
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
          <th>{{ t.tower.duel.power(result.me.name, result.me.power) }}</th>
          <th>{{ t.tower.duel.power(result.them.name, result.them.power) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.label">
          <th>{{ r.label }}</th>
          <td :class="{ 'text-success fw-bold': r.me > r.them }">{{ r.me }}</td>
          <td :class="{ 'text-success fw-bold': r.them > r.me }">{{ r.them }}</td>
        </tr>
        <tr>
          <th>{{ t.tower.duel.sum }}</th>
          <td>{{ result.me.sum }}</td>
          <td>{{ result.them.sum }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="awards" data-testid="duel-awards">{{ t.tower.duel.awards(awards) }}</div>
  </div>
</template>
