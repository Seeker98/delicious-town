<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { CupboardFoodDto, McLearnedDto, TempleDto, TrialResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { foodLevelLabel, formatPct } from '../../utils/format';
import { matchText } from '../../utils/match';
import DtRow from '../DtRow.vue';
import DtSheet from '../DtSheet.vue';
import FoodArt from '../FoodArt.vue';

/**
 * 试炼（界面改版 P9）：准备状态、试炼对象（价值和经验两条进度）、主料和辅料两个大格子、预计成功率；
 * 点格子从下面弹出食材面板（搜索、按等级分组、4 列格子），选好自动关
 */
const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const foods = ref<CupboardFoodDto[]>([]);
const learned = ref<McLearnedDto[]>([]);
const main = ref<number | null>(null);
const sub = ref<number | null>(null);
const busy = ref(false);
/** 选食材面板、用触手指定面板、玩法说明 */
const picker = ref(false);
const tentacleOpen = ref(false);
const helpOpen = ref(false);
const result = ref<TrialResultDto | null>(null);
/** 稀有食材：odds < 100（规格书 09 §9.4） */
const RARE = 100;

async function loadFoods() {
  try {
    const [c, m] = await Promise.all([endpoints.cupboard(), endpoints.mc()]);
    foods.value = c.items.filter((x) => x.num > 0);
    learned.value = m.learned.filter((x) => (catalog.mc(x.mcId)?.level ?? 99) <= 5);
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
onMounted(loadFoods);
/** 试炼后重读（终审：面板一直挂着，数量和选择会停在试炼前）；不够扣的从主辅里去掉 */
async function afterTrial() {
  await loadFoods();
  dropShort();
}

const trial = computed(() => props.data.trial);
const dish = computed(() => (trial.value.mcId === null ? undefined : catalog.mc(trial.value.mcId)));
/** 试炼对象当前的试炼价值 / 经验（问题记录：试炼的选项说明不够） */
const stat = computed(() => learned.value.find((m) => m.mcId === trial.value.mcId));
/**
 * 选主料辅料（问题记录 487：两个下拉框拉得太长）：两个槽位 + 按等级分组的食材框，可搜索。
 * 比这道菜低的等级默认收起（低了成功率降），点组名展开；搜索时全部展开
 */
const slot = ref<'main' | 'sub'>('main');
const q = ref('');
const isRare = (id: number) => (catalog.food(id)?.odds ?? RARE) < RARE;
const levelOf = (id: number) => catalog.food(id)?.level ?? 0;
const groups = computed(() => {
  const by = new Map<number, CupboardFoodDto[]>();
  for (const f of foods.value) {
    if (!matchText(catalog.foodName(f.foodsId), q.value.trim())) continue;
    const lv = levelOf(f.foodsId);
    by.set(lv, [...(by.get(lv) ?? []), f]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => b - a)
    .map(([lv, list]) => ({ lv, list: list.sort((a, b) => a.foodsId - b.foodsId) }));
});
/**
 * 手动展开 / 收起过的组；没动过的按“不低于这道菜的等级”决定。
 * 搜索时默认全部展开，这时点组名只记在 searchToggled，换了搜索词就清掉，不影响平时的（487 遗留）
 */
const toggled = ref(new Map<number, boolean>());
const searchToggled = ref(new Map<number, boolean>());
const searching = computed(() => q.value.trim() !== '');
const isOpen = (lv: number) =>
  searching.value
    ? (searchToggled.value.get(lv) ?? true)
    : (toggled.value.get(lv) ?? lv >= (dish.value?.level ?? 0));
function toggleGroup(lv: number) {
  const m = searching.value ? searchToggled : toggled;
  m.value = new Map(m.value).set(lv, !isOpen(lv));
}
watch(q, () => (searchToggled.value = new Map()));
/** 换了试炼对象：默认展开的等级跟着变，手动展开 / 收起的记录作废（487 遗留） */
watch(
  () => trial.value.mcId,
  () => {
    toggled.value = new Map();
    dropShort();
  },
);
/** 持有几个 */
const numOf = (id: number) => foods.value.find((f) => f.foodsId === id)?.num ?? 0;
/** 这道菜本身每样食材扣 1 个（服务端 trial.ts） */
const dishNeed = (id: number) => (dish.value?.foods ?? []).filter((x) => x === id).length;
/**
 * 选这种要几个：这个槽 1 个，另一个槽也是它再 1 个，这道菜本身的食材每样再扣 1 个。
 * 不够时灰掉（487 遗留：原来只看另一个槽，这道菜本身要的点开始才由服务端报不够）
 */
const blockedFood = (f: CupboardFoodDto) => {
  const other = (slot.value === 'main' ? sub.value : main.value) === f.foodsId ? 1 : 0;
  return f.num < 1 + other + dishNeed(f.foodsId);
};
/** 已选的不够扣了（试炼后数量变少、换了试炼对象）：先看主料，再看辅料（终审 I3） */
function dropShort() {
  const need = (id: number) => (main.value === id ? 1 : 0) + (sub.value === id ? 1 : 0) + dishNeed(id);
  if (main.value !== null && numOf(main.value) < need(main.value)) main.value = null;
  if (sub.value !== null && numOf(sub.value) < need(sub.value)) sub.value = null;
}
/** 这道菜本身要的食材不够（列表里只有持有的，一个都没有的看不到）：写进不能开始的原因 */
const dishShort = computed(() =>
  [...new Set(dish.value?.foods ?? [])].filter((id) => numOf(id) < dishNeed(id)),
);
const anyBlocked = computed(() => groups.value.some((g) => isOpen(g.lv) && g.list.some(blockedFood)));
function openSlot(s: 'main' | 'sub') {
  slot.value = s;
  picker.value = true;
}
/** 选好就关掉面板 */
function pickFood(id: number) {
  if (slot.value === 'main') main.value = id;
  else sub.value = id;
  picker.value = false;
}
/** 预计成功率（不含幸运），与服务端同一公式，以服务端为准 */
const rate = computed(() => {
  const a = main.value === null ? undefined : catalog.food(main.value);
  const b = sub.value === null ? undefined : catalog.food(sub.value);
  if (!a || !b || !dish.value) return null;
  const c = trial.value.creatives;
  const base = Math.min(0.6, 0.05 + Math.min(c, 150) / 750 + (c > 150 ? Math.sqrt(c - 150) / 100 : 0));
  const f =
    (a.level - dish.value.level) / 80 + (b.level - dish.value.level) / 160 + (200 - a.odds - b.odds) / 1500;
  return Math.max(0, base + f);
});
const block = computed(() => {
  const x = t.value.temple.trial;
  if (props.data.star < 1) return t.value.temple.needStar(x.what);
  if (trial.value.readyMinutes === 0) return x.notReady;
  if (trial.value.mcId === null) return x.noTarget;
  if (dishShort.value.length > 0)
    return x.dishShort(dishShort.value.map((id) => catalog.foodName(id)).join(t.value.events.sep));
  if (main.value === null || sub.value === null) return x.pickFoods;
  return '';
});

async function run(fn: () => Promise<unknown>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    emit('reload');
    return true;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const prepare = (way: 1 | 2) => run(() => endpoints.trialPrepare(way), t.value.temple.trial.prepareFailed);
const refresh = (mcId?: number) =>
  run(() => endpoints.trialRefresh(mcId), t.value.temple.trial.refreshFailed);
/** 用触手指定一道（花 1 条触手） */
async function pickByTentacle(mcId: number) {
  // 失败时面板留着（P9 终审 M9）
  if (await refresh(mcId)) tentacleOpen.value = false;
}
const start = async () => {
  await run(async () => {
    result.value = await endpoints.trialStart(main.value!, sub.value!);
  }, t.value.temple.trial.failed);
  await afterTrial();
};
</script>

<template>
  <section v-if="trial.readyMinutes > 0" class="dt-card dt-bar-info" data-testid="trial-ready">
    <span class="dt-tag dt-tag-ok">{{ t.temple.trial.ready }}</span>
    <span class="dt-bar-info-main"
      ><span class="dt-trial-ready">{{
        t.temple.trial.readyLine(trial.readyMinutes, trial.creatives)
      }}</span></span
    >
  </section>
  <section v-else class="dt-card dt-trial-prep">
    <b>{{ t.temple.trial.prepTitle }}</b>
    <p>{{ t.temple.trial.prepIntro }}</p>
    <div class="dt-trial-opts">
      <button
        type="button"
        class="dt-trial-opt"
        data-testid="trial-inject"
        :disabled="busy"
        @click="prepare(1)"
      >
        <b>{{ t.temple.trial.injectName }}</b>
        <span>{{ t.temple.trial.injectCost }}</span>
        <span class="dt-tag dt-tag-ok">{{ t.temple.trial.creativesUp(25) }}</span>
      </button>
      <button
        type="button"
        class="dt-trial-opt"
        data-testid="trial-meditate"
        :disabled="busy"
        @click="prepare(2)"
      >
        <b>{{ t.temple.trial.meditateName }}</b>
        <span>{{ t.temple.trial.meditateCost }}</span>
        <span class="dt-tag dt-tag-ok">{{ t.temple.trial.creativesUp(5) }}</span>
      </button>
    </div>
  </section>

  <template v-if="dish">
    <section class="dt-card dt-trial-target" data-testid="trial-target">
      <span class="dt-trial-label">{{ t.temple.trial.target }}</span>
      <div class="dt-trial-dish">
        <b>{{ dish.name }}</b
        ><span :class="['dt-tag', 'dt-lv', dish.level >= 3 ? 'is-t3' : dish.level === 2 ? 'is-t2' : '']">{{
          t.temple.trial.targetLevel(dish.level)
        }}</span
        ><span v-if="stat" class="dt-tag">{{ t.temple.trial.prof(stat.levelName) }}</span>
      </div>
      <template v-if="stat">
        <div class="dt-trial-meter">
          <span>{{ t.temple.trial.worth }}</span>
          <span class="dt-meter"
            ><i
              :style="{ width: `${Math.min(100, (stat.trialWorth / Math.max(1, trial.worthMax)) * 100)}%` }"
            ></i
          ></span>
          <b>{{ t.temple.trial.pctOf(stat.trialWorth, trial.worthMax) }}</b>
        </div>
        <div class="dt-trial-meter">
          <span>{{ t.temple.trial.exp }}</span>
          <span class="dt-meter"
            ><i :style="{ width: `${Math.min(100, (stat.trialExp / Math.max(1, trial.expMax)) * 100)}%` }"></i
          ></span>
          <b>{{ t.temple.trial.pctOf(stat.trialExp, trial.expMax) }}</b>
        </div>
      </template>
      <div class="dt-trial-acts">
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          data-testid="trial-refresh"
          :disabled="busy"
          @click="refresh()"
        >
          {{ t.temple.trial.refresh }}
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-primary"
          data-testid="trial-pick-open"
          :disabled="busy"
          @click="tentacleOpen = true"
        >
          {{ t.temple.trial.pickByTentacle(data.tentacles) }}
        </button>
      </div>
    </section>

    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.temple.trial.slotsTitle }}</h2>
      <span class="dt-block-more">{{ t.temple.trial.slotsTap }}</span>
    </div>
    <div class="dt-trial-slots">
      <button
        v-for="s in ['main', 'sub'] as const"
        :key="s"
        type="button"
        :class="['dt-trial-slot', { 'is-empty': (s === 'main' ? main : sub) === null }]"
        :data-testid="`trial-slot-${s}`"
        @click="openSlot(s)"
      >
        <span class="dt-trial-slot-k">{{ t.temple.trial[s] }}</span>
        <template v-if="(s === 'main' ? main : sub) !== null">
          <FoodArt :id="(s === 'main' ? main : sub)!" :size="40" />
          <span class="dt-trial-slot-n"
            >{{ catalog.foodName((s === 'main' ? main : sub)!)
            }}<span
              v-if="levelOf((s === 'main' ? main : sub)!) >= 2"
              :class="['dt-tag', 'dt-lv', levelOf((s === 'main' ? main : sub)!) >= 3 ? 'is-t3' : 'is-t2']"
              >{{ foodLevelLabel(levelOf((s === 'main' ? main : sub)!)) }}</span
            ></span
          >
          <span v-if="isRare((s === 'main' ? main : sub)!)" class="dt-tag dt-tag-warn">{{
            t.temple.trial.rareTag
          }}</span>
          <span v-else class="dt-trial-slot-sub">{{
            t.temple.trial.have(numOf((s === 'main' ? main : sub)!))
          }}</span>
        </template>
        <span v-else class="dt-trial-slot-plus">{{ t.temple.trial.pickSlot(t.temple.trial[s]) }}</span>
      </button>
    </div>
    <section class="dt-card dt-trial-rate" data-testid="trial-rate">
      <div class="dt-trial-rate-head">
        <span>{{ t.temple.trial.rateLabel }}</span>
        <b>{{ rate === null ? '—' : formatPct(rate, { digits: 1, min: 1 }) }}</b>
      </div>
      <span class="dt-meter"><i :style="{ width: `${Math.min(100, (rate ?? 0) * 100)}%` }"></i></span>
      <span class="dt-trial-rate-note">{{ t.temple.trial.costNote }}</span>
    </section>
  </template>

  <button
    type="button"
    class="btn btn-primary dt-btn-block dt-bar-go"
    data-testid="trial-start"
    :disabled="busy || !!block"
    @click="start"
  >
    {{ t.temple.trial.start }}
  </button>
  <div v-if="block" class="dt-bar-block" data-testid="block">{{ block }}</div>
  <section
    v-if="result"
    :class="['dt-bar-result', result.success ? 'is-ok' : 'is-bad']"
    role="status"
    data-testid="trial-result"
  >
    <template v-if="result.success">
      <b>{{ t.temple.trial.successHead(!!result.lucky) }}</b>
      <div class="dt-bar-detail">
        {{ t.temple.trial.successLine(result.addWorth, result.addExp, result.proficiency) }}
      </div>
    </template>
    <b v-else>{{ t.temple.trial.fail }}</b>
  </section>
  <div class="dt-card dt-rows-card">
    <button type="button" class="dt-row is-link" data-testid="trial-help" @click="helpOpen = true">
      <span class="dt-row-main"
        ><span class="dt-row-title">{{ t.temple.trial.help }}</span
        ><span class="dt-row-sub">{{ t.temple.trial.helpSub(trial.worthMax, trial.expMax) }}</span></span
      >
    </button>
  </div>

  <DtSheet
    :open="picker"
    :title="t.temple.trial.pickTitle(t.temple.trial[slot])"
    focus-panel
    @close="picker = false"
  >
    <input
      v-model="q"
      type="search"
      class="form-control dt-trial-search"
      :placeholder="t.temple.trial.search"
      data-testid="trial-search"
    />
    <div data-testid="trial-foods">
      <div v-if="groups.length === 0" class="dt-detail-note">
        {{ searching ? t.temple.trial.noMatch : t.temple.trial.noFoods }}
      </div>
      <div v-for="g in groups" :key="g.lv">
        <button
          type="button"
          class="dt-trial-group"
          :aria-expanded="isOpen(g.lv)"
          :data-testid="`trial-group-${g.lv}`"
          @click="toggleGroup(g.lv)"
        >
          {{ t.temple.trial.group(foodLevelLabel(g.lv), g.list.length)
          }}<i :class="['bi', isOpen(g.lv) ? 'bi-chevron-up' : 'bi-chevron-down']" aria-hidden="true"></i>
        </button>
        <div v-if="isOpen(g.lv)" class="dt-trial-grid">
          <button
            v-for="f in g.list"
            :key="f.foodsId"
            type="button"
            :class="['dt-trial-food', { 'is-on': f.foodsId === main || f.foodsId === sub }]"
            :disabled="blockedFood(f)"
            :aria-pressed="f.foodsId === main || f.foodsId === sub"
            :data-testid="`trial-food-${f.foodsId}`"
            @click="pickFood(f.foodsId)"
          >
            <span v-if="isRare(f.foodsId)" class="dt-trial-food-rare">{{ t.temple.trial.rareTag }}</span>
            <span class="dt-trial-food-num">{{ f.num }}</span>
            <FoodArt :id="f.foodsId" :size="30" />
            <span class="dt-trial-food-name">{{ catalog.foodName(f.foodsId) }}</span>
            <span
              v-if="f.foodsId === main || f.foodsId === sub"
              class="dt-trial-food-role"
              data-testid="trial-food-role"
              >{{
                [f.foodsId === main ? t.temple.trial.main : '', f.foodsId === sub ? t.temple.trial.sub : '']
                  .filter(Boolean)
                  .join(t.events.sep)
              }}</span
            >
          </button>
        </div>
      </div>
    </div>
    <p v-if="anyBlocked" class="dt-detail-note" data-testid="trial-blocked-note">
      {{ t.temple.trial.blockedNote }}
    </p>
  </DtSheet>

  <DtSheet :open="tentacleOpen" :title="t.temple.trial.tentacleTitle" @close="tentacleOpen = false">
    <p class="dt-detail-note">{{ t.temple.trial.tentacleNote(data.tentacles) }}</p>
    <div class="dt-sheet-list" data-testid="trial-pick">
      <DtRow v-for="m in learned" :key="m.mcId">
        <template #title>{{ catalog.mcName(m.mcId) }}</template>
        <template #sub>{{ t.temple.trial.targetLevel(catalog.mc(m.mcId)?.level ?? 0) }}</template>
        <template #end>
          <button
            type="button"
            class="btn btn-sm btn-outline-primary"
            :disabled="busy || data.tentacles < 1 || m.mcId === trial.mcId"
            :data-testid="`trial-pick-${m.mcId}`"
            @click="pickByTentacle(m.mcId)"
          >
            {{ m.mcId === trial.mcId ? t.temple.trial.current : t.temple.trial.pick }}
          </button>
        </template>
      </DtRow>
    </div>
  </DtSheet>

  <DtSheet :open="helpOpen" :title="t.temple.trial.help" @close="helpOpen = false">
    <div class="dt-help">
      <p>{{ t.temple.trial.intro(trial.creatives, trial.worthMax, trial.expMax) }}</p>
      <ul>
        <li v-for="(x, i) in t.temple.trial.helpItems" :key="i">{{ x }}</li>
      </ul>
    </div>
  </DtSheet>
</template>
