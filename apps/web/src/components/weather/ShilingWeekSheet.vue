<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { addDays, type JobCardDto, type ShilingWeekDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { formatNum, timeHM } from '../../utils/format';
import { goodsArt } from '../../utils/goodsArt';
import { rewardText } from '../../utils/rewards';

/**
 * 时令周榜（天气改版 PR③，设计图 Jc-B）：本周排名，门槛线；周日几点前几名依次抽工作证；
 * 下面列出全部工作证：专属玩法、周工资，抽不到的灰掉写原因
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const t = useT();
const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const sl = computed(() => t.value.misc.weather.shiling);
const data = ref<ShilingWeekDto | null>(null);
const failed = ref(false);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    failed.value = false;
    try {
      data.value = await endpoints.shilingWeek();
    } catch {
      failed.value = true;
    }
  },
  { immediate: true },
);

const md = (day: string) => {
  const [, m, d] = day.split('-');
  return `${Number(m)}/${Number(d)}`;
};
const range = computed(() =>
  data.value
    ? sl.value.week.range(md(data.value.week), md(addDays(data.value.week, 6)), timeHM(data.value.until))
    : '',
);
const myId = computed(() => restaurant.rest?.id ?? null);
/** 排名行；在哪一行前面画门槛线：第一个不够门槛的、或者第 count + 1 名 */
const rows = computed(() => {
  const d = data.value;
  if (!d) return [];
  const cutAt = d.top.findIndex((r, i) => r.gain < d.minGain || i >= d.count);
  return d.top.map((r, i) => ({
    ...r,
    mine: r.restId === myId.value,
    cut:
      i === cutAt
        ? r.gain < d.minGain
          ? sl.value.week.belowMin(formatNum(d.minGain))
          : sl.value.week.topOnly(d.count)
        : null,
  }));
});
const meOutside = computed(() => data.value !== null && !rows.value.some((r) => r.mine));
const blockText = (b: JobCardDto['block']) =>
  b === null
    ? ''
    : b.kind === 'feature'
      ? sl.value.week.blockFeature
      : b.kind === 'level'
        ? sl.value.week.blockLevel(b.n)
        : sl.value.week.blockStar(b.n);
const wageText = (c: JobCardDto) => c.wage.map((x) => rewardText(x, catalog)).join(t.value.events.sep);
</script>

<template>
  <DtSheet :open="open" :title="sl.week.title" @close="emit('close')">
    <p class="dt-wx-sheet-sub">{{ range }}</p>
    <p v-if="failed" class="dt-wx-sheet-sub" data-testid="week-failed">{{ sl.week.failed }}</p>
    <template v-if="data">
      <section class="dt-card dt-rows-card" data-testid="week-rank">
        <p v-if="rows.length === 0" class="dt-sl-week-empty">{{ sl.week.empty }}</p>
        <template v-for="r in rows" :key="r.restId">
          <div v-if="r.cut" class="dt-sl-week-cut" data-testid="week-cut">{{ r.cut }}</div>
          <div :class="['dt-sl-week-row', { 'is-mine': r.mine }]" :data-testid="`week-row-${r.restId}`">
            <span :class="['dt-sl-week-rank', { 'is-top': r.rank <= data.count }]">{{ r.rank }}</span>
            <span class="dt-sl-week-name">{{ r.mine ? sl.week.me(r.name) : r.name }}</span>
            <b class="dt-sl-week-gain">{{ formatNum(r.gain) }}</b>
          </div>
        </template>
        <div v-if="meOutside" class="dt-sl-week-row is-mine" data-testid="week-me">
          <span class="dt-sl-week-rank">{{ data.me.rank ?? '—' }}</span>
          <span class="dt-sl-week-name">{{ sl.week.me(restaurant.rest?.name ?? '') }}</span>
          <b class="dt-sl-week-gain">{{ formatNum(data.me.gain) }}</b>
        </div>
      </section>
      <p class="dt-sl-week-rule" data-testid="week-rule">
        {{ sl.week.rule(formatNum(data.minGain), data.count) }}
      </p>
      <div class="dt-sl-week-sec">
        <b>{{ sl.week.cards(data.cards.length) }}</b
        ><span>{{ sl.week.cardsSub }}</span>
      </div>
      <div
        v-for="c in data.cards"
        :key="c.goodsId"
        :class="['dt-sl-card', { 'is-off': c.block }]"
        :data-testid="`week-card-${c.goodsId}`"
      >
        <span class="dt-sl-card-art"><DtArt :name="goodsArt(c.goodsId)" :size="32" /></span>
        <span class="dt-sl-card-main">
          <span class="dt-sl-card-name"
            >{{ catalog.goodsName(c.goodsId)
            }}<span v-if="c.block" class="dt-tag dt-tag-mute">{{ blockText(c.block) }}</span></span
          >
          <span class="dt-sl-card-perk">{{ sl.week.perks[c.goodsId] ?? '' }}</span>
          <span class="dt-sl-card-wage">{{ sl.week.wage(wageText(c)) }}</span>
        </span>
      </div>
    </template>
  </DtSheet>
</template>
