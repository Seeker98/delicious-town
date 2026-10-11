<script setup lang="ts">
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtRow from '../components/DtRow.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtStepper from '../components/DtStepper.vue';
import DtTabs from '../components/DtTabs.vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onMounted, ref, watch } from 'vue';
import type { BuyBlock, ShopDto, ShopItemDto, ShopSpecialDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { goodsArt } from '../utils/goodsArt';
import { SHOP_CATS, shopCat, type ShopCat } from '../utils/shopCats';

/**
 * 商店（界面改版 P8，设计图“商店”）：一行一件，右边价格按钮，点了弹出购买面板选数量；
 * 上面按小类筛选；说明和数量都在面板里。限时折扣同样一行，点价格抢购
 */
const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: ['coin', 'black', 'special'] as const });
const tabItems = computed(() =>
  (['coin', 'black', 'special'] as const).map((k) => ({ key: k, label: t.value.store.shop.tabs[k] })),
);
const shop = ref<ShopDto | null>(null);
const special = ref<ShopSpecialDto | null>(null);
const failed = ref(false);
const busy = ref(false);
const cat = ref<ShopCat | 'all'>('all');
watch(tab, () => {
  cat.value = 'all';
});

const diamond = computed(() => tab.value === 'black');
const items = computed(() =>
  shop.value ? (tab.value === 'black' ? shop.value.black : shop.value.coin) : [],
);
/** 这个标签页里有的大类才出胶囊 */
const cats = computed(() => SHOP_CATS.filter((c) => items.value.some((it) => shopCat(it.goodsId) === c)));
const shown = computed(() =>
  cat.value === 'all' ? items.value : items.value.filter((it) => shopCat(it.goodsId) === cat.value),
);
/** 余额：银币商店看银币、黑市看钻石；首页数据没读到时不显示 */
const balance = computed(() => {
  const r = restaurant.rest;
  return r ? (diamond.value ? r.diamond : r.coin) : null;
});

async function load() {
  [shop.value, special.value] = await Promise.all([endpoints.shop(), endpoints.shopSpecial()]);
}
onMounted(() => {
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.store.shop.loadFailed), 'danger');
  });
  if (!restaurant.rest) restaurant.refresh().catch(() => {});
});

/** 买不了的原因（行里一个红标签，面板里同样写） */
function reason(it: ShopItemDto): string {
  const s = t.value.store.shop;
  if (it.maxBuy > 0) return '';
  // 后期海报奖杯按星级可用（问题记录 146）
  if (it.blocked === 'star') return s.why.star(it.needStar ?? 0);
  const why: Record<Exclude<BuyBlock, null | 'star'>, string> = {
    money: diamond.value ? s.why.diamond : s.why.coin,
    max: s.why.max,
    owned: s.why.owned,
    store: s.why.store,
  };
  return it.blocked ? why[it.blocked] : s.why.other;
}
const sub = (it: ShopItemDto) =>
  it.maxBuy > 0
    ? `${t.value.store.shop.owned(it.owned)} · ${t.value.store.shop.max(formatNum(it.maxBuy))}`
    : t.value.store.shop.owned(it.owned);

/** 购买面板：普通道具选数量；限时折扣一次抢一个 */
const picked = ref<ShopItemDto | null>(null);
const pickedSpecial = ref(false);
const num = ref(1);
function open(it: ShopItemDto) {
  picked.value = it;
  pickedSpecial.value = false;
  num.value = 1;
}
function openSpecial() {
  pickedSpecial.value = true;
  picked.value = null;
}
function close() {
  picked.value = null;
  pickedSpecial.value = false;
}
const sheetGoods = computed(() =>
  pickedSpecial.value ? (special.value?.goodsId ?? null) : picked.value?.goodsId,
);
const unit = computed(() => (pickedSpecial.value ? (special.value?.price ?? 0) : (picked.value?.price ?? 0)));
const count = computed(() =>
  pickedSpecial.value ? 1 : Math.max(1, Math.min(num.value, picked.value?.maxBuy ?? 1)),
);
const total = computed(() => unit.value * count.value);
/** 限时折扣用的是银币 */
const sheetDiamond = computed(() => !pickedSpecial.value && diamond.value);
const sheetBalance = computed(() => {
  const r = restaurant.rest;
  return r ? (sheetDiamond.value ? r.diamond : r.coin) : null;
});
const specialLeft = computed(() => (special.value ? special.value.stock - special.value.sold : 0));
const canBuy = computed(() =>
  pickedSpecial.value ? specialLeft.value > 0 : (picked.value?.maxBuy ?? 0) > 0,
);

