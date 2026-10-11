<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { TownExchangeDto, TownExchangeItemDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';
import QtySheet from '../QtySheet.vue';
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
/** 点“兑换”弹出的数量面板（界面改版 P10：原来行里有数量框，道具名点开展开说明） */
const openId = ref<number | null>(null);
const num = ref(1);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.townExchange(props.part);
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.exchange.loadFailed), 'danger');
  }
}
onMounted(() => void load());

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
/** 一份都兑不了的原因（行右边的灰色小标签）：已兑完、材料不够 */
function rowBlock(x: TownExchangeItemDto): string {
  const e = t.value.town.exchange;
  if (left(x) <= 0) return e.soldOut;
  if (x.need.some((m) => m.have < m.num)) return e.lack;
  return '';
}
/** 这一项最多能兑几份：剩余次数、一次上限、每样材料够几份取小 */
function maxFor(x: TownExchangeItemDto): number {
  const byNeed = Math.min(...x.need.map((m) => (m.num > 0 ? Math.floor(m.have / m.num) : Infinity)));
  return Math.max(0, Math.min(left(x), data.value?.maxNum ?? 99, byNeed));
}
const opened = computed(() => data.value?.items.find((x) => x.id === openId.value) ?? null);
function open(x: TownExchangeItemDto) {
  openId.value = x.id;
  num.value = 1;
}
const needText = (x: TownExchangeItemDto, n: number) =>
  x.need.map((m) => t.value.common.qty(catalog.goodsName(m.goodsId), m.num * n)).join(t.value.events.sep);
const sheetSum = computed((): Array<[string, string, boolean?]> => {
  const x = opened.value;
  if (!x) return [];
  const e = t.value.town.exchange;
  return [
    [e.cost, needText(x, num.value)],
    [e.get, t.value.common.qty(catalog.goodsName(x.goodsId), x.num * num.value), true],
    [
      e.after,
      x.need
        .map((m) => t.value.common.qty(catalog.goodsName(m.goodsId), m.have - m.num * num.value))
        .join(t.value.events.sep),
    ],
  ];
});

async function go() {
  const x = opened.value;
  if (!x || busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.townExchangeDo(x.id, num.value);
    toast.push(t.value.town.exchange.done(catalog.goodsName(r.goodsId), r.num), 'success');
    openId.value = null;
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
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.npc.titles.mayor }}</h2>
    </div>
    <div class="dt-pills" role="group" :aria-label="t.npc.titles.mayor">
      <button
        v-for="c in CATS"
        :key="c"
        type="button"
        :class="{ active: cat === c }"
        :aria-pressed="cat === c"
        :data-testid="`cat-${c}`"
        @click="cat = c"
      >
        {{ t.town.exchange.cats[c] }}
      </button>
    </div>
    <div class="dt-card dt-rows-card mt-2">
      <DtRow v-for="x in shown" :key="x.id" strong class="dt-row-wrap" :data-testid="`ex-row-${x.id}`">
        <template #icon><DtArt :name="catalog.goodsArt(x.goodsId)" :size="28" /></template>
        <template #title
          >{{ catalog.goodsName(x.goodsId)
          }}<span v-if="x.num > 1"> {{ t.common.times }}{{ x.num }}</span></template
        >
        <template #sub
          ><span class="d-block"
            ><span v-for="(m, i) in x.need" :key="m.goodsId"
              >{{ i > 0 ? t.events.sep : '' }}{{ t.common.qty(catalog.goodsName(m.goodsId), m.num)
              }}{{ t.town.exchange.have(m.have) }}</span
            ></span
          ><span class="d-block">{{
            x.times > 0 ? t.town.exchange.times(x.times, x.used) : t.town.exchange.unlimited
          }}</span></template
        >
        <template #end>
          <span
            v-if="rowBlock(x)"
            :class="['dt-tag', left(x) <= 0 ? 'dt-tag-ok' : 'dt-tag-mute']"
            :data-testid="`ex-block-${x.id}`"
            >{{ rowBlock(x) }}</span
          >
          <button
            v-else
            type="button"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`ex-${x.id}`"
            @click="open(x)"
          >
            {{ t.town.exchange.btn }}
          </button>
        </template>
      </DtRow>
    </div>
    <p class="dt-block-note mt-2">{{ t.town.exchange.tapNote }}</p>
    <QtySheet
      v-if="opened"
      v-model="num"
      :open="!!opened"
      :title="t.town.exchange.sheetTitle(catalog.goodsName(opened.goodsId))"
      :art="catalog.goodsArt(opened.goodsId)"
      :lines="[
        opened.num > 1
          ? t.common.qty(catalog.goodsName(opened.goodsId), opened.num)
          : catalog.goodsName(opened.goodsId),
        catalog.goods(opened.goodsId)?.desc ?? '',
      ]"
      :label="opened.times > 0 ? t.town.exchange.howManyLeft(left(opened)) : t.town.exchange.howMany"
      :max="Math.max(1, maxFor(opened))"
      :ok-text="t.town.exchange.go(num)"
      :busy="busy"
      :reason="maxFor(opened) === 0 ? rowBlock(opened) || t.town.exchange.lack : ''"
      :sum="sheetSum"
      testid="ex-qty"
      @close="openId = null"
      @ok="go"
    />
  </template>
  <TicketPanel v-else-if="data && props.part !== 'goods'" :data="data" :part="props.part" @reload="load" />
</template>
