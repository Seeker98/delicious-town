<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { SHARED_FOODS, type CupboardDto, type FridgeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtRow from '../components/DtRow.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtStepper from '../components/DtStepper.vue';
import DtTabs from '../components/DtTabs.vue';
import FoodArt from '../components/FoodArt.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useToastStore } from '../stores/toast';
import { foodLevelLabel, formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: ['cupboard', 'fridge'] as const });
const tabItems = computed(() => [
  { key: 'cupboard', label: t.value.cupboard.tabs.cupboard },
  {
    key: 'fridge',
    label: t.value.cupboard.tabs.fridge,
    badge: data.value?.fridgeUnread ? t.value.cupboard.newBadge : null,
  },
]);

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
// 选中的食材用完了（分解光、合成光、兑换光）：不再记着它，免得之后同一种又回到橱柜时面板自己弹出来（P6 审查 I2）
watch(pickedItem, (it) => {
  if (!it) picked.value = null;
});
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
/** 步进器上限：分解、合成、兑换里最多的那个，跟着持有走（终审 I2：原来固定 100，按钮上的数不跟着变） */
const numMax = computed(() => Math.max(1, decomposeMax.value, exchangeMax.value));
const composeN = computed(() =>
  Math.max(2, Math.min(Math.floor((num.value || 2) / 2) * 2, composeMax.value)),
);

