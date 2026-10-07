<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { TicketResultDto, TownExchangeDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { matchText } from '../../utils/match';

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

const mystery = ref('');

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
    mystery.value = '';
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
  <div class="small">
    <template v-if="part !== 'mystery'">
      <div class="dt-pills mb-1" role="group" :aria-label="t.town.ticket.levelLabel">
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
      <div class="text-muted mb-1">{{ t.town.ticket.rule }}</div>
      <input
        v-model="q"
        type="search"
        class="form-control form-control-sm mb-1"
        :placeholder="t.town.ticket.search"
        data-testid="lt-search"
      />
      <!-- 列表限高、自己滚动，兑换按钮一直在列表下面看得到 -->
      <div class="dt-card dt-ticket-list py-0" data-testid="lt-list">
        <div v-if="shown.length === 0" class="text-muted py-2">{{ t.town.ticket.noMatch }}</div>
        <div v-for="id in shown" :key="id" class="dt-ticket-row" :data-testid="`lt-food-${id}`">
          <div class="flex-fill dt-ticket-name">
            <div class="dt-clamp1">{{ catalog.foodName(id) }}</div>
            <div class="dt-meta">
              {{ t.town.ticket.foodHave(haveOf(id))
              }}<span v-if="shortOf(id) > 0" class="badge text-bg-warning ms-1">{{
                t.town.ticket.short(shortOf(id))
              }}</span>
            </div>
          </div>
          <!-- 选上以后才出现减号和数量（数量可以直接填）；+ 一直是同一个按钮，点了焦点不丢（终审） -->
          <template v-if="nums[id]">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
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
              class="form-control form-control-sm dt-ticket-num"
              :aria-label="t.town.ticket.numOf(catalog.foodName(id))"
              :data-testid="`lt-num-${id}`"
              @change="setNum(id, ($event.target as HTMLInputElement).value)"
            />
          </template>
          <button
            :ref="(el) => setPlusEl(id, el)"
            type="button"
            class="btn btn-sm btn-outline-primary"
            :disabled="total >= have"
            :aria-label="t.town.ticket.addOne(catalog.foodName(id))"
            :data-testid="`lt-add-${id}`"
            @click="step(id, 1)"
          >
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 mt-1">
        <span aria-live="polite" data-testid="lt-picked">{{ t.town.ticket.picked(total, have) }}</span>
        <button
          class="btn btn-sm btn-primary ms-auto"
          :disabled="busy || total === 0 || total > have"
          data-testid="lt-go"
          @click="run(() => endpoints.townLevelTicket(level, picks))"
        >
          {{ t.town.ticket.go(total) }}
        </button>
      </div>
    </template>

    <template v-if="part !== 'level'">
      <div :class="['d-flex align-items-center gap-1', part === 'mystery' ? '' : 'mt-3']">
        <b>{{ t.town.ticket.mystery }}</b>
        <span>{{ t.town.ticket.have(data.mysteryTickets) }}</span>
      </div>
      <div class="d-flex align-items-center gap-1 mt-1">
        <!-- 下拉框占剩下的宽度、可以收窄：法文食材名长，原来把右边的按钮挤出屏幕（质量期 ④） -->
        <select v-model="mystery" class="form-select form-select-sm dt-shrink" data-testid="mt-food">
          <option value="">{{ t.town.ticket.pickMystery }}</option>
          <option v-for="id in data.mysteryFoods" :key="id" :value="String(id)">
            {{ catalog.foodName(id) }}
          </option>
        </select>
        <button
          class="btn btn-sm btn-primary flex-shrink-0"
          :disabled="busy || data.mysteryTickets === 0 || mystery === ''"
          data-testid="mt-go"
          @click="run(() => endpoints.townMysteryTicket(Number(mystery)))"
        >
          {{ t.town.ticket.btn }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dt-ticket-list {
  max-height: 18rem;
  overflow-y: auto;
}
.dt-ticket-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--dt-line);
}
.dt-ticket-row:last-child {
  border-bottom: 0;
}
/* 名字能缩，长名字截断，不把加减按钮挤出去（终审） */
.dt-ticket-name {
  min-width: 0;
}
.dt-ticket-num {
  width: 3.5rem;
  text-align: center;
}
</style>
