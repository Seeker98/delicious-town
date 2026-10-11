<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { KrakenFeedDto, TempleDto, TentacleShopDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { GRADE_NAMES, ROAD_NAMES } from '../../utils/labels';
import { GAME_TIME_ZONE } from '@dt/shared';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import QtySheet from '../QtySheet.vue';

/**
 * 克拉肯（界面改版 P9）：上面它今天想吃什么、投喂时间（现在能不能喂）；在售的特色菜一行，点“投喂”弹出数量面板；
 * 触手商店一行一张残卷，价格按钮写要几条触手；种子库存在最后
 */
const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const num = ref(1);
const busy = ref(false);
const result = ref<KrakenFeedDto | null>(null);
const open = ref(false);
/** 现在几点（游戏时间）：标出正在开放的投喂时段 */
const gameHour = () =>
  Number(new Date().toLocaleString('en-US', { timeZone: GAME_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' }));
const hour = ref(gameHour());
/** 页面开着跨过整点：一分钟看一次（P9 终审 M7） */
const hourTimer = setInterval(() => (hour.value = gameHour()), 60_000);
onBeforeUnmount(() => clearInterval(hourTimer));
const levelOfMc = (id: number) => catalog.mc(id)?.level ?? 99;
const shop = ref<TentacleShopDto | null>(null);

onMounted(async () => {
  try {
    shop.value = await endpoints.tentacleShop();
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.kraken.shopFailed), 'danger');
  }
});

const k = computed(() => props.data.kraken);
const target = computed(() => catalog.mc(k.value.targetMcId));
const max = computed(() => Math.max(0, (k.value.current?.leftNum ?? 0) - 1));
const n = computed(() => Math.max(1, Math.min(num.value || 1, max.value)));
const hoursText = computed(() =>
  k.value.hours.map(([a, b]) => t.value.temple.kraken.hours(a, b)).join(t.value.events.sep),
);
const block = computed(() => {
  const x = t.value.temple.kraken;
  if (props.data.star < 1) return t.value.temple.needStar(x.what);
  if (!k.value.feedable) return x.notTime(hoursText.value);
  if (k.value.fed) return x.fed;
  if (!k.value.current) return x.noDish;
  if (max.value < 1) return x.notEnough;
  return '';
});
const punishText = (p: NonNullable<KrakenFeedDto['punish']>) =>
  p.kind === 'forget'
    ? t.value.temple.kraken.forget
    : t.value.temple.kraken.punish(p.kind === 'exp', p.value);

function openFeed() {
  num.value = 1;
  open.value = true;
}
async function feed() {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    result.value = await endpoints.krakenFeed(n.value);
    open.value = false;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.temple.kraken.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
async function shopAct(fn: () => Promise<TentacleShopDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    shop.value = await fn();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="dt-card dt-kraken">
    <div class="dt-kraken-head">
      <span class="dt-kraken-ava"><DtArt name="npc-kraken" :size="56" /></span>
      <span class="dt-bar-info-main">
        <span>{{ t.temple.kraken.wants }}</span>
        <b class="dt-kraken-dish" data-testid="kraken-target">{{
          target?.name ?? catalog.mcName(k.targetMcId)
        }}</b>
        <span v-if="target" class="dt-kraken-tags"
          ><span
            v-if="target.level >= 2"
            :class="['dt-tag', 'dt-lv', target.level >= 3 ? 'is-t3' : 'is-t2']"
            >{{ t.temple.trial.targetLevel(target.level) }}</span
          ><span class="dt-tag">{{ ROAD_NAMES[target.road] ?? '' }}</span></span
        >
      </span>
    </div>
    <div class="dt-kraken-time">
      <span>{{ t.temple.kraken.timeLabel }}</span>
      <span
        v-for="([a, b], i) in k.hours"
        :key="i"
        :class="['dt-kraken-hour', { 'is-on': k.feedable && hour >= a && hour < b }]"
        >{{ t.temple.kraken.hours(a, b) }}</span
      >
      <span
        :class="['dt-kraken-state', k.fed ? 'dt-tag-mute' : k.feedable ? 'dt-tag-ok' : 'dt-tag-mute']"
        data-testid="kraken-state"
        >{{
          k.fed ? t.temple.kraken.fedTag : k.feedable ? t.temple.kraken.canFeed : t.temple.kraken.notNow
        }}</span
      >
    </div>
  </section>
  <div class="dt-card dt-rows-card">
    <DtRow v-if="k.current" class="dt-row-wrap" data-testid="kraken-current">
      <template #title>{{
        t.temple.kraken.current(catalog.mcName(k.current.mcId), GRADE_NAMES[k.current.grade] ?? '')
      }}</template>
      <template #sub>{{ t.temple.kraken.currentSub(k.current.leftNum) }}</template>
      <template #end>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          data-testid="kraken-open"
          @click="openFeed"
        >
          {{ t.temple.kraken.what }}
        </button>
      </template>
    </DtRow>
    <DtRow v-else data-testid="kraken-current">
      <template #title>{{ t.temple.kraken.noDish }}</template>
    </DtRow>
  </div>
  <section v-if="result" class="dt-bar-result is-ok mt-2" data-testid="kraken-result">
    <b>{{
      t.temple.kraken.favorHead(
        result.favor,
        t.temple.kraken.relation[
          result.relation === 'same' ? 'same' : result.relation === 'road' ? 'road' : 'other'
        ],
      )
    }}</b>
    <div class="dt-award-chips">
      <span v-for="s in result.seeds" :key="s.seedId" class="dt-award-chip"
        ><span class="dt-award-chip-art"><DtArt name="goods-seed" :size="20" /></span
        >{{ t.common.qty(catalog.seedName(s.seedId), s.num) }}</span
      >
      <span v-if="result.krabCoin > 0" class="dt-award-chip"
        ><span class="dt-award-chip-art"><DtArt name="res-krab" :size="20" /></span
        >{{ t.common.qty(t.temple.kraken.krabName, result.krabCoin) }}</span
      >
      <span v-if="result.tentacle" class="dt-award-chip"
        ><span class="dt-award-chip-art"><DtArt name="res-tentacle" :size="20" /></span
        >{{ t.common.qty(t.temple.kraken.tentacleName, 1) }}</span
      >
    </div>
    <div v-if="result.punish" class="dt-bar-warn">{{ punishText(result.punish) }}</div>
  </section>

  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.temple.kraken.shop }}</h2>
    <span class="dt-block-more" data-testid="tentacles">{{
      t.temple.kraken.held(shop?.tentacles ?? data.tentacles)
    }}</span>
  </div>
  <template v-if="shop">
    <div class="dt-card dt-rows-card">
      <DtRow v-for="(s, i) in shop.slots" :key="i" :data-testid="`tentacle-slot-${i}`">
        <template #icon><DtArt name="res-fragment" :size="22" /></template>
        <template #title
          >{{ t.temple.kraken.scroll(catalog.mcName(s.mcId))
          }}<span
            v-if="levelOfMc(s.mcId) >= 2"
            :class="['dt-tag', 'dt-lv', levelOfMc(s.mcId) >= 3 ? 'is-t3' : 'is-t2']"
            >{{ t.temple.trial.targetLevel(levelOfMc(s.mcId)) }}</span
          ></template
        >
        <template #end>
          <span v-if="s.bought" class="dt-tag-mute">{{ t.temple.kraken.bought }}</span>
          <button
            v-else
            type="button"
            class="dt-price-btn"
            :aria-label="t.temple.kraken.exchangeLabel(catalog.mcName(s.mcId), levelOfMc(s.mcId))"
            :data-testid="`tentacle-${i}`"
            :disabled="busy || shop.tentacles < levelOfMc(s.mcId)"
            @click="shopAct(() => endpoints.tentacleExchange(i), t.temple.kraken.exFailed)"
          >
            <DtArt name="res-tentacle" :size="16" />{{ t.temple.kraken.tentacles(levelOfMc(s.mcId)) }}
          </button>
        </template>
      </DtRow>
    </div>
    <div class="dt-block-foot">
      <span>{{ t.temple.kraken.shopRule }}</span>
      <button
        type="button"
        class="dt-link-btn"
        data-testid="tentacle-refresh"
        :disabled="busy || shop.tentacles < shop.refreshCost"
        @click="shopAct(() => endpoints.tentacleRefresh(), t.temple.kraken.refreshFailed)"
      >
        {{ shop.refreshCost === 0 ? t.temple.kraken.freeRefresh : t.temple.kraken.refresh }}
      </button>
    </div>
  </template>

  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.temple.kraken.seedStock }}</h2>
    <span class="dt-block-more">{{ t.temple.kraken.plantLater }}</span>
  </div>
  <div class="dt-chip-list" data-testid="seeds">
    <span v-if="data.seeds.length === 0">{{ t.temple.kraken.noSeeds }}</span>
    <span v-for="s in data.seeds" :key="s.seedId">{{ t.common.qty(catalog.seedName(s.seedId), s.num) }}</span>
  </div>

  <QtySheet
    v-if="k.current"
    v-model="num"
    :open="open"
    :title="t.temple.kraken.feedTitle"
    art="npc-kraken"
    :lines="[
      t.temple.kraken.current(catalog.mcName(k.current.mcId), GRADE_NAMES[k.current.grade] ?? ''),
      t.temple.kraken.currentSub(k.current.leftNum),
    ]"
    :label="t.temple.kraken.howMany"
    :max="max"
    :ok-text="t.temple.kraken.feed(n)"
    :busy="busy"
    :reason="block"
    :sum="[[t.temple.kraken.after, t.temple.kraken.portions(Math.max(0, k.current.leftNum - n))]]"
    testid="kraken-num"
    @close="open = false"
    @ok="feed"
  />
</template>
