<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { onMounted, reactive, ref } from 'vue';
import type { BuyBlock, ShopDto, ShopItemDto, ShopSpecialDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
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
    toast.push(errorMessage(e, '购买失败'), 'danger');
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
  if (it.maxBuy > 0) return `最多 ${formatNum(it.maxBuy)}`;
  const why: Record<Exclude<BuyBlock, null>, string> = {
    money: tab.value === 'coin' ? '银币不够' : '钻石不够',
    max: '已达持有上限',
    owned: '已经拥有',
    store: '仓库满了',
  };
  return it.blocked ? why[it.blocked] : '买不了';
};
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取商店失败'), 'danger')));
</script>

<template>
  <HiphopCard :place="2" @changed="load" />
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'coin' }]" href="#" @click.prevent="tab = 'coin'">银币商店</a>
    </li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'black' }]" href="#" @click.prevent="tab = 'black'">黑市</a>
    </li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'special' }]" href="#" @click.prevent="tab = 'special'"
        >今日特价</a
      >
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
          · {{ formatNum(it.price) }} {{ tab === 'coin' ? '银币' : '钻石' }} · 已有 {{ it.owned }}
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
        <span v-else class="dt-meta dt-qty text-center" :data-testid="`qty-hint-${it.goodsId}`">限 1 个</span>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || it.maxBuy === 0"
          :data-testid="`buy-${it.goodsId}`"
          @click="buy(it)"
        >
          买
        </button>
      </div>
    </div>
  </template>
  <template v-if="tab === 'special'">
    <div v-if="!special" class="small text-muted">今天中午 12 点上新</div>
    <div v-else class="dt-card small">
      <b>{{ catalog.goodsName(special.goodsId) }}</b>
      <span class="badge bg-danger ms-1">{{ special.tierName }}</span>
      <div>
        {{ formatNum(special.price) }} 银币 · 剩 {{ special.stock - special.sold }}/{{ special.stock }}
      </div>
      <button
        class="btn btn-sm btn-primary mt-1"
        :disabled="busy || special.sold >= special.stock"
        @click="run(() => endpoints.shopBuySpecial(1))"
      >
        抢购
      </button>
    </div>
  </template>
</template>
