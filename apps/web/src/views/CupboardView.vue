<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { SHARED_FOODS, type CupboardDto, type FridgeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { foodLevelLabel, formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const tab = ref<'cupboard' | 'fridge'>('cupboard');
const data = ref<CupboardDto | null>(null);
const fridge = ref<FridgeDto | null>(null);
const picked = ref<number | null>(null);
const num = ref(1);
const busy = ref(false);

/** 按等级筛选（问题记录：橱柜食材太多时只看某一级）；0 = 全部，记住上次选的 */
const LEVEL_KEY = 'dt_cupboard_level';
function savedLevel(): number {
  try {
    return Number(localStorage.getItem(LEVEL_KEY)) || 0;
  } catch {
    return 0;
  }
}
const level = ref(savedLevel());
watch(level, (v) => {
  try {
    localStorage.setItem(LEVEL_KEY, String(v));
  } catch {
    // 存储不可用时忽略
  }
});
const levelOf = (foodsId: number) => catalog.food(foodsId)?.level ?? 0;
const levels = computed(() => {
  const count = new Map<number, number>();
  for (const f of data.value?.items ?? [])
    count.set(levelOf(f.foodsId), (count.get(levelOf(f.foodsId)) ?? 0) + 1);
  return [...count].sort((a, b) => a[0] - b[0]).map(([lv, n]) => ({ lv, n }));
});
const shown = computed(() =>
  (data.value?.items ?? []).filter((f) => level.value === 0 || levelOf(f.foodsId) === level.value),
);

const pickedItem = computed(() => data.value?.items.find((x) => x.foodsId === picked.value) ?? null);
const pickedLevel = computed(() => (picked.value ? (catalog.food(picked.value)?.level ?? 0) : 0));
const canDecompose = computed(() => pickedLevel.value >= 2 && pickedLevel.value <= 6);
const canCompose = computed(() => pickedLevel.value >= 1 && pickedLevel.value <= 4);
/** 问题记录 140：万能食材能不能换稀有食材 */
const MASTER_RULE = computed((): Record<number, string> => {
  const c = t.value.cupboard;
  const base = SHARED_FOODS.masterBase;
  return {
    [base + 1]: c.master1,
    [base + 2]: c.master2,
    [base + 3]: c.masterHigh,
    [base + 4]: c.masterHigh,
    [base + 5]: c.masterHigh,
  };
});

/** 一次最多分解几个；合成要偶数个（问题记录：合成不显示最大数） */
const decomposeMax = computed(() => Math.min(data.value?.handleMax ?? 100, pickedItem.value?.num ?? 0));
const composeMax = computed(() => Math.floor(decomposeMax.value / 2) * 2);
const decomposeN = computed(() => Math.max(1, Math.min(num.value || 1, decomposeMax.value)));
/** 兑换稀有食材（问题记录 202）：数量框和合成一样表示消耗几个，2 个换 1 次；一次最多 100 个（50 次） */
const exchangeMax = computed(() => Math.floor(Math.min(100, pickedItem.value?.num ?? 0) / 2) * 2);
const exchangeN = computed(() =>
  Math.max(2, Math.min(Math.floor((num.value || 2) / 2) * 2, exchangeMax.value)),
);
const composeN = computed(() =>
  Math.max(2, Math.min(Math.floor((num.value || 2) / 2) * 2, composeMax.value)),
);

async function load() {
  data.value = await endpoints.cupboard();
}
function thaw(f: FridgeDto['items'][number]) {
  const name = catalog.foodName(f.foodsId);
  if (!window.confirm(t.value.cupboard.thawConfirm(f.thawable, name, formatNum(f.thawCoin)))) return;
  void run(() => endpoints.thaw(f.foodsId), t.value.cupboard.thawFailed);
}
async function openFridge() {
  tab.value = 'fridge';
  fridge.value = await endpoints.fridge();
  if (data.value?.fridgeUnread) await endpoints.readFridge();
}
async function run(fn: () => Promise<unknown>, fallback: string) {
  busy.value = true;
  try {
    await fn();
    await load();
    if (tab.value === 'fridge') fridge.value = await endpoints.fridge();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
function pick(id: number) {
  picked.value = picked.value === id ? null : id;
  num.value = 1;
}
function handle(way: 'compose' | 'decompose') {
  const foodsId = picked.value!;
  return run(async () => {
    const n = way === 'compose' ? composeN.value : decomposeN.value;
    const r = await endpoints.handleFoods({ foodsId, way, num: n });
    toast.push(t.value.cupboard.handleResult(r.success, r.chances, !!r.strengthUsed), 'info');
  }, t.value.cupboard.handleFailed);
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.cupboard.loadFailed), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'cupboard' }]" href="#" @click.prevent="tab = 'cupboard'">{{
        t.cupboard.tabs.cupboard
      }}</a>
    </li>
    <li class="nav-item">
      <a
        :class="['nav-link', { active: tab === 'fridge' }]"
        href="#"
        data-testid="tab-fridge"
        @click.prevent="openFridge"
      >
        {{ t.cupboard.tabs.fridge
        }}<span v-if="data?.fridgeUnread" class="badge bg-danger ms-1">{{ t.cupboard.newBadge }}</span>
      </a>
    </li>
  </ul>

  <template v-if="tab === 'cupboard' && data">
    <div class="small text-muted mb-2">
      {{
        t.cupboard.summary({
          used: data.slotsUsed,
          slots: data.slots,
          lockUsed: data.lockUsed,
          lockSlots: data.lockSlots,
          max: data.foodsMaxNum,
          free: data.freeHandleLeft,
          grade: data.targetGrade,
        })
      }}
    </div>
    <div class="dt-pills">
      <button
        type="button"
        :class="{ active: level === 0 }"
        :aria-pressed="level === 0"
        data-testid="level-all"
        @click="level = 0"
      >
        {{ t.cupboard.levelCount(t.common.all, data.items.length) }}
      </button>
      <button
        v-for="x in levels"
        :key="x.lv"
        type="button"
        :class="{ active: level === x.lv }"
        :aria-pressed="level === x.lv"
        :data-testid="`level-${x.lv}`"
        @click="level = x.lv"
      >
        {{ t.cupboard.levelCount(foodLevelLabel(x.lv), x.n) }}
      </button>
    </div>
    <div v-if="shown.length === 0" class="small text-muted">{{ t.cupboard.levelEmpty }}</div>
    <div class="row g-1">
      <div v-for="f in shown" :key="f.foodsId" class="col-4">
        <button
          :class="[
            'btn',
            'btn-sm',
            'w-100',
            'h-100',
            'border',
            'dt-tile',
            picked === f.foodsId ? 'btn-warning' : 'btn-light',
          ]"
          :data-testid="`pick-${f.foodsId}`"
          @click="pick(f.foodsId)"
        >
          <div class="d-flex justify-content-center gap-1 align-items-start">
            <i v-if="f.locked" class="bi bi-lock-fill"></i>
            <span class="dt-tile-name">{{ catalog.foodName(f.foodsId) }}</span>
            <span class="dt-tile-num text-nowrap">×{{ f.num }}</span>
          </div>
          <!-- 第二行总是占位，方块一样高（问题记录） -->
          <div class="dt-tile-sub text-muted">
            {{ f.streetNeed > 0 ? t.cupboard.streetNeed(f.streetNeed) : ' ' }}
          </div>
        </button>
      </div>
    </div>
    <div v-if="pickedItem" class="border rounded p-2 mt-2 small">
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <b>{{ catalog.foodName(pickedItem.foodsId) }}</b>
        <input
          v-model.number="num"
          type="number"
          min="1"
          max="100"
          class="form-control form-control-sm"
          style="width: 80px"
        />
        <button
          class="btn btn-sm btn-outline-primary"
          data-testid="decompose"
          :disabled="busy || !canDecompose || decomposeMax < 1"
          @click="handle('decompose')"
        >
          {{ t.cupboard.decompose(decomposeN) }}
        </button>
        <button
          class="btn btn-sm btn-outline-primary"
          data-testid="compose"
          :disabled="busy || !canCompose || composeMax < 2"
          @click="handle('compose')"
        >
          {{ t.cupboard.compose(composeN) }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          @click="
            run(
              () =>
                pickedItem!.locked
                  ? endpoints.unlockFood(pickedItem!.foodsId)
                  : endpoints.lockFood(pickedItem!.foodsId),
              t.common.opFailed,
            )
          "
        >
          {{ pickedItem.locked ? t.cupboard.unlock : t.cupboard.lock }}
        </button>
        <button
          v-if="
            pickedItem.foodsId === SHARED_FOODS.masterLevel1 ||
            pickedItem.foodsId === SHARED_FOODS.masterLevel2
          "
          class="btn btn-sm btn-outline-success"
          data-testid="exchange"
          :disabled="busy || exchangeMax < 2"
          @click="
            run(
              () =>
                endpoints.exchangeMaster(
                  pickedItem!.foodsId as typeof SHARED_FOODS.masterLevel1 | typeof SHARED_FOODS.masterLevel2,
                  exchangeN / 2,
                ),
              t.cupboard.exchangeFailed,
            )
          "
        >
          {{ t.cupboard.exchange(exchangeN) }}
        </button>
      </div>
      <div v-if="MASTER_RULE[pickedItem.foodsId]" class="text-muted mt-1" data-testid="master-rule">
        {{ MASTER_RULE[pickedItem.foodsId] }}
      </div>
      <div class="text-muted mt-1">
        {{ t.cupboard.handleHint(decomposeMax, composeMax) }}
      </div>
    </div>
  </template>

  <template v-if="tab === 'fridge' && fridge">
    <div v-if="fridge.items.length === 0" class="small text-muted">{{ t.cupboard.fridgeEmpty }}</div>
    <div
      v-for="f in fridge.items"
      :key="f.foodsId"
      class="d-flex align-items-center border-bottom py-1 small"
    >
      {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
      <span v-if="f.thawable === 0" class="text-muted ms-2">{{ t.cupboard.noRoom }}</span>
      <!-- 解冻要花银币：按钮写明个数和费用，点了再确认（问题记录 206） -->
      <button
        class="btn btn-sm btn-outline-primary ms-auto"
        :disabled="busy || f.thawable === 0"
        :data-testid="`thaw-${f.foodsId}`"
        @click="thaw(f)"
      >
        {{ t.cupboard.thaw(f.thawable, formatNum(f.thawCoin)) }}
      </button>
    </div>
  </template>
</template>
