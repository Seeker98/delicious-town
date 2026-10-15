<script setup lang="ts">
import { computed, ref } from 'vue';
import type { RenownShopDto, RenownShopItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { clampQty, formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import QtySheet from '../QtySheet.vue';

/**
 * 声望商店（界面改版 P9）：上面我的声望；一行一件（本周兑了几个 / 限拥有），右边价格按钮写要多少声望，
 * 点开弹出兑换面板（和商店的购买面板一样；雕像不选数量）
 */
const props = defineProps<{ data: RenownShopDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const pickedId = ref<number | null>(null);
const num = ref(1);
const picked = computed(() => props.data.items.find((x) => x.goodsId === pickedId.value) ?? null);

/** 这次最多能换几个 */
function maxOf(x: RenownShopItemDto): number {
  if (x.rare) return x.owned ? 0 : 1;
  return Math.max(0, Math.min(x.weeklyLimit - x.bought, Math.floor(props.data.renown / x.renown)));
}
function blockOf(x: RenownShopItemDto): string {
  const s = t.value.tower.shop;
  if (x.rare && x.owned) return s.owned;
  if (x.bought >= x.weeklyLimit) return s.soldOut;
  if (props.data.renown < x.renown) return s.noRenown;
  return '';
}
const sub = (x: RenownShopItemDto) =>
  x.rare ? t.value.tower.shop.rareLine : t.value.tower.shop.weekLine(x.bought, x.weeklyLimit);
const n = computed(() => (picked.value ? clampQty(num.value, maxOf(picked.value)) : 1));

function open(x: RenownShopItemDto) {
  pickedId.value = x.goodsId;
  num.value = 1;
}
async function buy() {
  const x = picked.value;
  if (!x || busy.value || blockOf(x)) return;
  busy.value = true;
  try {
    await endpoints.renownBuy(x.goodsId, n.value);
    toast.push(t.value.tower.shop.got(catalog.goodsName(x.goodsId), n.value));
    pickedId.value = null;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.shop.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="dt-card dt-bar-info">
    <span class="dt-bar-info-art is-primary"><DtArt name="res-prestige" :size="28" /></span>
    <span class="dt-bar-info-main">
      <b data-testid="shop-renown">{{ t.tower.shop.renown(formatNum(data.renown)) }}</b>
      <span>{{ t.tower.shop.rule }}</span>
    </span>
  </section>
  <div class="dt-card dt-rows-card">
    <DtRow
      v-for="x in data.items"
      strong
      :key="x.goodsId"
      class="dt-row-wrap"
      :data-testid="`item-${x.goodsId}`"
    >
      <template #icon><DtArt :name="catalog.goodsArt(x.goodsId)" :size="28" /></template>
      <template #title>{{ catalog.goodsName(x.goodsId) }}</template>
      <template #sub
        >{{ sub(x)
        }}<span
          v-if="blockOf(x) && !(x.rare && x.owned)"
          class="text-danger"
          :data-testid="`block-${x.goodsId}`"
        >
          · {{ blockOf(x) }}</span
        ></template
      >
      <template #end>
        <span v-if="x.rare && x.owned" class="dt-tag-ok" :data-testid="`owned-${x.goodsId}`">{{
          t.tower.shop.owned
        }}</span>
        <button
          v-else
          type="button"
          :class="['dt-price-btn', { 'is-off': !!blockOf(x) }]"
          :aria-label="t.tower.shop.open(catalog.goodsName(x.goodsId), formatNum(x.renown))"
          :data-testid="`buy-${x.goodsId}`"
          @click="open(x)"
        >
          <DtArt name="res-prestige" :size="16" />{{ formatNum(x.renown) }}
        </button>
      </template>
    </DtRow>
  </div>

  <QtySheet
    v-if="picked"
    v-model="num"
    :open="!!picked"
    :title="catalog.goodsName(picked.goodsId)"
    :art="catalog.goodsArt(picked.goodsId)"
    :lines="[sub(picked), catalog.goods(picked.goodsId)?.desc ?? ''].filter(Boolean)"
    :label="t.tower.shop.howMany"
    :max="maxOf(picked)"
    :ok-text="t.tower.shop.btnN(n)"
    :busy="busy"
    :reason="blockOf(picked)"
    :sum="[
      [t.tower.shop.unit, t.tower.shop.price(formatNum(picked.renown))],
      [t.tower.shop.total, t.tower.shop.price(formatNum(picked.renown * n)), true],
      [t.tower.shop.after, t.tower.shop.price(formatNum(Math.max(0, data.renown - picked.renown * n)))],
    ]"
    testid="num"
    @close="pickedId = null"
    @ok="buy"
  />
</template>