/** 格子用了多少（进度条） */
const slotsPct = computed(() =>
  data.value && data.value.slots > 0
    ? Math.min(100, Math.round((data.value.slotsUsed / data.value.slots) * 100))
    : 0,
);
/** 格子底色（设计 §1.1 第 3 条）：万能食材黄底，2 级绿底，3 级以上紫底，1 级白底 */
function tierClass(foodsId: number): string {
  // 万能食材按编号认（masterBase + 1~5），不靠配图类别：旧目录缓存里没有类别
  if (foodsId > SHARED_FOODS.masterBase && foodsId <= SHARED_FOODS.masterBase + 5) return 'is-master';
  const lv = levelOf(foodsId);
  return lv >= 3 ? 'is-t3' : lv === 2 ? 'is-t2' : '';
}
/** 格子的读屏文字：名字、数量、锁定、本街还需（格子上的字都是 aria-hidden 的碎片） */
function cellLabel(x: CupboardDto['items'][number]): string {
  const c = t.value.cupboard;
  const parts = [t.value.common.qty(catalog.foodName(x.foodsId), x.num)];
  if (x.locked) parts.push(c.locked);
  if (x.streetNeed > 0) parts.push(c.streetNeed(x.streetNeed));
  return parts.join(t.value.events.sep);
}
/** 读取失败时不再显示骨架行（终审 I4） */
const failed = ref(false);
async function load() {
  data.value = await endpoints.cupboard();
}
const confirm = useConfirmStore();
async function thaw(f: FridgeDto['items'][number]) {
  const name = catalog.foodName(f.foodsId);
  const yes = await confirm.ask({
    title: t.value.cupboard.thawConfirm(f.thawable, name, formatNum(f.thawCoin)),
  });
  if (!yes) return;
  void run(() => endpoints.thaw(f.foodsId), t.value.cupboard.thawFailed);
}
/** 冰箱用到才读；看过就标成已读（橱柜数据读回来后才知道有没有新的） */
async function loadFridge() {
  fridge.value = await endpoints.fridge();
  if (data.value?.fridgeUnread) await endpoints.readFridge();
}
const fridgeFailed = (e: unknown) => toast.push(errorMessage(e, t.value.cupboard.loadFailed), 'danger');
// 切到冰箱时读；网址直接带 ?tab=fridge 时在橱柜读回来后读（终审 I2：刷新、后退、分享的链接原来是空白）
watch(tab, (k) => {
  if (k === 'fridge') loadFridge().catch(fridgeFailed);
});
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
onMounted(() =>
  load()
    .then(() => (tab.value === 'fridge' ? loadFridge() : undefined))
    .catch((e) => {
      if (!data.value) failed.value = true;
      toast.push(errorMessage(e, t.value.cupboard.loadFailed), 'danger');
    }),
);
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" />

  <DtEmpty
    v-if="tab === 'cupboard' && !data && failed"
    :title="t.cupboard.loadFailed"
    data-testid="cupboard-failed"
  />
  <DtSkeleton v-else-if="tab === 'cupboard' && !data" :rows="5" data-testid="cupboard-skeleton" />
  <!-- 橱柜空着：写去哪里买（界面改版 P4） -->
  <DtEmpty
    v-else-if="tab === 'cupboard' && data && data.items.length === 0"
    art="empty-cupboard"
    :title="t.cupboard.empty.title"
    :body="t.cupboard.empty.body"
    to="/market"
    :link="t.cupboard.empty.link"
    data-testid="cupboard-empty"
  />
  <template v-else-if="tab === 'cupboard' && data">
    <!-- 格子用了多少画成进度条；其余规则一行灰字（界面改版 P6） -->
    <div class="dt-cup-meta" data-testid="cupboard-meta">
      <div class="dt-cup-slots">
        <span class="dt-cup-slots-label">{{ t.cupboard.meta.slots(data.slotsUsed, data.slots) }}</span>
        <span
          class="dt-cup-slotbar"
          role="progressbar"
          :aria-valuenow="slotsPct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t.cupboard.meta.slots(data.slotsUsed, data.slots)"
          ><span :style="{ width: `${slotsPct}%` }"></span
        ></span>
        <span class="dt-cup-slots-label">{{ t.cupboard.meta.lock(data.lockUsed, data.lockSlots) }}</span>
      </div>
      <div class="dt-cup-rules">
        {{ t.cupboard.meta.rules(data.freeHandleLeft, data.foodsMaxNum, data.targetGrade) }}
      </div>
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
    <!-- 背包格子（界面改版 P6，设计 §1.1 第 3 条）：4 列，44px 图，右上角数量，2 级以上和万能食材用底色区分；点一格弹出详情 -->
    <div class="dt-bag">
      <button
        v-for="f in shown"
        :key="f.foodsId"
        type="button"
        :class="['dt-bag-cell', tierClass(f.foodsId)]"
        :aria-pressed="picked === f.foodsId"
        :aria-label="cellLabel(f)"
        :data-testid="`pick-${f.foodsId}`"
        @click="pick(f.foodsId)"
      >
        <span class="dt-bag-num" aria-hidden="true">{{ formatNum(f.num) }}</span>
        <i v-if="f.locked" class="bi bi-lock-fill dt-bag-lock" aria-hidden="true"></i>
        <FoodArt :id="f.foodsId" :size="40" />
        <span class="dt-bag-name" aria-hidden="true">{{ catalog.foodName(f.foodsId) }}</span>
        <!-- 第二行总是占位，格子一样高（问题记录） -->
        <span class="dt-bag-need" aria-hidden="true">{{
          f.streetNeed > 0 ? t.cupboard.needShort(f.streetNeed) : ' '
        }}</span>
      </button>
    </div>
  </template>

  <!-- 点一格从底部弹出详情：大图、持有、本街还需；数量和分解、合成、兑换、锁定 -->
  <DtSheet
    :open="tab === 'cupboard' && !!pickedItem"
    :title="pickedItem ? catalog.foodName(pickedItem.foodsId) : ''"
    @close="picked = null"
  >
    <div v-if="pickedItem" class="dt-detail" data-testid="picked-card">
      <div class="dt-detail-head">
        <span :class="['dt-detail-art', tierClass(pickedItem.foodsId)]"
          ><FoodArt :id="pickedItem.foodsId" :size="52"
        /></span>
        <div class="dt-detail-info">
          <div>
            {{ foodLevelLabel(pickedLevel) }}
            <span v-if="pickedItem.locked" class="dt-tag ms-1">{{ t.cupboard.locked }}</span>
          </div>
          <div class="dt-detail-sub">
            {{ t.cupboard.have(formatNum(pickedItem.num))
            }}<template v-if="pickedItem.streetNeed > 0">
              · {{ t.cupboard.streetNeed(pickedItem.streetNeed) }}</template
            >
          </div>
        </div>
      </div>
      <div class="dt-detail-qty">
        <span>{{ t.cupboard.howMany }}</span>
        <DtStepper v-model="num" :min="1" :max="numMax" />
      </div>
      <div v-if="MASTER_RULE[pickedItem.foodsId]" class="dt-detail-note" data-testid="master-rule">
        {{ MASTER_RULE[pickedItem.foodsId] }}
      </div>
      <div class="dt-detail-note">{{ t.cupboard.handleHint(decomposeMax, composeMax) }}</div>
    </div>
    <template #actions>
      <div v-if="pickedItem" class="dt-cup-actions">
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="busy"
          data-testid="lock"
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
          v-if="canDecompose"
          type="button"
          class="btn btn-outline-primary"
          data-testid="decompose"
          :disabled="busy || decomposeMax < 1"
          @click="handle('decompose')"
        >
          {{ t.cupboard.decompose(decomposeN) }}
        </button>
        <button
          v-if="canCompose"
          type="button"
          class="btn btn-primary"
          data-testid="compose"
          :disabled="busy || composeMax < 2"
          @click="handle('compose')"
        >
          {{ t.cupboard.compose(composeN) }}
        </button>
        <button
          v-if="
            pickedItem.foodsId === SHARED_FOODS.masterLevel1 ||
            pickedItem.foodsId === SHARED_FOODS.masterLevel2
          "
          type="button"
          class="btn btn-primary"
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
    </template>
  </DtSheet>

  <!-- 冰箱：一种一行（界面改版 P6：和别处同一种行）——食材图、名字和数量、等级和本街还需，右边解冻按钮 -->
  <template v-if="tab === 'fridge' && fridge">
    <DtEmpty v-if="fridge.items.length === 0" :title="t.cupboard.fridgeEmpty" data-testid="fridge-empty" />
    <div v-else class="dt-card dt-rows-card">
      <DtRow
        v-for="f in fridge.items"
        :key="f.foodsId"
        :title="t.common.qty(catalog.foodName(f.foodsId), f.num)"
        :data-testid="`fridge-${f.foodsId}`"
      >
        <template #icon><FoodArt :id="f.foodsId" :size="26" /></template>
        <!-- 和橱柜一样写等级和本街还需几个（问题记录 465） -->
        <template #sub
          >{{ foodLevelLabel(levelOf(f.foodsId))
          }}<template v-if="f.streetNeed > 0"> · {{ t.cupboard.streetNeed(f.streetNeed) }}</template
          ><template v-if="f.thawable === 0"> · {{ t.cupboard.noRoom }}</template></template
        >
        <!-- 解冻要花银币：按钮写明个数和费用，点了再确认（问题记录 206） -->
        <template #end>
          <button
            class="btn btn-sm btn-outline-primary"
            :disabled="busy || f.thawable === 0"
            :data-testid="`thaw-${f.foodsId}`"
            @click="thaw(f)"
          >
            {{ t.cupboard.thaw(f.thawable, formatNum(f.thawCoin)) }}
          </button>
        </template>
      </DtRow>
    </div>
  </template>
</template>
