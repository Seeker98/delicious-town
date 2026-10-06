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

/** 告诉镇长大胃锅嘻哈男孩今天在哪（原来在广场居民里，问题记录 441 跟着镇长搬到协会） */
const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const clock = useServerClock(() => props.data.now);
const open = ref(false);
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
async function ask(place: HiphopPlace) {
  if (busy.value) return;
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
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.mayorFailed), 'danger');
  } finally {
    busy.value = false;
    emit('reload');
  }
}
</script>

<template>
  <!-- 嘻哈男孩今天还没出来时写明几点出来、按钮不能点（问题记录 333）；区服关掉嘻哈男孩时他不会出来，这一行不显示 -->
  <template v-if="restaurant.featureOn('hiphop')">
    <div class="dt-item" data-testid="mayor-row">
      <div class="dt-item-main">
        <div class="dt-item-title">{{ t.town.mayorAsk }}</div>
        <div class="dt-meta">
          {{
            data.mayor.answered
              ? t.town.mayorAnswered
              : waiting
                ? t.town.mayorNotOut(data.mayor.hour!)
                : t.town.mayorHint
          }}
        </div>
      </div>
      <div v-if="!data.mayor.answered" class="dt-item-actions">
        <button
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || waiting"
          data-testid="mayor-open"
          @click="open = !open"
        >
          {{ t.town.mayorOpen }}
        </button>
      </div>
    </div>
    <div v-if="open && !data.mayor.answered && !waiting" class="dt-pick-grid mb-2">
      <button
        v-for="p in PLACES"
        :key="p.id"
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        :data-testid="`mayor-${p.id}`"
        @click="ask(p.id)"
      >
        {{ p.name }}
      </button>
    </div>
  </template>
</template>
