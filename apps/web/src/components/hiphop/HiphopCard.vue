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

const spot = ref<HiphopSpotDto>({ here: false });
const foods = ref<CupboardFoodDto[]>([]);
const kind = ref<'food' | 'coin' | 'diamond'>('food');
const foodsId = ref<number | null>(null);
const num = ref<number | ''>('');
const busy = ref(false);
const result = ref('');

const here = computed(() => (spot.value.here ? spot.value : null));
const wantHave = computed(() => foods.value.find((f) => f.foodsId === here.value?.food.id)?.num ?? 0);
const KINDS = [
  { key: 'food', label: '食材' },
  { key: 'coin', label: '银币' },
  { key: 'diamond', label: '钻石' },
] as const;

async function load() {
  try {
    spot.value = await endpoints.hiphopSpot(
      props.restId !== undefined ? { restId: props.restId } : { place: props.place! },
    );
    if (!spot.value.here) return;
    foods.value = (await endpoints.cupboard()).items.filter((f) => f.num > 0);
    // 橱柜里没有他想要的那种时，默认选第一个有的（PR29 遗留）
    const want = spot.value.food.id;
    foodsId.value = foods.value.some((f) => f.foodsId === want) ? want : (foods.value[0]?.foodsId ?? null);
  } catch {
    spot.value = { here: false };
  }
}
onMounted(load);

const REPLY: Record<HiphopTipDto['reply'], string> = {
  thanks: '感谢您的支持和鼓励，你们是我进步的动力！',
  wanted: '这些正是我需要的！谢谢！',
  krab: '',
};

function describe(r: HiphopTipDto): string {
  const head = r.fresh ? '' : '这些食材看起来不怎么新鲜的样子。';
  let body = REPLY[r.reply];
  if (r.reply === 'krab') {
    body = `你在旁边捡到 ${catalog.goodsName(GOODS_KRAB_COIN)}×${r.krabCoin}${r.rainbow ? '（虹）' : ''}`;
    if (r.tickets > 0) body += `、${catalog.goodsName(GOODS_MYSTERY_TICKET)}×${r.tickets}`;
  }
  const exp = r.exp > 0 ? `额外获得经验 ${formatNum(r.exp)}` : '';
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
    toast.push(errorMessage(e, '打赏失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="here" class="dt-card dt-hiphop mb-2" data-testid="hiphop-card">
    <div class="fw-bold mb-1"><i class="bi bi-music-note-beamed"></i> 嘻哈男孩在这里卖艺</div>
    <div class="mb-1">
      我想要 <span class="dt-qty">{{ foodLevelLabel(here.food.level) }}</span>
      {{ catalog.foodName(here.food.id) }}（你有 {{ wantHave }} 份）
    </div>
    <div class="dt-meta mb-2">
      单次打赏价值达到 {{ formatNum(here.worth) }} 有机会捡到蟹币 · 本周你已打赏
      {{ formatNum(here.myWeekWorth) }}
    </div>
    <div class="dt-pills mb-2">
      <a
        v-for="k in KINDS"
        :key="k.key"
        href="#"
        :class="{ active: kind === k.key }"
        :data-testid="`hiphop-kind-${k.key}`"
        @click.prevent="kind = k.key"
        >{{ k.label }}</a
      >
    </div>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <span v-if="kind === 'food' && foods.length === 0" class="dt-meta" data-testid="hiphop-no-food"
        >橱柜里没有食材，可以改用银币或钻石打赏</span
      >
      <select
        v-else-if="kind === 'food'"
        v-model.number="foodsId"
        class="form-select form-select-sm w-auto"
        data-testid="hiphop-food"
      >
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">
          {{ catalog.foodName(f.foodsId) }}（{{ f.num }}）
        </option>
      </select>
      <input
        v-model.number="num"
        type="number"
        min="1"
        class="form-control form-control-sm dt-hiphop-num"
        :placeholder="kind === 'food' ? '份数' : kind === 'coin' ? '银币' : '钻石'"
        data-testid="hiphop-num"
      />
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || (kind === 'food' && foodsId === null)"
        data-testid="hiphop-tip"
        @click="tip"
      >
        打赏
      </button>
    </div>
    <div v-if="result" class="mt-2" aria-live="polite" data-testid="hiphop-result">{{ result }}</div>
  </div>
</template>
