<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { WeatherToolResultDto, WeatherToolsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

/**
 * 晴雨签（天气改版设计 §2.3；设计图 Wx-D）：先说明、点“摇签”才用掉一个；摇出两支挑一支。
 * 不选的话到时按第一支（服务端处理），到时通知父页面重新读
 */
const props = defineProps<{ open: boolean; tools: WeatherToolsDto; now: number }>();
const emit = defineEmits<{ close: []; done: [r: WeatherToolResultDto]; expired: [] }>();
const t = useT();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
/** 刚摇出来的签（父页面还没重新读之前用它） */
const drawn = ref<{ choices: number[]; until: string } | null>(null);
const pick = ref(0);
watch(
  () => props.open,
  (o) => {
    if (o) {
      drawn.value = null;
      pick.value = 0;
    }
  },
);
const lots = computed(() => drawn.value ?? props.tools.pendingLots);
const left = computed(() =>
  lots.value ? Math.max(0, Math.ceil((Date.parse(lots.value.until) - props.now) / 1000)) : 0,
);
watch(left, (s, before) => {
  if (props.open && lots.value && s === 0 && before > 0) emit('expired');
});

const ART: Record<number, ArtName> = {
  1: 'weather-sun',
  2: 'weather-rain',
  3: 'weather-snow',
  4: 'weather-wind',
};
const artOf = (id: number): ArtName => {
  const w = catalog.weather(id);
  return w?.special ? 'weather-special' : (ART[w?.type ?? 1] ?? 'weather-sun');
};
/** 签上写这种天气最要紧的两条效果（天气说明的前两行） */
const fxOf = (id: number) =>
  (catalog.weatherNote(id) ?? '')
    .split(/\r?\n/)
    .filter((x) => x.trim())
    .slice(0, 2);

async function draw() {
  busy.value = true;
  try {
    drawn.value = await endpoints.weatherLots();
    pick.value = 0;
  } catch (e) {
    toast.push(errorMessage(e, t.value.misc.weather.tools.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
async function take() {
  busy.value = true;
  try {
    emit('done', await endpoints.weatherLotsPick(pick.value));
  } catch (e) {
    toast.push(errorMessage(e, t.value.misc.weather.tools.failed), 'danger');
    emit('expired');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtSheet
    :open="open"
    :title="lots ? t.misc.weather.lots.pickTitle : t.misc.weather.lots.title"
    @close="emit('close')"
  >
    <template v-if="lots">
      <p class="dt-wx-sheet-sub">{{ t.misc.weather.lots.pickSub }}</p>
      <div class="dt-wx-lots" role="radiogroup" :aria-label="t.misc.weather.lots.pickTitle">
        <button
          v-for="(id, i) in lots.choices"
          :key="id"
          type="button"
          role="radio"
          :aria-checked="pick === i"
          :class="['dt-wx-lot', { 'is-on': pick === i }]"
          :data-testid="`lot-${i}`"
          @click="pick = i"
        >
          <span class="dt-wx-lot-no">{{ t.misc.weather.lots.lot(i + 1) }}</span>
          <DtArt :name="artOf(id)" :size="40" />
          <b class="dt-wx-lot-name">{{ catalog.weatherName(id) }}</b>
          <span v-for="(x, j) in fxOf(id)" :key="j" class="dt-wx-lot-fx">{{ x }}</span>
        </button>
      </div>
    </template>
    <p v-else class="dt-wx-sheet-sub">{{ t.misc.weather.lots.readySub }}</p>
    <template #actions>
      <div class="dt-wx-lots-actions">
        <button
          v-if="lots"
          type="button"
          class="btn btn-primary dt-btn-block"
          :disabled="busy || left === 0"
          data-testid="lot-take"
          @click="take"
        >
          {{ t.misc.weather.lots.take(catalog.weatherName(lots.choices[pick] ?? lots.choices[0]!)) }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn-primary dt-btn-block"
          :disabled="busy || tools.lots < 1"
          data-testid="lots-draw"
          @click="draw"
        >
          {{ t.misc.weather.lots.draw }}
        </button>
        <p v-if="lots" class="dt-wx-countdown" data-testid="lots-countdown">
          {{ t.misc.weather.lots.countdown(left) }}
        </p>
      </div>
    </template>
  </DtSheet>
</template>
