<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { TownExchangeDto, TownExchangeItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import TicketPanel from './TicketPanel.vue';

const CATS = [
  { key: 'bg', label: '蟹黄堡' },
  { key: 'dt', label: '美味券' },
  { key: 'chip', label: '碎片' },
  { key: 'so', label: '其他' },
];
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<TownExchangeDto | null>(null);
const cat = ref('bg');
const nums = reactive<Record<number, number>>({});
const expanded = ref(new Set<number>());
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.townExchange();
  } catch (e) {
    toast.push(errorMessage(e, '读取兑换失败'), 'danger');
  }
}
onMounted(() => void load());

const shown = computed(() => (data.value?.items ?? []).filter((x) => x.category === cat.value));
const numOf = (x: TownExchangeItemDto) => Math.max(1, Math.floor(Number(nums[x.id] ?? 1)) || 1);
const left = (x: TownExchangeItemDto) => (x.times > 0 ? x.times - x.used : Infinity);
function block(x: TownExchangeItemDto): string {
  if (left(x) <= 0) return '已兑完';
  const n = numOf(x);
  if (n > left(x)) return `最多还能兑 ${left(x)} 次`;
  if (n > (data.value?.maxNum ?? 99)) return `一次最多 ${data.value?.maxNum} 份`;
  if (x.need.some((m) => m.have < m.num * n)) return '材料不够';
  return '';
}
function toggleDesc(id: number) {
  const s = new Set(expanded.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  expanded.value = s;
}

async function go(x: TownExchangeItemDto) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.townExchangeDo(x.id, numOf(x));
    toast.push(`兑换成功：${catalog.goodsName(r.goodsId)}×${r.num}`, 'success');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '兑换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <template v-if="data">
    <div class="dt-pills">
      <a
        v-for="c in CATS"
        :key="c.key"
        :class="{ active: cat === c.key }"
        href="#"
        :data-testid="`cat-${c.key}`"
        @click.prevent="cat = c.key"
        >{{ c.label }}</a
      >
    </div>
    <div v-for="x in shown" :key="x.id" class="dt-item" :data-testid="`ex-row-${x.id}`">
      <div class="dt-item-main">
        <div class="dt-item-title" role="button" @click="toggleDesc(x.id)">
          {{ catalog.goodsName(x.goodsId) }}<span v-if="x.num > 1" class="ms-1">×{{ x.num }}</span>
        </div>
        <div class="dt-meta dt-clamp1">
          <span v-for="(m, i) in x.need" :key="m.goodsId"
            >{{ i > 0 ? '、' : '' }}{{ catalog.goodsName(m.goodsId) }}×{{ m.num }}（有 {{ m.have }}）</span
          >
          · {{ x.times > 0 ? `限兑 ${x.times} 次，已兑 ${x.used} 次` : '不限次数' }}
        </div>
        <!-- 不能兑的原因单独一行，不被截断（终审 I1） -->
        <div v-if="block(x)" class="dt-meta text-danger" :data-testid="`ex-block-${x.id}`">
          {{ block(x) }}
        </div>
        <div
          v-if="catalog.goods(x.goodsId)?.desc"
          :class="['dt-meta', { 'dt-clamp1': !expanded.has(x.id) }]"
          :data-testid="`ex-desc-${x.id}`"
        >
          {{ catalog.goods(x.goodsId)?.desc }}
        </div>
      </div>
      <div class="dt-item-actions">
        <input
          v-model.number="nums[x.id]"
          type="number"
          min="1"
          placeholder="1"
          :max="data.maxNum"
          class="form-control form-control-sm dt-qty"
          :data-testid="`ex-num-${x.id}`"
        />
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || !!block(x)"
          :data-testid="`ex-${x.id}`"
          @click="go(x)"
        >
          兑换
        </button>
      </div>
    </div>
    <h6 class="dt-section">兑换券</h6>
    <TicketPanel :data="data" @reload="load" />
  </template>
</template>
