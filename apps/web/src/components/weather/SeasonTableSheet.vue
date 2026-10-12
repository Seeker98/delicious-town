<script setup lang="ts">
import { computed } from 'vue';
import type { ShilingDto } from '@dt/shared';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';

/**
 * 当令表（天气改版 PR②；设计图 Sl-C）：按天气四类分组，特殊天气一组；现在的天气那行高亮；
 * 道的胶囊：你会的菜所在的道描边，其他灰
 */
const props = defineProps<{ open: boolean; data: ShilingDto }>();
const emit = defineEmits<{ close: [] }>();
const t = useT();
const catalog = useCatalogStore();
const sl = computed(() => t.value.misc.weather.shiling);
const mine = computed(() => new Set(props.data.myRoads));

const ART: Record<number, ArtName> = {
  1: 'weather-sun',
  2: 'weather-rain',
  3: 'weather-snow',
  4: 'weather-wind',
};
const groups = computed(() => {
  const out: Array<{ key: string; art: ArtName; title: string; rows: ShilingDto['table'] }> = [];
  for (const row of props.data.table) {
    const w = catalog.weather(row.ids[0]!);
    const key = w?.special ? 'special' : String(w?.type ?? 1);
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        art: key === 'special' ? 'weather-special' : (ART[Number(key)] ?? 'weather-sun'),
        title: key === 'special' ? sl.value.table.special : (t.value.misc.weather.types[Number(key)] ?? ''),
        rows: [],
      };
      out.push(g);
    }
    g.rows.push(row);
  }
  return out;
});
const names = (ids: number[]) => ids.map((id) => catalog.weatherName(id)).join(' / ');
</script>

<template>
  <DtSheet :open="open" :title="sl.table.title" @close="emit('close')">
    <p class="dt-wx-sheet-sub">{{ sl.table.sub }}</p>
    <div class="dt-sl-table" data-testid="season-table">
      <template v-for="g in groups" :key="g.key">
        <div class="dt-sl-table-head"><DtArt :name="g.art" :size="18" />{{ g.title }}</div>
        <div
          v-for="row in g.rows"
          :key="row.ids.join()"
          :class="['dt-sl-table-row', { 'is-now': row.ids.includes(data.season.weatherId) }]"
          :data-testid="`season-row-${row.ids[0]}`"
        >
          <span class="dt-sl-table-name"
            >{{ names(row.ids)
            }}<template v-if="row.ids.includes(data.season.weatherId)"> · {{ sl.table.now }}</template></span
          >
          <span class="dt-sl-table-roads"
            ><span v-for="r in row.roads" :key="r" :class="['dt-road', mine.has(r) ? 'is-mine' : 'is-off']">{{
              sl.roads[r]
            }}</span></span
          >
        </div>
      </template>
    </div>
  </DtSheet>
</template>
