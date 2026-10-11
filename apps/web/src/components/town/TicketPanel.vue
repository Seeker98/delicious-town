<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { TicketResultDto, TownExchangeDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { matchText } from '../../utils/match';
import DtArt from '../DtArt.vue';
import FoodArt from '../FoodArt.vue';

/** part：只显示 N 级券（13 哥）或神秘券（卡门，问题记录 441）；不传两样都显示 */
const props = defineProps<{ data: TownExchangeDto; part?: 'level' | 'mystery' }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

/**
 * 13 哥的食材兑换券（问题记录 491）：等级是一排按钮、写每级几张券，默认停在第一个有券的等级；
 * 食材按“本街还缺的（缺得多的先）→ 我没有的 → 其他”排，可按名字搜；点 + 选上，选了才出现加减
 */
const LEVELS = [1, 2, 3, 4, 5] as const;
const tickets = (l: number) => props.data.levelTickets[l - 1] ?? 0;
const level = ref<number>(LEVELS.find((l) => tickets(l) > 0) ?? 1);
const nums = reactive<Record<number, number>>({});
const q = ref('');
const clearNums = () => {
  for (const k of Object.keys(nums)) delete nums[Number(k)];
};
watch(level, () => {
  clearNums();
  q.value = '';
});
const have = computed(() => tickets(level.value));
const foods = computed(() => props.data.levelFoods[level.value - 1] ?? []);
const haveOf = (id: number) => props.data.foodHave[id] ?? 0;
const shortOf = (id: number) => Math.max(0, (props.data.streetNeed[id] ?? 0) - haveOf(id));
const shown = computed(() =>
  foods.value
    .filter((id) => matchText(catalog.foodName(id), q.value.trim()))
    .sort((a, b) => shortOf(b) - shortOf(a) || Number(haveOf(a) > 0) - Number(haveOf(b) > 0) || a - b),
);
const picks = computed(() =>
  foods.value.map((id) => ({ foodsId: id, num: nums[id] ?? 0 })).filter((p) => p.num > 0),
);
const total = computed(() => picks.value.reduce((s, p) => s + p.num, 0));
/** 这一种最多还能填几个：券数减去别的已选 */
const roomFor = (id: number) => have.value - (total.value - (nums[id] ?? 0));
const plusEls = new Map<number, HTMLElement>();
const setPlusEl = (id: number, el: unknown) => {
  if (el instanceof HTMLElement) plusEls.set(id, el);
  else plusEls.delete(id);
};
function setNum(id: number, raw: string) {
  const n = Math.max(0, Math.min(Math.floor(Number(raw)) || 0, roomFor(id)));
  if (n === 0) {
    delete nums[id];
    // 减号和输入框没了，焦点放到这一行的 +
    void nextTick(() => plusEls.get(id)?.focus());
  } else nums[id] = n;
}
const step = (id: number, d: 1 | -1) => setNum(id, String((nums[id] ?? 0) + d));

/** 卡门：点一格选一种神秘食材（界面改版 P10：原来是下拉框） */
const mystery = ref<number | null>(null);

async function run(fn: () => Promise<TicketResultDto>) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await fn();
    toast.push(
      t.value.town.ticket.got(
        r.foods.map((f) => t.value.common.qty(catalog.foodName(f.foodsId), f.num)).join(t.value.events.sep),
      ),
      'success',
    );
    clearNums();
    mystery.value = null;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.ticket.failed), 'danger');
    emit('reload');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- 13 哥的食材兑换券（界面改版 P10）：等级胶囊、搜索、一种食材一行（选了才有减号和数量），底部吸住一条“已选 / 兑换” -->
  <template v-if="part !== 'mystery'">
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.town.ticket.levelTitle }}</h2>
      <span class="dt-block-more">{{ t.town.ticket.rule }}</span>
    </div>
    <div class="dt-pills" role="group" :aria-label="t.town.ticket.levelLabel">
      <button
        v-for="l in LEVELS"
        :key="l"
        type="button"
        :class="{ active: level === l }"
        :aria-pressed="level === l"
        :data-testid="`lt-level-${l}`"
        @click="level = l"
      >
        {{ t.town.ticket.levelPill(l, tickets(l)) }}
      </button>
    </div>
    <label class="dt-search-box mt-2">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input
        v-model="q"
        type="search"
        :placeholder="t.town.ticket.search"
        :aria-label="t.town.ticket.search"
        data-testid="lt-search"
      />
    </label>
    <div class="dt-card dt-rows-card mt-2" data-testid="lt-list">
      <div v-if="shown.length === 0" class="dt-row">
        <span class="dt-row-sub">{{ t.town.ticket.noMatch }}</span>
      </div>
      <div v-for="id in shown" :key="id" class="dt-row" :data-testid="`lt-food-${id}`">
        <span class="dt-row-ico"><FoodArt :id="id" :size="28" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title is-strong">{{ catalog.foodName(id) }}</span>
          <span class="dt-row-sub"
            >{{ t.town.ticket.foodHave(haveOf(id))
            }}<span v-if="shortOf(id) > 0" class="dt-tag dt-tag-warn ms-1">{{
              t.town.ticket.short(shortOf(id))
            }}</span></span
          >
        </span>
        <!-- 选上以后才出现减号和数量（数量可以直接填）；+ 一直是同一个按钮，点了焦点不丢（终审） -->
        <span :class="['dt-ticket-step', { 'is-on': !!nums[id] }]">
          <template v-if="nums[id]">
            <button
              type="button"
              :disabled="busy"
              :aria-label="t.town.ticket.subOne(catalog.foodName(id))"
              :data-testid="`lt-minus-${id}`"
              @click="step(id, -1)"
            >
              <i class="bi bi-dash-lg" aria-hidden="true"></i>
            </button>
            <input
              :value="nums[id]"
              type="number"
              min="0"
              :max="roomFor(id)"
              inputmode="numeric"
              :disabled="busy"
              :aria-label="t.town.ticket.numOf(catalog.foodName(id))"
              :data-testid="`lt-num-${id}`"
              @change="setNum(id, ($event.target as HTMLInputElement).value)"
            />
          </template>
          <button
            :ref="(el) => setPlusEl(id, el)"
            type="button"
            :disabled="busy || total >= have"
            :aria-label="t.town.ticket.addOne(catalog.foodName(id))"
            :data-testid="`lt-add-${id}`"
            @click="step(id, 1)"
          >
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </span>
      </div>
    </div>
    <p class="dt-block-note mt-2">{{ t.town.ticket.sortNote }}</p>
    <div class="dt-sticky-bar" data-testid="lt-bar">
      <span class="dt-sticky-bar-main">
        <b aria-live="polite" data-testid="lt-picked">{{ t.town.ticket.picked(total, have) }}</b>
        <span v-if="have > 0 && total >= have">{{ t.town.ticket.usedUp }}</span>
      </span>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="busy || total === 0 || total > have"
        data-testid="lt-go"
        @click="run(() => endpoints.townLevelTicket(level, picks))"
      >
        {{ t.town.ticket.go(total) }}
      </button>
    </div>
  </template>

  <!-- 卡门的神秘食材兑换券（界面改版 P10）：4 列格子点一格选中，下面整宽按钮写清换什么 -->
  <template v-if="part !== 'level'">
    <div :class="['dt-block-head', part === 'mystery' ? 'mt-3' : 'mt-4']">
      <h2 class="dt-block-title">{{ t.town.ticket.mystery }}</h2>
      <span class="dt-block-more" data-testid="mt-have">{{ t.town.ticket.have(data.mysteryTickets) }}</span>
    </div>
    <p class="dt-block-note">{{ t.town.ticket.mysteryNote }}</p>
    <div class="dt-bag" role="group" :aria-label="t.town.ticket.pickMystery" data-testid="mt-grid">
      <button
        v-for="id in data.mysteryFoods"
        :key="id"
        type="button"
        class="dt-bag-cell is-t3"
        :aria-pressed="mystery === id"
        :data-testid="`mt-food-${id}`"
        @click="mystery = id"
      >
        <span v-if="haveOf(id) > 0" class="dt-bag-num" aria-hidden="true">{{ haveOf(id) }}</span>
        <FoodArt :id="id" :size="40" />
        <span class="dt-bag-name">{{ catalog.foodName(id) }}</span>
      </button>
    </div>
    <button
      type="button"
      class="btn btn-primary dt-btn-block mt-3"
      :disabled="busy || data.mysteryTickets === 0 || mystery === null"
      data-testid="mt-go"
      @click="mystery !== null && run(() => endpoints.townMysteryTicket(mystery!))"
    >
      <DtArt name="res-ticket" :size="18" class="me-1" />{{
        mystery === null ? t.town.ticket.pickMystery : t.town.ticket.mysteryGo(catalog.foodName(mystery))
      }}
    </button>
    <p v-if="data.mysteryTickets === 0" class="dt-up-reason">{{ t.town.ticket.noMystery }}</p>
  </template>
</template>
