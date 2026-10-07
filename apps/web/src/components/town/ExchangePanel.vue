<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { TownExchangeDto, TownExchangeItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import TicketPanel from './TicketPanel.vue';

const CATS = ['bg', 'dt', 'chip', 'so'] as const;
/**
 * 兑换拆给三位 NPC（问题记录 441）：goods 是镇长大胃锅的稀有道具（四类），
 * level 是 13 哥的食材兑换券，mystery 是卡门的神秘食材兑换券；三者读同一个接口
 */
const props = withDefaults(defineProps<{ part?: 'goods' | 'level' | 'mystery' }>(), { part: 'goods' });
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<TownExchangeDto | null>(null);
const cat = ref('bg');
const nums = reactive<Record<number, number>>({});
const expanded = ref(new Set<number>());
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.townExchange();
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.exchange.loadFailed), 'danger');
  }
}
onMounted(() => void load());

const numOf = (x: TownExchangeItemDto) => Math.max(1, Math.floor(Number(nums[x.id] ?? 1)) || 1);
const left = (x: TownExchangeItemDto) => (x.times > 0 ? x.times - x.used : Infinity);
/**
 * 排序（问题记录 499：原来按原版兑换表的编号，价格高低交错）：不限次数的在前，
 * 再是能兑一份的、材料不够的、已兑完的；同一组按价格从低到高。按一份算，不跟着输入的份数跳
 */
const rank = (x: TownExchangeItemDto) =>
  x.times <= 0 ? 0 : left(x) <= 0 ? 3 : x.need.some((m) => m.have < m.num) ? 2 : 1;
const cost = (x: TownExchangeItemDto) => x.need.reduce((s, m) => s + m.num, 0);
const shown = computed(() =>
  (data.value?.items ?? [])
    .filter((x) => x.category === cat.value)
    .sort((a, b) => rank(a) - rank(b) || cost(a) - cost(b) || a.id - b.id),
);
function block(x: TownExchangeItemDto): string {
  const e = t.value.town.exchange;
  if (left(x) <= 0) return e.soldOut;
  const n = numOf(x);
  if (n > left(x)) return e.maxLeft(left(x));
  if (n > (data.value?.maxNum ?? 99)) return e.maxOnce(data.value?.maxNum ?? 99);
  if (x.need.some((m) => m.have < m.num * n)) return e.lack;
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
    toast.push(t.value.town.exchange.done(catalog.goodsName(r.goodsId), r.num), 'success');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.exchange.failed), 'danger');
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <template v-if="data && props.part === 'goods'">
    <div class="dt-pills">
      <a
        v-for="c in CATS"
        :key="c"
        :class="{ active: cat === c }"
        href="#"
        :data-testid="`cat-${c}`"
        @click.prevent="cat = c"
        >{{ t.town.exchange.cats[c] }}</a
      >
    </div>
    <div v-for="x in shown" :key="x.id" class="dt-item" :data-testid="`ex-row-${x.id}`">
      <div class="dt-item-main">
        <div
          class="dt-item-title"
          role="button"
          tabindex="0"
          @click="toggleDesc(x.id)"
          @keydown.enter.prevent="toggleDesc(x.id)"
          @keydown.space.prevent="toggleDesc(x.id)"
        >
          {{ catalog.goodsName(x.goodsId) }}<span v-if="x.num > 1">{{ t.common.times }}{{ x.num }}</span>
        </div>
        <div class="dt-meta dt-clamp1">
          <span v-for="(m, i) in x.need" :key="m.goodsId"
            >{{ i > 0 ? t.events.sep : '' }}{{ t.common.qty(catalog.goodsName(m.goodsId), m.num)
            }}{{ t.town.exchange.have(m.have) }}</span
          >
          · {{ x.times > 0 ? t.town.exchange.times(x.times, x.used) : t.town.exchange.unlimited }}
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
          {{ t.town.exchange.btn }}
        </button>
      </div>
    </div>
  </template>
  <TicketPanel v-else-if="data && props.part !== 'goods'" :data="data" :part="props.part" @reload="load" />
</template>
