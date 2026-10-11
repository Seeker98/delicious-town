<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  SHARED_GOODS,
  type CupboardFoodDto,
  type HiphopPlace,
  type HiphopSpotDto,
  type HiphopTipDto,
} from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtArt from '../DtArt.vue';
import DtStepper from '../DtStepper.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { foodLevelLabel, formatNum } from '../../utils/format';

/**
 * 嘻哈男孩卡片（4E-2 设计文档 §5）：只在他今天所在的地点或那家店出现。
 * 界面改版 P8：默认收起成一行（头像、想要什么），点开才是打赏
 */
const props = defineProps<{ place?: HiphopPlace; restId?: number }>();
const emit = defineEmits<{ changed: [] }>();
const GOODS_KRAB_COIN = SHARED_GOODS.krabCoin;
const GOODS_MYSTERY_TICKET = SHARED_GOODS.mysteryTicket;
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();

const spot = ref<HiphopSpotDto>({ here: false });
const foods = ref<CupboardFoodDto[]>([]);
const kind = ref<'food' | 'coin' | 'diamond'>('food');
const foodsId = ref<number | null>(null);
/** 打赏多少：食材按份、银币按千、钻石按颗起步 */
const STEP = { food: 1, coin: 1000, diamond: 1 } as const;
const num = ref(1);
const open = ref(false);
const busy = ref(false);
const result = ref('');

const here = computed(() => (spot.value.here ? spot.value : null));
const hasWant = computed(() => foods.value.some((f) => f.foodsId === here.value?.food.id));
const wantHave = computed(() => foods.value.find((f) => f.foodsId === here.value?.food.id)?.num ?? 0);
const KINDS = ['food', 'coin', 'diamond'] as const;
watch(kind, (k) => {
  num.value = STEP[k];
});
/** 食材最多给手里有的份数 */
const numMax = computed(() =>
  kind.value === 'food'
    ? Math.max(1, foods.value.find((f) => f.foodsId === foodsId.value)?.num ?? 1)
    : Number.MAX_SAFE_INTEGER,
);

async function load() {
  try {
    spot.value = await endpoints.hiphopSpot(
      props.restId !== undefined ? { restId: props.restId } : { place: props.place! },
    );
    if (!spot.value.here) return;
    foods.value = (await endpoints.cupboard()).items.filter((f) => f.num > 0);
    // 有他想要的就默认选它；没有就不默认选别的：给别的食材不算价值、照样扣掉，要玩家自己选（终审 I1）
    const want = spot.value.food.id;
    foodsId.value = foods.value.some((f) => f.foodsId === want) ? want : null;
  } catch {
    spot.value = { here: false };
  }
}
onMounted(load);

function describe(r: HiphopTipDto): string {
  const h = t.value.mc.hiphop;
  const head = r.fresh ? '' : h.stale;
  let body = r.reply === 'krab' ? '' : h.replies[r.reply];
  if (r.reply === 'krab') {
    body = h.krab(t.value.common.qty(catalog.goodsName(GOODS_KRAB_COIN), r.krabCoin), !!r.rainbow);
    if (r.tickets > 0)
      body += h.tickets(t.value.common.qty(catalog.goodsName(GOODS_MYSTERY_TICKET), r.tickets));
  }
  const exp = r.exp > 0 ? h.exp(formatNum(r.exp)) : '';
  return head + body + exp;
}

async function tip() {
  const h = here.value;
  const n = Math.floor(Number(num.value));
  if (!h || busy.value || !(n >= 1)) return;
  busy.value = true;
  try {
    const where = h.place === 9 ? { place: h.place, restId: h.restId! } : { place: h.place };
    const r = await endpoints.hiphopTip(
      kind.value === 'food'
        ? { ...where, kind: 'food', foodsId: foodsId.value!, num: n }
        : { ...where, kind: kind.value, num: n },
    );
    result.value = describe(r);
    num.value = STEP[kind.value];
    emit('changed');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.mc.hiphop.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div
    v-if="here"
    :class="['dt-card dt-rows-card dt-hiphop mb-2', { 'is-open': open }]"
    data-testid="hiphop-card"
  >
    <button
      type="button"
      class="dt-row dt-hiphop-head"
      :aria-expanded="open"
      data-testid="hiphop-toggle"
      @click="open = !open"
    >
      <span class="dt-npc-ava"><DtArt name="npc-hiphop" :size="40" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title">{{ t.mc.hiphop.title }}</span>
        <span class="dt-row-sub" data-testid="hiphop-want"
          >{{ t.mc.hiphop.want }}{{ foodLevelLabel(here.food.level) }}
          {{ t.mc.hiphop.wantHave(catalog.foodName(here.food.id), wantHave) }}</span
        >
      </span>
      <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
    </button>
    <div v-if="open" class="dt-hiphop-body">
      <div class="dt-seg" role="group" :aria-label="t.mc.hiphop.kindLabel">
        <button
          v-for="k in KINDS"
          :key="k"
          type="button"
          :aria-pressed="kind === k"
          :data-testid="`hiphop-kind-${k}`"
          @click="kind = k"
        >
          {{ t.mc.hiphop.kinds[k] }}
        </button>
      </div>
      <template v-if="kind === 'food'">
        <div v-if="foods.length === 0" class="dt-meta" data-testid="hiphop-no-food">
          {{ t.mc.hiphop.noFood }}
        </div>
        <template v-else>
          <select
            v-model.number="foodsId"
            class="form-select"
            :aria-label="t.mc.hiphop.pick"
            data-testid="hiphop-food"
          >
            <option v-if="!hasWant" :value="null" disabled>{{ t.mc.hiphop.pick }}</option>
            <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">
              {{ t.mc.hiphop.foodOption(catalog.foodName(f.foodsId), f.num) }}
            </option>
          </select>
          <div v-if="!hasWant" class="dt-meta" data-testid="hiphop-no-want">{{ t.mc.hiphop.noWant }}</div>
        </template>
      </template>
      <div class="dt-hiphop-num">
        <span>{{ kind === 'food' ? t.mc.hiphop.numFood : t.mc.hiphop.kinds[kind] }}</span>
        <DtStepper v-model="num" :min="STEP[kind]" :max="numMax" :step="STEP[kind]" testid="hiphop-num" />
      </div>
      <button
        type="button"
        class="btn btn-primary dt-btn-block"
        :disabled="busy || (kind === 'food' && foodsId === null)"
        data-testid="hiphop-tip"
        @click="tip"
      >
        {{ t.mc.hiphop.tip }}
      </button>
      <div class="dt-meta">{{ t.mc.hiphop.meta(formatNum(here.worth), formatNum(here.myWeekWorth)) }}</div>
      <div v-if="result" aria-live="polite" data-testid="hiphop-result">{{ result }}</div>
    </div>
  </div>
</template>
