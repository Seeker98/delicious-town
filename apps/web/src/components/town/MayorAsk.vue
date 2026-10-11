<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { gameParts, HIPHOP_PLACE_FEATURE, HIPHOP_PLACES, type HiphopPlace } from '@dt/shared';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { rewardText } from '../../utils/rewards';
import { talkText } from '../../utils/serverText';
import { useServerClock } from '../../utils/serverClock';
import DtArt from '../DtArt.vue';
import DtSheet from '../DtSheet.vue';

/**
 * 告诉镇长大胃锅嘻哈男孩今天在哪（原来在广场居民里，问题记录 441 跟着镇长搬到协会）。
 * 界面改版 P10：页面上一行，点“告诉镇长”从下面弹出面板，地点是一排换行胶囊，选一个再按“就是某某”确认，免得点错
 */
const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const clock = useServerClock(() => props.data.now);
const open = ref(false);
const picked = ref<HiphopPlace | null>(null);
/** 只列本区服开着的功能的地点：关掉的功能嘻哈男孩不会去（问题记录 256） */
const restaurant = useRestaurantStore();
/** 确定嘻哈男孩今天还没出来时才拦着（服务端没带这个状态的旧版本照旧可以问，问错了服务端会提示） */
const waiting = computed(
  () =>
    props.data.mayor.hiphopOut === false &&
    props.data.mayor.hour !== undefined &&
    // 页面开着过了整点就不再拦着（按服务器时间），稍后重新读取一次拿到他今天的状态（backlog #118）
    gameParts(new Date(clock.now.value)).hour < props.data.mayor.hour,
);
// 服务端每几秒才生成当天的嘻哈男孩记录：过 15 秒再读一次，免得读到的还是“没出来”（质量期 ①a 终审）
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
watch(waiting, (now, before) => {
  if (before && !now) reloadTimer = setTimeout(() => emit('reload'), 15_000);
});
onBeforeUnmount(() => clearTimeout(reloadTimer));
const PLACES = computed(() =>
  HIPHOP_PLACES.filter((p) => {
    const f = HIPHOP_PLACE_FEATURE[p];
    return f === null || restaurant.featureOn(f);
  }).map((p) => ({ id: p, name: t.value.town.places[String(p)] ?? String(p) })),
);
const pickedName = computed(() => PLACES.value.find((p) => p.id === picked.value)?.name ?? '');
function show() {
  picked.value = null;
  open.value = true;
}
async function ask() {
  const place = picked.value;
  if (busy.value || place === null) return;
  busy.value = true;
  try {
    const r = await endpoints.townMayor(place);
    toast.push(
      t.value.town.said(
        t.value.town.mayorName,
        talkText(r.talk),
        r.rewards.map((x) => rewardText(x, catalog)).join(t.value.events.sep),
      ),
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
  <!-- 嘻哈男孩今天还没出来时写明几点出来、按钮换成小标签（问题记录 333）；区服关掉嘻哈男孩时他不会出来，这一行不显示 -->
  <div v-if="restaurant.featureOn('hiphop')" class="dt-card dt-rows-card mt-2">
    <div class="dt-row" data-testid="mayor-row">
      <span class="dt-npc-ava dt-row-ava"><DtArt name="npc-hiphop" :size="36" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title is-strong">{{ t.town.mayorAsk }}</span>
        <span class="dt-row-sub dt-row-sub-wrap">{{
          data.mayor.answered
            ? t.town.mayorAnswered
            : waiting
              ? t.town.mayorNotOut(data.mayor.hour!)
              : t.town.mayorHint
        }}</span>
      </span>
      <span class="dt-row-end">
        <span v-if="data.mayor.answered" class="dt-tag dt-tag-ok" data-testid="mayor-done">{{
          t.town.mayorDoneTag
        }}</span>
        <span v-else-if="waiting" class="dt-tag dt-tag-warn" data-testid="mayor-wait">{{
          t.town.mayorWaitTag(data.mayor.hour!)
        }}</span>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy"
          data-testid="mayor-open"
          @click="show"
        >
          {{ t.town.mayorOpen }}
        </button>
      </span>
    </div>
  </div>
  <DtSheet :open="open" :title="t.town.mayorOpen" @close="open = false">
    <div class="dt-detail-head">
      <span class="dt-npc-ava dt-sheet-ava"><DtArt name="npc-hiphop" :size="56" /></span>
      <div class="dt-detail-info">
        <div>{{ t.town.mayorQuestion }}</div>
        <div class="dt-detail-sub">{{ t.town.mayorQuestionSub }}</div>
      </div>
    </div>
    <div class="dt-field-label-top mt-3">{{ t.town.mayorWent }}</div>
    <div class="dt-place-picks" role="radiogroup" :aria-label="t.town.mayorWent">
      <button
        v-for="p in PLACES"
        :key="p.id"
        type="button"
        role="radio"
        :aria-checked="picked === p.id"
        class="dt-place-pick"
        :disabled="busy"
        :data-testid="`mayor-${p.id}`"
        @click="picked = p.id"
      >
        {{ p.name }}
      </button>
    </div>
    <p class="dt-detail-note text-center">{{ t.town.mayorPickNote }}</p>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="open = false">{{ t.common.cancel }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || picked === null"
          data-testid="mayor-ok"
          @click="ask"
        >
          {{ picked === null ? t.town.mayorPickFirst : t.town.mayorIs(pickedName) }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
