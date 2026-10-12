<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ShilingDto } from '@dt/shared';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { formatNum } from '../../utils/format';

/**
 * 时令铺换残卷（天气改版 PR②；设计图 Sl-D）：残卷是可鉴定、还没学会的 1~5 级菜，珍稀残卷是不能鉴定的和 6 级的。
 * 筛选：当令的道（默认，有的话）、全部道、按级；点价格直接换 1 张
 */
const props = defineProps<{ open: boolean; item: 'remnant' | 'rare'; data: ShilingDto; busy: boolean }>();
const emit = defineEmits<{ close: []; buy: [mcId: number] }>();
const t = useT();
const catalog = useCatalogStore();
const sl = computed(() => t.value.misc.weather.shiling);

const row = computed(() => props.data.shop.find((x) => x.item === props.item));
const pool = computed(() =>
  (props.item === 'remnant' ? props.data.remnantPool : props.data.rarePool)
    .map((id) => ({ id, mc: catalog.mc(id) }))
    .filter((x) => x.mc)
    .sort((a, b) => a.mc!.level - b.mc!.level || a.mc!.road - b.mc!.road || a.id - b.id),
);
const seasonRoads = computed(() => (props.data.season.open ? props.data.season.roads : []));
const inSeason = (road: number) => seasonRoads.value.includes(road);
const hasSeason = computed(() => pool.value.some((x) => inSeason(x.mc!.road)));
const levels = computed(() => [...new Set(pool.value.map((x) => x.mc!.level))].sort((a, b) => a - b));
type Filter = 'season' | 'all' | number;
const filter = ref<Filter>('all');
watch(
  () => props.open,
  (o) => {
    if (o) filter.value = hasSeason.value ? 'season' : 'all';
  },
  { immediate: true },
);
const shown = computed(() =>
  pool.value.filter((x) =>
    filter.value === 'season'
      ? inSeason(x.mc!.road)
      : filter.value === 'all'
        ? true
        : x.mc!.level === filter.value,
  ),
);
const priceOf = (level: number) =>
  props.item === 'remnant' ? (row.value?.price ?? 0) * level : (row.value?.price ?? 0);
const held = (id: number) => props.data.remnants.find((r) => r.mcId === id)?.num ?? 0;
const left = computed(() => row.value?.left ?? 0);
</script>

<template>
  <DtSheet
    :open="open"
    :title="item === 'remnant' ? sl.pick.title : sl.pick.rareTitle"
    @close="emit('close')"
  >
    <p class="dt-wx-sheet-sub" data-testid="remnant-sub">
      {{ item === 'remnant' ? sl.pick.sub(row?.price ?? 0, left) : sl.pick.rareSub(row?.price ?? 0, left) }}
    </p>
    <div class="dt-pills dt-pills-scroll" role="group" data-testid="remnant-filters">
      <button
        v-if="hasSeason"
        type="button"
        :class="{ active: filter === 'season' }"
        :aria-pressed="filter === 'season'"
        data-testid="remnant-filter-season"
        @click="filter = 'season'"
      >
        {{ sl.pick.inSeason(seasonRoads.map((r) => sl.roads[r]).join(sl.sep)) }}
      </button>
      <button
        type="button"
        :class="{ active: filter === 'all' }"
        :aria-pressed="filter === 'all'"
        data-testid="remnant-filter-all"
        @click="filter = 'all'"
      >
        {{ sl.pick.allRoads }}
      </button>
      <button
        v-for="lv in levels"
        :key="lv"
        type="button"
        :class="{ active: filter === lv }"
        :aria-pressed="filter === lv"
        :data-testid="`remnant-filter-${lv}`"
        @click="filter = lv"
      >
        {{ sl.pick.level(lv) }}
      </button>
    </div>
    <div v-if="shown.length" class="dt-sheet-list" data-testid="remnant-list">
      <div v-for="x in shown" :key="x.id" class="dt-row dt-sl-pick" :data-testid="`remnant-${x.id}`">
        <span class="dt-row-main"
          ><span class="dt-row-title is-strong"
            >{{ catalog.mcName(x.id)
            }}<span class="dt-tag dt-tag-primary">{{ sl.pick.level(x.mc!.level) }}</span
            ><span :class="['dt-road', inSeason(x.mc!.road) ? '' : 'is-off']">{{
              sl.roads[x.mc!.road]
            }}</span></span
          ><span class="dt-row-sub">{{ held(x.id) ? sl.pick.have(held(x.id)) : sl.pick.none }}</span></span
        >
        <button
          type="button"
          class="dt-price-btn"
          :disabled="busy || left === 0 || data.balance < priceOf(x.mc!.level)"
          :aria-label="sl.shop.price(formatNum(priceOf(x.mc!.level)))"
          :data-testid="`remnant-buy-${x.id}`"
          @click="emit('buy', x.id)"
        >
          <DtArt name="res-shiling" :size="16" />{{ formatNum(priceOf(x.mc!.level)) }}
        </button>
      </div>
    </div>
    <p v-else class="dt-block-note" data-testid="remnant-empty">{{ sl.pick.empty }}</p>
    <p class="dt-wx-sheet-sub dt-sl-pick-foot">{{ sl.pick.foot }}</p>
  </DtSheet>
</template>
