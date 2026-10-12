<script setup lang="ts">
import { computed, ref } from 'vue';
import { SHARED_GOODS, type TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { formatPct, timeHM } from '../../utils/format';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 镇长猜天气（天气改版 PR③，设计图 Jc-D）：每天猜一次下一次自然换天后的天气大类，换天时揭晓，
 * 猜对得镇长的推荐，猜错不罚。页面上一行，点“猜天气”从下面弹出面板：四类天气两两一排，写预报概率，选一个再确认
 */
const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const restaurant = useRestaurantStore();
const t = useT();
const busy = ref(false);
const open = ref(false);
const picked = ref<number | null>(null);

const ART: Record<number, ArtName> = {
  1: 'weather-sun',
  2: 'weather-rain',
  3: 'weather-snow',
  4: 'weather-wind',
};
const typeName = (type: number) => t.value.misc.weather.types[type] ?? '';
const today = computed(() => props.data.mayor.today);
const nextAt = computed(() => timeHM(props.data.mayor.next.at));
const favor = computed(() => catalog.goodsName(SHARED_GOODS.mayorFavor));
/** 四类按预报概率从高到低排（设计图 Jc-D），一样高按 晴、雨、雪冰、风沙雾 */
const OPTIONS = computed(() =>
  [1, 2, 3, 4]
    .map((type) => ({
      type,
      name: typeName(type),
      p: props.data.mayor.next.types.find((x) => x.type === type)?.p ?? 0,
    }))
    .sort((a, b) => b.p - a.p || a.type - b.type),
);
const sub = computed(() => {
  const m = t.value.town;
  const x = today.value;
  if (!x) return m.mayorHint(nextAt.value);
  if (x.right === null) return m.mayorWaiting(typeName(x.type), timeHM(x.at));
  return x.right
    ? m.mayorRight(typeName(x.actual!), favor.value)
    : m.mayorWrong(typeName(x.actual!), typeName(x.type));
});

function show() {
  picked.value = null;
  open.value = true;
}
async function ask() {
  const type = picked.value;
  if (busy.value || type === null) return;
  busy.value = true;
  try {
    const r = await endpoints.townMayor(type);
    toast.push(
      t.value.town.mayorDone(typeName(type), timeHM(r.today?.at ?? props.data.mayor.next.at)),
      'success',
    );
    open.value = false;
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.mayorFailed), 'danger');
  } finally {
    busy.value = false;
    emit('reload');
  }
}
</script>

<template>
  <div v-if="restaurant.featureOn('world')" class="dt-card dt-rows-card mt-2">
    <div class="dt-row" data-testid="mayor-row">
      <span class="dt-npc-ava dt-row-ava"><DtArt name="npc-mayor" :size="36" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.town.mayorAsk }}</span>
        <span class="dt-row-sub dt-row-sub-wrap" data-testid="mayor-sub">{{ sub }}</span>
        <span v-if="!today" class="dt-row-sub dt-row-sub-wrap">{{ t.town.mayorRule(nextAt, favor) }}</span>
      </span>
      <span class="dt-row-end">
        <button
          v-if="!today"
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy"
          data-testid="mayor-open"
          @click="show"
        >
          {{ t.town.mayorOpen }}
        </button>
        <span v-else-if="today.right === null" class="dt-tag dt-tag-primary" data-testid="mayor-wait">{{
          t.town.mayorWaitTag(timeHM(today.at))
        }}</span>
        <span v-else-if="today.right" class="dt-tag dt-tag-ok" data-testid="mayor-right">{{
          t.town.mayorRightTag
        }}</span>
        <span v-else class="dt-tag" data-testid="mayor-wrong">{{ t.town.mayorWrongTag }}</span>
      </span>
    </div>
  </div>
  <DtSheet :open="open" :title="t.town.mayorQuestion(nextAt)" @close="open = false">
    <p class="dt-wx-sheet-sub">{{ t.town.mayorQuestionSub }}</p>
    <div class="dt-guess-grid" role="radiogroup" :aria-label="t.town.mayorQuestion(nextAt)">
      <button
        v-for="o in OPTIONS"
        :key="o.type"
        type="button"
        role="radio"
        :aria-checked="picked === o.type"
        class="dt-guess"
        :disabled="busy"
        :data-testid="`mayor-${o.type}`"
        @click="picked = o.type"
      >
        <DtArt :name="ART[o.type]!" :size="28" />
        <span class="dt-guess-text"
          ><b>{{ o.name }}</b
          ><small>{{ t.town.mayorForecast(formatPct(o.p, { digits: 0 })) }}</small></span
        >
      </button>
    </div>
    <template #actions>
      <button
        type="button"
        class="btn btn-primary w-100"
        :disabled="busy || picked === null"
        data-testid="mayor-ok"
        @click="ask"
      >
        {{ picked === null ? t.town.mayorPickFirst : t.town.mayorIs(typeName(picked)) }}
      </button>
    </template>
  </DtSheet>
</template>
