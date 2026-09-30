<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { RenownShopDto, RenownShopItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<RenownShopDto | null>(null);
const nums = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.renownShop();
  } catch (e) {
    toast.push(errorMessage(e, '读取声望商店失败'), 'danger');
  }
}
onMounted(load);

/** 这次最多能换几个 */
function maxOf(x: RenownShopItemDto): number {
  if (x.rare) return x.owned ? 0 : 1;
  return Math.max(0, Math.min(x.weeklyLimit - x.bought, Math.floor(data.value!.renown / x.renown)));
}
function blockOf(x: RenownShopItemDto): string {
  if (x.rare && x.owned) return '已拥有';
  if (x.bought >= x.weeklyLimit) return '本周已兑完';
  if (data.value!.renown < x.renown) return '声望不够';
  return '';
}
async function buy(x: RenownShopItemDto) {
  if (busy.value || blockOf(x)) return;
  const n = Math.max(1, Math.min(Math.floor(nums[x.goodsId] ?? 1), maxOf(x)));
  busy.value = true;
  try {
    await endpoints.renownBuy(x.goodsId, n);
    toast.push(`换到了 ${catalog.goodsName(x.goodsId)}×${n}`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="mb-2" data-testid="shop-renown">我的声望 {{ formatNum(data.renown) }}</div>
    <div class="text-muted mb-2">美味券常驻；雕像每周轮换，每人限拥有 1 个</div>
    <div
      v-for="x in data.items"
      :key="x.goodsId"
      class="d-flex flex-wrap align-items-center gap-1 border-bottom py-1"
      :data-testid="`item-${x.goodsId}`"
    >
      <span class="flex-fill">
        {{ catalog.goodsName(x.goodsId) }}
        <span v-if="x.rare" class="badge text-bg-warning ms-1">限拥有 1 个</span>
        <span class="text-muted ms-1"
          >{{ formatNum(x.renown) }} 声望 · 本周 {{ x.bought }}/{{ x.weeklyLimit }}</span
        >
      </span>
      <input
        v-if="!x.rare"
        v-model.number="nums[x.goodsId]"
        type="number"
        min="1"
        :max="Math.max(1, maxOf(x))"
        class="form-control form-control-sm"
        style="width: 70px"
        :data-testid="`num-${x.goodsId}`"
      />
      <button
        class="btn btn-sm btn-outline-success"
        :data-testid="`buy-${x.goodsId}`"
        :disabled="busy || !!blockOf(x)"
        @click="buy(x)"
      >
        兑换
      </button>
      <span v-if="blockOf(x)" class="text-danger">{{ blockOf(x) }}</span>
    </div>
  </div>
</template>
