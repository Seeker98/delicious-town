<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { WeatherToolResultDto, WeatherToolsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatPct } from '../../utils/format';
import DtSheet from '../DtSheet.vue';
import PickRow from '../PickRow.vue';

/**
 * 司天罗盘（天气改版设计 §2.2；设计图 Wx-C）：选一类天气，每类写能换出哪些天气、各多少概率；
 * 现在的天气转不到的类灰掉（晴天转不到雪冰）
 */
const props = defineProps<{ open: boolean; tools: WeatherToolsDto }>();
const emit = defineEmits<{ close: []; done: [r: WeatherToolResultDto] }>();
const t = useT();
const catalog = useCatalogStore();
const toast = useToastStore();
const pick = ref<number | null>(null);
const busy = ref(false);
watch(
  () => props.open,
  (o) => {
    if (o) pick.value = null;
  },
);

const ART: Record<number, ArtName> = {
  1: 'weather-sun',
  2: 'weather-rain',
  3: 'weather-snow',
  4: 'weather-wind',
};
const rows = computed(() =>
  [1, 2, 4, 3].map((type) => {
    // 不到 0.5% 的写出来是 0%，不列
    const ws = (props.tools.compassOptions.find((o) => o.type === type)?.weathers ?? []).filter(
      (w) => w.p >= 0.005,
    );
    return {
      type,
      ok: ws.length > 0,
      sub: ws.length
        ? ws.map((w) => `${catalog.weatherName(w.id)} ${formatPct(w.p, { digits: 0 })}`).join(' · ')
        : t.value.misc.weather.compass.cannot,
    };
  }),
);

async function go() {
  if (pick.value === null) return;
  busy.value = true;
  try {
    emit('done', await endpoints.weatherCompass(pick.value));
  } catch (e) {
    toast.push(errorMessage(e, t.value.misc.weather.tools.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <DtSheet :open="open" :title="t.misc.weather.compass.title" @close="emit('close')">
    <p class="dt-wx-sheet-sub">{{ t.misc.weather.compass.sub }}</p>
    <div class="dt-card dt-rows-card" role="radiogroup" :aria-label="t.misc.weather.compass.title">
      <PickRow
        v-for="r in rows"
        :key="r.type"
        :on="pick === r.type"
        :disabled="!r.ok"
        :art="ART[r.type]"
        :title="t.misc.weather.types[r.type]"
        :sub="r.sub"
        :testid="`compass-${r.type}`"
        @pick="pick = r.type"
      />
    </div>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="emit('close')">{{ t.common.cancel }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || pick === null"
          data-testid="compass-go"
          @click="go"
        >
          {{ pick === null ? t.misc.weather.compass.pickFirst : t.misc.weather.compass.go }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
