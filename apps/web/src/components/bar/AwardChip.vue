<script setup lang="ts">
import { computed } from 'vue';
import type { BarAwardDto } from '@dt/shared';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { foodLevelLabel, formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';

/** 一份奖励（界面改版 P9）：小图 + 名字×数量，食材 2 级起带等级角标，幸运翻倍的标“幸运” */
const props = defineProps<{ award: BarAwardDto }>();
const t = useT();
const catalog = useCatalogStore();
const art = computed<ArtName>(() => {
  const a = props.award;
  if (a.kind === 'coin') return 'res-coin-silver';
  if (a.kind === 'exp') return 'res-exp';
  return a.kind === 'goods' ? catalog.goodsArt(a.id ?? 0) : catalog.foodArt(a.id ?? 0);
});
const level = computed(() =>
  props.award.kind === 'foods' ? (catalog.food(props.award.id ?? 0)?.level ?? 0) : 0,
);
const text = computed(() => {
  const a = props.award;
  const w = t.value.bar.award;
  if (a.kind === 'coin') return w.coin(formatNum(a.num));
  if (a.kind === 'exp') return w.exp(formatNum(a.num));
  const name = a.kind === 'goods' ? catalog.goodsName(a.id ?? 0) : catalog.foodName(a.id ?? 0);
  return t.value.common.qty(name, a.num);
});
</script>

<template>
  <span class="dt-award-chip" data-testid="award-chip"
    ><span class="dt-award-chip-art"><DtArt :name="art" :size="20" /></span>{{ text
    }}<span v-if="level >= 2" :class="['dt-tag', 'dt-lv', level >= 3 ? 'is-t3' : 'is-t2']">{{
      foodLevelLabel(level)
    }}</span
    ><span v-if="award.lucky" class="dt-tag dt-tag-warn">{{ t.bar.luckyTag }}</span></span
  >
</template>
