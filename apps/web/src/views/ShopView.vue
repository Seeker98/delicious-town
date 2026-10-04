<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { onMounted, reactive, ref } from 'vue';
import type { BuyBlock, ShopDto, ShopItemDto, ShopSpecialDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const tab = ref<'coin' | 'black' | 'special'>('coin');
const shop = ref<ShopDto | null>(null);
const special = ref<ShopSpecialDto | null>(null);
const qty = reactive<Record<string, number>>({});
const busy = ref(false);
/** 点名字展开完整描述（默认最多两行） */
const expanded = ref(new Set<number>());
function toggleDesc(id: number) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

async function load() {
  [shop.value, special.value] = await Promise.all([endpoints.shop(), endpoints.shopSpecial()]);
}
async function run(fn: () => Promise<unknown>) {
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.store.shop.buyFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
const key = (it: ShopItemDto) => `${tab.value === 'coin' ? 'c' : 'b'}${it.goodsId}`;
/** 填的数超过上限时按上限买 */
const n = (it: ShopItemDto) => Math.max(1, Math.min(qty[key(it)] ?? 1, it.maxBuy));
const buy = (it: ShopItemDto) =>
  run(() =>
    tab.value === 'coin' ? endpoints.shopBuy(it.goodsId, n(it)) : endpoints.shopBuyBlack(it.goodsId, n(it)),
  );
const capText = (it: ShopItemDto) => {
  const s = t.value.store.shop;
  if (it.maxBuy > 0) return s.max(formatNum(it.maxBuy));
  // 后期海报奖杯按星级可用（问题记录 146）
  if (it.blocked === 'star') return s.why.star(it.needStar ?? 0);
  const why: Record<Exclude<BuyBlock, null | 'star'>, string> = {
    money: tab.value === 'coin' ? s.why.coin : s.why.diamond,
    max: s.why.max,
    owned: s.why.owned,
    store: s.why.store,
  };
  return it.blocked ? why[it.blocked] : s.why.other;
};
onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.store.shop.loadFailed), 'danger')));
</script>

<template>
  <HiphopCard :place="2" @changed="load" />
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'coin' }]" href="#" @click.prevent="tab = 'coin'">{{
        t.store.shop.tabs.coin
      }}</a>
    </li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'black' }]" href="#" @click.prevent="tab = 'black'">{{
        t.store.shop.tabs.black
      }}</a>
    </li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'special' }]" href="#" @click.prevent="tab = 'special'">{{
        t.store.shop.tabs.special
      }}</a>
    </li>
  </ul>
  <template v-if="shop && tab !== 'special'">
    <div v-for="it in tab === 'coin' ? shop.coin : shop.black" :key="it.goodsId" class="dt-item">
      <div class="dt-item-main">
        <div class="dt-item-title">
          <span
            role="button"
            tabindex="0"
            :data-testid="`name-${it.goodsId}`"
            @click="toggleDesc(it.goodsId)"
            @keydown.enter.prevent="toggleDesc(it.goodsId)"
            @keydown.space.prevent="toggleDesc(it.goodsId)"
            >{{ catalog.goodsName(it.goodsId) }}</span
          >
        </div>
        <div class="dt-meta dt-clamp1" :data-testid="`info-${it.goodsId}`">
          <!-- "最多几个"放最前面，截断时不会丢（审查） -->
          <span :class="{ 'text-danger': it.maxBuy === 0 }" :data-testid="`cap-${it.goodsId}`">{{
            capText(it)
          }}</span>
          · {{ t.store.shop.price(formatNum(it.price), tab !== 'coin') }} · {{ t.store.shop.owned(it.owned) }}
        </div>
        <div
          v-if="catalog.goods(it.goodsId)?.desc"
          :class="['dt-meta', { 'dt-clamp1': !expanded.has(it.goodsId) }]"
          :data-testid="`desc-${it.goodsId}`"
        >
          {{ catalog.goods(it.goodsId)?.desc }}
        </div>
      </div>
      <div class="dt-item-actions">
        <input
          v-if="it.limit !== 1"
          v-model.number="qty[key(it)]"
          type="number"
          min="1"
          :max="Math.max(1, it.maxBuy)"
          :data-testid="`qty-${it.goodsId}`"
          class="form-control form-control-sm dt-qty"
        />
        <span v-else class="dt-meta dt-qty text-center" :data-testid="`qty-hint-${it.goodsId}`">{{
          t.store.shop.limitOne
        }}</span>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || it.maxBuy === 0"
          :data-testid="`buy-${it.goodsId}`"
          @click="buy(it)"
        >
          {{ t.store.shop.buy }}
        </button>
      </div>
    </div>
  </template>
  <template v-if="tab === 'special'">
    <div v-if="!special" class="small text-muted">{{ t.store.shop.specialSoon }}</div>
    <div v-else class="dt-card small">
      <!-- 折扣标签和名字垂直居中（问题记录 118） -->
      <div class="d-flex align-items-center gap-1" data-testid="special-title">
        <b>{{ catalog.goodsName(special.goodsId) }}</b>
        <span class="badge bg-danger">{{
          t.store.shop.tier(Math.round((1 - special.discount) * 100), special.tierName)
        }}</span>
      </div>
      <div>
        {{ t.store.shop.specialLine(formatNum(special.price), special.stock - special.sold, special.stock) }}
      </div>
      <button
        class="btn btn-sm btn-primary mt-1"
        :disabled="busy || special.sold >= special.stock"
        @click="run(() => endpoints.shopBuySpecial(1))"
      >
        {{ t.store.shop.grab }}
      </button>
    </div>
  </template>
</template>
