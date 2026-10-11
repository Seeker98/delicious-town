<script setup lang="ts">
import { computed } from 'vue';
import type { AttrsDto, TowerElderDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { ATTR_KEYS, ATTR_NAMES } from '../../utils/labels';

/** 赛厨长老的装备（问题记录 408）：加点、每件厨具（基础 + 强化）、被挑战时的属性、可能掉落；界面改版 P9 放在一层的面板里 */
const props = defineProps<{ elder: TowerElderDto }>();
const t = useT();
const catalog = useCatalogStore();
const list = (a: Partial<AttrsDto>, all: boolean) =>
  ATTR_KEYS.filter((k) => k in a && (all || (a[k] ?? 0) !== 0))
    .map((k) => `${ATTR_NAMES[k]} ${a[k] ?? 0}`)
    .join(t.value.tower.elder.sep);
const view = computed(() => {
  const e = props.elder;
  const d = t.value.tower.elder;
  return {
    title: d.title(e.level, e.stress),
    drop: e.dropRate > 0 ? d.drop(Math.round(e.dropRate * 100)) : '',
    points: d.points(list(e.points, true)),
    pieces: e.pieces.map((p) => ({
      id: p.id,
      name: d.pieceName(catalog.goodsName(p.id), e.stress),
      text: list(p.attrs, false),
    })),
    attrs: d.attrs(list(e.attrs, true)),
    drops: d.drops(e.drops.map((id) => catalog.goodsName(id)).join(d.sep)),
  };
});
</script>

<template>
  <div class="dt-elder" data-testid="elder-gear">
    <b>{{ view.title }}</b>
    <div v-if="view.drop" class="dt-elder-line">{{ view.drop }}</div>
    <div v-for="p in view.pieces" :key="p.id" class="dt-elder-line" data-testid="elder-piece">
      <b>{{ p.name }}</b> {{ p.text }}
    </div>
    <div class="dt-elder-line" data-testid="elder-points">{{ view.points }}</div>
    <div class="dt-elder-line" data-testid="elder-attrs">{{ view.attrs }}</div>
    <div class="dt-elder-line" data-testid="elder-drops">{{ view.drops }}</div>
  </div>
</template>
