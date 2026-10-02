<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  SHARED_GOODS,
  type CupboardFoodDto,
  type HiphopPlace,
  type HiphopSpotDto,
  type HiphopTipDto,
} from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { foodLevelLabel, formatNum } from '../../utils/format';

/** 嘻哈男孩卡片（4E-2 设计文档 §5）：只在他今天所在的地点或那家店出现 */
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
const num = ref<number | ''>('');
const busy = ref(false);
const result = ref('');

const here = computed(() => (spot.value.here ? spot.value : null));
const hasWant = computed(() => foods.value.some((f) => f.foodsId === here.value?.food.id));
const wantHave = computed(() => foods.value.find((f) => f.foodsId === here.value?.food.id)?.num ?? 0);
const KINDS = ['food', 'coin', 'diamond'] as const;

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
    body = h.krab(`${catalog.goodsName(GOODS_KRAB_COIN)}×${r.krabCoin}`, !!r.rainbow);
    if (r.tickets > 0) body += h.tickets(`${catalog.goodsName(GOODS_MYSTERY_TICKET)}×${r.tickets}`);
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
    num.value = '';
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
  <div v-if="here" class="dt-card dt-hiphop mb-2" data-testid="hiphop-card">
    <div class="fw-bold mb-1"><i class="bi bi-music-note-beamed"></i> {{ t.mc.hiphop.title }}</div>
    <div class="mb-1">
      {{ t.mc.hiphop.want }}<span class="dt-qty">{{ foodLevelLabel(here.food.level) }}</span>
      {{ t.mc.hiphop.wantHave(catalog.foodName(here.food.id), wantHave) }}
    </div>
    <div class="dt-meta mb-2">
      {{ t.mc.hiphop.meta(formatNum(here.worth), formatNum(here.myWeekWorth)) }}
    </div>
    <div class="dt-pills mb-2">
      <a
        v-for="k in KINDS"
        :key="k"
        href="#"
        :class="{ active: kind === k }"
        :data-testid="`hiphop-kind-${k}`"
        @click.prevent="kind = k"
        >{{ t.mc.hiphop.kinds[k] }}</a
      >
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <span v-if="kind === 'food' && foods.length === 0" class="dt-meta" data-testid="hiphop-no-food">{{
        t.mc.hiphop.noFood
      }}</span>
      <select
        v-else-if="kind === 'food'"
        v-model.number="foodsId"
        class="form-select form-select-sm w-auto"
        data-testid="hiphop-food"
      >
        <option v-if="!hasWant" :value="null" disabled>{{ t.mc.hiphop.pick }}</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">
          {{ t.mc.hiphop.foodOption(catalog.foodName(f.foodsId), f.num) }}
        </option>
      </select>
      <span
        v-if="kind === 'food' && foods.length > 0 && !hasWant"
        class="dt-meta w-100"
        data-testid="hiphop-no-want"
        >{{ t.mc.hiphop.noWant }}</span
      >
      <input
        v-model.number="num"
        type="number"
        min="1"
        class="form-control form-control-sm dt-hiphop-num"
        :placeholder="kind === 'food' ? t.mc.hiphop.numFood : t.mc.hiphop.kinds[kind]"
        data-testid="hiphop-num"
      />
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || (kind === 'food' && foodsId === null)"
        data-testid="hiphop-tip"
        @click="tip"
      >
        {{ t.mc.hiphop.tip }}
      </button>
    </div>
    <div v-if="result" class="mt-2" aria-live="polite" data-testid="hiphop-result">{{ result }}</div>
  </div>
</template>
