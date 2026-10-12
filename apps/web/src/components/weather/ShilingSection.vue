<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { ShilingDto, ShilingItem, ShilingShopItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import DtArt from '../DtArt.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum, timeHM } from '../../utils/format';
import RemnantSheet from './RemnantSheet.vue';
import SeasonTableSheet from './SeasonTableSheet.vue';

/**
 * 天气页的时令区（天气改版 PR②；设计图 Sl-A、Sl-B）：
 * 余额、本周获得、现在当令、会的菜里应时的、当令表入口；时令铺四样（残卷、珍稀残卷选菜，罗盘、晴雨签点价格直接换）。
 * 0 星只写“1 星开放”
 */
const props = defineProps<{ data: ShilingDto }>();
const emit = defineEmits<{ changed: [] }>();
const t = useT();
const catalog = useCatalogStore();
const toast = useToastStore();
const sl = computed(() => t.value.misc.weather.shiling);
const roadName = (r: number) => sl.value.roads[r] ?? '';
const myRoads = computed(() => new Set(props.data.myRoads));
const tableOpen = ref(false);
const pickItem = ref<'remnant' | 'rare' | null>(null);
const busy = ref(false);

const ART: Record<ShilingItem, ArtName> = {
  remnant: 'goods-scroll',
  rare: 'goods-scroll',
  compass: 'goods-compass',
  lots: 'goods-lots',
};
const rowTitle = (x: ShilingShopItemDto) =>
  x.item === 'remnant'
    ? sl.value.shop.remnant
    : x.item === 'rare'
      ? sl.value.shop.rare
      : catalog.goodsName(x.goodsId ?? 0);
const rowSub = (x: ShilingShopItemDto) =>
  x.item === 'remnant'
    ? sl.value.shop.remnantSub(x.price, x.left)
    : x.item === 'rare'
      ? sl.value.shop.rareSub(x.left)
      : sl.value.shop.goodsSub(x.left);
/** 珍稀残卷价格固定，钱不够时价格按钮灰掉；残卷价格看等级，进面板选 */
const canBuy = (x: ShilingShopItemDto) => x.left > 0 && props.data.balance >= x.price;

async function buy(item: ShilingItem, mcId?: number) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.shilingBuy(item, mcId);
    const name =
      r.mcId !== null
        ? catalog.mcName(r.mcId)
        : catalog.goodsName(props.data.shop.find((x) => x.item === item)?.goodsId ?? 0);
    toast.push(sl.value.shop.done(name));
    emit('changed');
  } catch (e) {
    toast.push(errorMessage(e, sl.value.shop.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-block-head">
    <h2 class="dt-block-title">{{ sl.title }}</h2>
    <span v-if="data.season.open" class="dt-block-more">{{ sl.weekReset }}</span>
  </div>
  <section v-if="!data.season.open" class="dt-card dt-sl-lock" data-testid="shiling-locked">
    <b>{{ sl.lockedTitle(data.season.minStar) }}</b>
    <p>{{ sl.lockedText }}</p>
    <RouterLink to="/society/star" class="dt-go">{{ sl.starUp }}</RouterLink>
  </section>
  <section v-else class="dt-card dt-rows-card" data-testid="shiling-card">
    <div class="dt-sl-main">
      <div class="dt-sl-nums">
        <div class="dt-sl-num">
          <span class="dt-sl-num-k"><DtArt name="res-shiling" :size="14" />{{ sl.balance }}</span>
          <b data-testid="shiling-balance">{{ formatNum(data.balance) }}</b>
        </div>
        <div class="dt-sl-num">
          <span class="dt-sl-num-k">{{ sl.weekGain }}</span>
          <b data-testid="shiling-week">{{ formatNum(data.weekGain) }}</b>
        </div>
      </div>
      <div class="dt-sl-now" data-testid="shiling-now">
        <span class="dt-sl-k">{{ sl.nowRoads }}</span>
        <span v-for="r in data.season.roads" :key="r" :class="['dt-road', { 'is-mine': myRoads.has(r) }]">{{
          roadName(r)
        }}</span>
        <span class="dt-sl-k">{{ sl.until(timeHM(data.season.until)) }}</span>
      </div>
      <p class="dt-sl-mine" data-testid="shiling-mine">
        <template v-if="data.inSeason.length"
          >{{ sl.mine
          }}<template v-for="(id, i) in data.inSeason" :key="id"
            ><template v-if="i > 0">{{ sl.sep }}</template
            ><RouterLink to="/cookbooks?tab=mc" class="dt-go">{{ catalog.mcName(id) }}</RouterLink></template
          ></template
        >
        <template v-else>{{ sl.mineNone }}</template>
      </p>
      <p class="dt-sl-rule">{{ sl.rule }}</p>
    </div>
    <button type="button" class="dt-row is-link" data-testid="shiling-table-open" @click="tableOpen = true">
      <span class="dt-row-main"
        ><span class="dt-row-title is-strong">{{ sl.tableRow }}</span
        ><span class="dt-row-sub">{{ sl.tableSub }}</span></span
      >
    </button>
  </section>

  <template v-if="data.season.open">
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ sl.shop.title }}</h2>
      <span class="dt-block-more">{{ sl.shop.restock }}</span>
    </div>
    <section class="dt-card dt-rows-card" data-testid="shiling-shop">
      <div v-for="x in data.shop" :key="x.item" class="dt-row dt-sl-item" :data-testid="`shiling-${x.item}`">
        <span class="dt-wx-tool-art"><DtArt :name="ART[x.item]" :size="30" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title is-strong">{{ rowTitle(x) }}</span
          ><span class="dt-row-sub dt-row-sub-wrap">{{ rowSub(x) }}</span></span
        >
        <button
          v-if="x.item === 'remnant'"
          type="button"
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || x.left === 0"
          data-testid="shiling-pick-remnant"
          @click="pickItem = 'remnant'"
        >
          {{ sl.shop.pick }}
        </button>
        <button
          v-else
          type="button"
          class="dt-price-btn"
          :disabled="busy || !canBuy(x)"
          :aria-label="sl.shop.price(formatNum(x.price))"
          :data-testid="`shiling-buy-${x.item}`"
          @click="x.item === 'rare' ? (pickItem = 'rare') : buy(x.item)"
        >
          <DtArt name="res-shiling" :size="16" />{{ formatNum(x.price) }}
        </button>
      </div>
      <p class="dt-wx-tool-foot">{{ sl.shop.foot(data.trialPick) }}</p>
    </section>
  </template>

  <SeasonTableSheet :open="tableOpen" :data="data" @close="tableOpen = false" />
  <RemnantSheet
    :open="pickItem !== null"
    :item="pickItem ?? 'remnant'"
    :data="data"
    :busy="busy"
    @close="pickItem = null"
    @buy="(id) => buy(pickItem ?? 'remnant', id)"
  />
</template>
