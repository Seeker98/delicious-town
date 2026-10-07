<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { RenownShopDto, RenownShopItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<RenownShopDto | null>(null);
const nums = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.renownShop();
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.shop.loadFailed), 'danger');
  }
}
onMounted(load);

/** 这次最多能换几个 */
function maxOf(x: RenownShopItemDto): number {
  if (x.rare) return x.owned ? 0 : 1;
  return Math.max(0, Math.min(x.weeklyLimit - x.bought, Math.floor(data.value!.renown / x.renown)));
}
function blockOf(x: RenownShopItemDto): string {
  const s = t.value.tower.shop;
  if (x.rare && x.owned) return s.owned;
  if (x.bought >= x.weeklyLimit) return s.soldOut;
  if (data.value!.renown < x.renown) return s.noRenown;
  return '';
}
async function buy(x: RenownShopItemDto) {
  if (busy.value || blockOf(x)) return;
  const n = Math.max(1, Math.min(Math.floor(nums[x.goodsId] ?? 1), maxOf(x)));
  busy.value = true;
  try {
    await endpoints.renownBuy(x.goodsId, n);
    toast.push(t.value.tower.shop.got(catalog.goodsName(x.goodsId), n));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.shop.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="mb-2" data-testid="shop-renown">{{ t.tower.shop.renown(formatNum(data.renown)) }}</div>
    <div class="text-muted mb-2">{{ t.tower.shop.rule }}</div>
    <div
      v-for="x in data.items"
      :key="x.goodsId"
      class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
      :data-testid="`item-${x.goodsId}`"
    >
      <span class="flex-fill">
        {{ catalog.goodsName(x.goodsId) }}
        <span class="text-muted ms-1">{{
          t.tower.shop.meta(formatNum(x.renown), x.bought, x.weeklyLimit)
        }}</span>
      </span>
      <input
        v-if="!x.rare"
        v-model.number="nums[x.goodsId]"
        type="number"
        min="1"
        :max="Math.max(1, maxOf(x))"
        class="form-control form-control-sm dt-qty"
        :data-testid="`num-${x.goodsId}`"
      />
      <!-- 雕像不填数量，限购写在数量框的位置，和银币商店一样（问题记录 489：标签挂在名字后面偏下） -->
      <span
        v-else
        class="text-muted text-nowrap text-center dt-qty-text"
        :data-testid="`limit-${x.goodsId}`"
        >{{ t.tower.shop.limitOne }}</span
      >
      <button
        class="btn btn-sm btn-outline-primary"
        :data-testid="`buy-${x.goodsId}`"
        :disabled="busy || !!blockOf(x)"
        @click="buy(x)"
      >
        {{ t.tower.shop.btn }}
      </button>
      <span v-if="blockOf(x)" class="text-danger">{{ blockOf(x) }}</span>
    </div>
  </div>
</template>
