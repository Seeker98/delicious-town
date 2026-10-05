<script setup lang="ts">
import { computed } from 'vue';
import { DUEL_JUDGES } from '@dt/shared';
import { useT } from '../../composables/useT';

/** 赛厨规则（问题记录 396）：厨塔、赛厨榜、好友切磋共用 */
const t = useT();
const judges = computed(() => {
  const d = t.value.tower.duel;
  return DUEL_JUDGES.map((j) => ({
    id: j.id,
    text: d.judgeFocus(d.judges[j.id], j.items.map((i) => d.items[i]).join(d.itemSep)),
  }));
});
</script>

<template>
  <details class="small text-muted mb-2" data-testid="duel-rules">
    <summary>{{ t.tower.duel.rulesTitle }}</summary>
    <p v-for="(line, i) in t.tower.duel.rules" :key="i" class="mb-1 mt-1">{{ line }}</p>
    <div>{{ t.tower.duel.rulesJudges }}</div>
    <ul class="list-inline mb-0">
      <li v-for="j in judges" :key="j.id" class="list-inline-item" data-testid="duel-rules-judge">
        {{ j.text }}
      </li>
    </ul>
  </details>
</template>
