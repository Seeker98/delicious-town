<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TownDto, TownRewardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { effectChips } from '../../utils/effects';
import { formatNum, timeHM } from '../../utils/format';
import { rewardText } from '../../utils/rewards';
import { useServerClock } from '../../utils/serverClock';

const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const clock = useServerClock(() => props.data.now);

const TYPES = [1, 2, 3, 4] as const;

async function act<T>(fn: () => Promise<T>, done: (r: T) => string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    toast.push(done(await fn()), 'success');
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 失败多半是页面已经过时（别人刚许过愿、跨天等）：重新读一次
    emit('reload');
  } finally {
    busy.value = false;
  }
}
const rewards = (list: TownRewardDto[]) => list.map((r) => rewardText(r, catalog)).join(t.value.events.sep);

function shake() {
  void act(
    () => endpoints.townShake(),
    (r) =>
      t.value.town.shook(formatNum(r.coin)) +
      (r.egg ? t.value.town.shookEgg(catalog.goodsName(r.egg.goodsId), r.egg.num) : ''),
    t.value.town.shakeFailed,
  );
}

const bless = computed(() => props.data.bless.today);
const pick = ref('');
const blessFoods = computed(() => {
  const b = bless.value;
  if (!b || !b.levels) return [];
  const [lo, hi] = b.levels;
  return [...catalog.foodsMap.values()].filter((f) => f.level >= lo && f.level <= hi);
});
const blessReward = computed(() => {
  const b = bless.value;
  if (!b) return '';
  const lv = b.levels
    ? b.levels[0] === b.levels[1]
      ? `${b.levels[0]}`
      : `${b.levels[0]}~${b.levels[1]}`
    : '';
  const x = t.value.town;
  const base =
    b.type === 5
      ? x.blessRandom(lv, b.num)
      : b.type === 0
        ? x.blessPick(lv, b.num)
        : b.type === 2
          ? t.value.common.qty(catalog.goodsName(b.goodsId!), b.num)
          : b.type === 3
            ? x.blessCoin(formatNum(b.num))
            : x.blessDiamond(b.num);
  if (!props.data.bless.hasLamp) return base;
  return base + (b.type === 3 ? x.lampCoin : x.lampOne);
});
const feastBlock = computed(() => {
  const b = bless.value;
  if (!b) return '';
  if (props.data.bless.feasted) return t.value.town.feasted;
  if (props.data.bless.activation < b.needAct)
    return t.value.town.feastNeedAct(props.data.bless.activation, b.needAct);
  return '';
});
function feast() {
  const foodsId = bless.value?.type === 0 ? Number(pick.value) : undefined;
  void act(
    () => endpoints.townFeast(foodsId),
    (r) => t.value.town.feastDone(rewards(r.rewards)),
    t.value.town.feastFailed,
  );
}
function wish() {
  void act(
    () => endpoints.townWish(),
    (r) => t.value.town.wished(catalog.data('bless', r.bless.id)?.name ?? r.bless.name),
    t.value.town.wishFailed,
  );
}

const hammerBlock = computed(() => {
  const h = props.data.hammer;
  if (!h.has) return t.value.town.hammerNeed;
  if (clock.pending(h.readyAt)) return t.value.town.hammerCool(timeHM(h.readyAt));
  if (clock.pending(h.townReadyAt)) return t.value.town.hammerTown(clock.secondsLeft(h.townReadyAt));
  return '';
});
function hammer(body: { mode: 'coin'; type: number } | { mode: 'diamond' }) {
  void act(
    () => endpoints.townHammer(body),
    (r) =>
      t.value.town.hammerDone(
        catalog.weatherName(r.from),
        catalog.weatherName(r.to),
        catalog.goodsName(r.gift.goodsId),
        r.gift.num,
      ),
    t.value.town.hammerFailed,
  );
}
</script>

<template>
  <!-- 广场没有 NPC 了：雯姐在酒吧（问题记录 453）；13 哥、镇长大胃锅、卡门的见面礼在协会（问题记录 441） -->
  <h6 class="dt-section">{{ t.town.krab }}</h6>
  <div class="dt-item">
    <div class="dt-item-main">
      <div class="dt-meta">{{ t.town.shakeHint }}</div>
    </div>
    <div class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || data.shaken"
        data-testid="shake"
        @click="shake"
      >
        {{ data.shaken ? t.town.shakenToday : t.town.shake }}
      </button>
    </div>
  </div>

  <h6 class="dt-section">{{ t.town.bless }}</h6>
  <div v-if="bless" class="dt-card small">
    <div>
      <b data-testid="bless-name">{{ catalog.data('bless', bless.id)?.name ?? bless.name }}</b>
      <span class="dt-meta ms-1">{{ t.town.blessBy(data.bless.restName ?? '') }}</span>
    </div>
    <div class="d-flex flex-wrap gap-1 my-1">
      <span
        v-for="c in effectChips(bless.buff)"
        :key="c.text"
        :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
        >{{ c.text }}</span
      >
    </div>
    <div>
      {{ t.town.feastReward }}<span data-testid="bless-reward">{{ blessReward }}</span>
    </div>
    <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
      <select
        v-if="bless.type === 0"
        v-model="pick"
        class="form-select form-select-sm w-auto"
        data-testid="feast-food"
      >
        <option value="">{{ t.town.pickFood }}</option>
        <option v-for="f in blessFoods" :key="f.id" :value="String(f.id)">{{ f.name }}</option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || !!feastBlock || (bless.type === 0 && pick === '')"
        data-testid="feast"
        @click="feast"
      >
        {{ t.town.feast }}
      </button>
      <span v-if="feastBlock" class="text-danger" data-testid="feast-block">{{ feastBlock }}</span>
    </div>
  </div>
  <div v-else class="dt-item">
    <div class="dt-item-main">
      <div class="dt-meta">{{ t.town.noWish }}</div>
      <div v-if="!data.bless.hasLamp" class="dt-meta text-danger" data-testid="wish-block">
        {{ t.town.needLamp }}
      </div>
    </div>
    <div class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !data.bless.hasLamp"
        data-testid="wish"
        @click="wish"
      >
        {{ t.town.wish }}
      </button>
    </div>
  </div>

  <h6 class="dt-section">{{ t.town.hammer }}</h6>
  <div class="dt-card small">
    <div class="mb-1">
      {{ t.town.weatherNow }}<b>{{ catalog.weatherName(data.weather.id, data.weather.name) }}</b>
      <div class="dt-meta">
        {{ t.town.hammerHint(formatNum(data.hammer.coin), data.hammer.diamond) }}
      </div>
    </div>
    <div class="dt-grid2">
      <button
        v-for="x in TYPES"
        :key="x"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!hammerBlock"
        :data-testid="`hammer-${x}`"
        @click="hammer({ mode: 'coin', type: x })"
      >
        {{ t.town.weatherTypes[x] }}
      </button>
      <button
        class="btn btn-sm btn-outline-warning dt-span2"
        :disabled="busy || !!hammerBlock"
        data-testid="hammer-diamond"
        @click="hammer({ mode: 'diamond' })"
      >
        {{ t.town.hammerSpecial }}
      </button>
    </div>
    <div v-if="hammerBlock" class="text-danger mt-1" data-testid="hammer-block">{{ hammerBlock }}</div>
  </div>
</template>