async function buy() {
  if (busy.value || !canBuy.value) return;
  const it = picked.value;
  busy.value = true;
  try {
    if (pickedSpecial.value) await endpoints.shopBuySpecial(1);
    else if (it)
      await (tab.value === 'coin'
        ? endpoints.shopBuy(it.goodsId, count.value)
        : endpoints.shopBuyBlack(it.goodsId, count.value));
    close();
    await load();
    restaurant.refresh().catch(() => {});
  } catch (e) {
    toast.push(errorMessage(e, t.value.store.shop.buyFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <HiphopCard :place="2" @changed="load" />
  <DtTabs v-model="tab" :tabs="tabItems" />
  <DtEmpty v-if="!shop && failed" :title="t.store.shop.loadFailed" data-testid="shop-failed" />
  <DtSkeleton v-else-if="!shop" :rows="6" />
  <template v-else-if="tab !== 'special'">
    <div v-if="balance !== null" class="dt-block-head" data-testid="shop-balance">
      <h2 class="dt-block-title">
        {{ diamond ? t.store.shop.myDiamond : t.store.shop.myCoin }}
        <span class="dt-shop-bal">{{ formatNum(balance) }}</span>
      </h2>
    </div>
    <div
      class="dt-pills dt-pills-scroll"
      role="group"
      :aria-label="t.store.shop.catLabel"
      data-testid="shop-cats"
    >
      <button
        type="button"
        :class="{ active: cat === 'all' }"
        :aria-pressed="cat === 'all'"
        data-testid="cat-all"
        @click="cat = 'all'"
      >
        {{ t.common.all }}
      </button>
      <button
        v-for="c in cats"
        :key="c"
        type="button"
        :class="{ active: cat === c }"
        :aria-pressed="cat === c"
        :data-testid="`cat-${c}`"
        @click="cat = c"
      >
        {{ t.store.shop.cats[c] }}
      </button>
    </div>
    <div class="dt-card dt-rows-card">
      <DtRow v-for="it in shown" :key="it.goodsId" class="dt-row-wrap" :data-testid="`item-${it.goodsId}`">
        <template #icon><DtArt :name="goodsArt(it.goodsId)" :size="28" /></template>
        <template #title>{{ catalog.goodsName(it.goodsId) }}</template>
        <template #sub
          ><span
            v-if="reason(it)"
            :class="it.blocked === 'star' ? 'dt-tag dt-tag-warn' : 'dt-tag-danger'"
            :data-testid="`cap-${it.goodsId}`"
            >{{ reason(it) }}</span
          ><span v-else-if="it.limit === 1" class="dt-tag-mute" :data-testid="`cap-${it.goodsId}`">{{
            t.store.shop.limitOne
          }}</span>
          <span :data-testid="`info-${it.goodsId}`">{{ sub(it) }}</span></template
        >
        <template #end>
          <button
            type="button"
            class="dt-price-btn"
            :disabled="busy || it.maxBuy === 0"
            :aria-label="t.store.shop.open(catalog.goodsName(it.goodsId), formatNum(it.price))"
            :data-testid="`buy-${it.goodsId}`"
            @click="open(it)"
          >
            <DtArt :name="diamond ? 'res-diamond' : 'res-coin-silver'" :size="16" />{{ formatNum(it.price) }}
          </button>
        </template>
      </DtRow>
    </div>
  </template>
  <template v-else>
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.store.shop.specialTitle }}</h2>
      <span class="dt-block-more">{{ t.store.shop.specialNoon }}</span>
    </div>
    <DtEmpty v-if="!special" :title="t.store.shop.specialSoon" data-testid="special-none" />
    <div v-else class="dt-card dt-rows-card">
      <DtRow data-testid="special">
        <template #icon><DtArt :name="goodsArt(special.goodsId)" :size="28" /></template>
        <template #title
          ><span data-testid="special-title"
            >{{ catalog.goodsName(special.goodsId)
            }}<span class="dt-tag-danger">{{
              t.store.shop.tier(Math.round((1 - special.discount) * 100), special.tierName)
            }}</span></span
          ></template
        >
        <template #sub
          ><span class="dt-row-bar"
            ><span class="dt-meter"
              ><i :style="{ width: `${(specialLeft / special.stock) * 100}%` }"></i></span
            >{{ t.store.shop.left(specialLeft, special.stock) }}</span
          ></template
        >
        <template #end>
          <button
            type="button"
            class="dt-price-btn"
            :disabled="busy || specialLeft <= 0"
            :aria-label="t.store.shop.open(catalog.goodsName(special.goodsId), formatNum(special.price))"
            data-testid="special-buy"
            @click="openSpecial"
          >
            <DtArt name="res-coin-silver" :size="16" />{{ formatNum(special.price) }}
          </button>
        </template>
      </DtRow>
    </div>
  </template>

  <DtSheet
    :open="sheetGoods != null"
    :title="sheetGoods != null ? catalog.goodsName(sheetGoods) : ''"
    @close="close"
  >
    <div v-if="sheetGoods != null" data-testid="shop-sheet">
      <div class="dt-detail-head">
        <span class="dt-detail-art"><DtArt :name="goodsArt(sheetGoods)" :size="52" /></span>
        <div class="dt-detail-info">
          <div v-if="pickedSpecial && special">
            {{ t.store.shop.tier(Math.round((1 - special.discount) * 100), special.tierName) }}
          </div>
          <div v-else-if="picked">{{ t.store.shop.cats[shopCat(picked.goodsId)] }}</div>
          <div class="dt-detail-sub">
            <template v-if="pickedSpecial && special">{{
              t.store.shop.left(specialLeft, special.stock)
            }}</template>
            <template v-else-if="picked">{{ sub(picked) }}</template>
          </div>
        </div>
      </div>
      <p v-if="catalog.goods(sheetGoods)?.desc" class="dt-detail-note" data-testid="sheet-desc">
        {{ catalog.goods(sheetGoods)?.desc }}
      </p>
      <div v-if="picked && reason(picked)" class="dt-detail-note text-danger" data-testid="sheet-reason">
        {{ reason(picked) }}
      </div>
      <div v-if="picked && picked.maxBuy > 1" class="dt-detail-qty">
        <span class="flex-fill">{{ t.store.shop.howMany }}</span>
        <button
          type="button"
          class="dt-choice"
          :aria-pressed="num === picked.maxBuy"
          data-testid="qty-max"
          @click="num = picked.maxBuy"
        >
          {{ t.store.shop.max(formatNum(picked.maxBuy)) }}
        </button>
        <DtStepper v-model="num" :min="1" :max="picked.maxBuy" testid="qty-sheet" />
      </div>
      <dl class="dt-sum" data-testid="sheet-sum">
        <div>
          <dt>{{ t.store.shop.unit }}</dt>
          <dd>{{ t.store.shop.price(formatNum(unit), sheetDiamond) }}</dd>
        </div>
        <div>
          <dt>{{ t.store.shop.total }}</dt>
          <dd>
            <b data-testid="sheet-total">{{ t.store.shop.price(formatNum(total), sheetDiamond) }}</b>
          </dd>
        </div>
        <div v-if="sheetBalance !== null">
          <dt>{{ t.store.shop.after }}</dt>
          <dd>{{ t.store.shop.price(formatNum(Math.max(0, sheetBalance - total)), sheetDiamond) }}</dd>
        </div>
      </dl>
    </div>
    <template v-if="sheetGoods != null" #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="close">{{ t.common.cancel }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || !canBuy"
          data-testid="sheet-buy"
          @click="buy"
        >
          {{ pickedSpecial ? t.store.shop.grab : t.store.shop.buyN(count) }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
