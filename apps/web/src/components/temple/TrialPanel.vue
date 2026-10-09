<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { CupboardFoodDto, McLearnedDto, TempleDto, TrialResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatPct } from '../../utils/format';
import { matchText } from '../../utils/match';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const foods = ref<CupboardFoodDto[]>([]);
const learned = ref<McLearnedDto[]>([]);
const main = ref<number | null>(null);
const sub = ref<number | null>(null);
const pick = ref<number | null>(null);
const busy = ref(false);
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
/** 试炼后重读（终审：面板一直挂着，数量和选择会停在试炼前）；不够扣的从主辅里去掉，回到主料槽 */
async function afterTrial() {
  await loadFoods();
  dropShort();
  slot.value = main.value === null ? 'main' : 'sub';
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
function pickFood(id: number) {
  if (slot.value === 'main') {
    main.value = id;
    if (sub.value === null) slot.value = 'sub';
  } else sub.value = id;
}
const slotName = (id: number | null) => (id === null ? t.value.temple.trial.slotEmpty : catalog.foodName(id));
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
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const prepare = (way: 1 | 2) => run(() => endpoints.trialPrepare(way), t.value.temple.trial.prepareFailed);
const refresh = (mcId?: number) =>
  run(() => endpoints.trialRefresh(mcId), t.value.temple.trial.refreshFailed);
const start = async () => {
  await run(async () => {
    result.value = await endpoints.trialStart(main.value!, sub.value!);
  }, t.value.temple.trial.failed);
  await afterTrial();
};
</script>

<template>
  <div class="small">
    <p class="text-muted">
      {{ t.temple.trial.intro(trial.creatives, trial.worthMax, trial.expMax) }}
    </p>
    <details class="mb-2" data-testid="trial-help">
      <summary>{{ t.temple.trial.help }}</summary>
      <ol class="mb-0 ps-3">
        <li v-for="(x, i) in t.temple.trial.helpItems" :key="i">{{ x }}</li>
      </ol>
    </details>
    <div v-if="trial.readyMinutes === 0" class="d-flex gap-1 mb-2">
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="trial-inject"
        :disabled="busy"
        @click="prepare(1)"
      >
        {{ t.temple.trial.inject }}
      </button>
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="trial-meditate"
        :disabled="busy"
        @click="prepare(2)"
      >
        {{ t.temple.trial.meditate }}
      </button>
    </div>
    <div v-else class="mb-1 text-success">{{ t.temple.trial.readyLeft(trial.readyMinutes) }}</div>
    <template v-if="dish">
      <div class="mb-1" data-testid="trial-target">
        {{ t.temple.trial.target }}<b>{{ dish.name }}</b
        >{{ t.temple.trial.targetLevel(dish.level) }}
        <button
          type="button"
          class="dt-link-btn"
          data-testid="trial-refresh"
          :disabled="busy"
          @click="refresh()"
        >
          {{ t.temple.trial.refresh }}
        </button>
        <div v-if="stat" class="text-muted">
          {{
            t.temple.trial.stat(stat.trialWorth, trial.worthMax, stat.trialExp, trial.expMax, stat.levelName)
          }}
        </div>
      </div>
      <div class="d-flex gap-1 mb-2">
        <select v-model.number="pick" class="form-select form-select-sm" data-testid="trial-pick">
          <option :value="null" disabled>{{ t.temple.trial.pickByTentacle(data.tentacles) }}</option>
          <option v-for="m in learned" :key="m.mcId" :value="m.mcId">{{ catalog.mcName(m.mcId) }}</option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary text-nowrap"
          :disabled="busy || pick === null || data.tentacles < 1"
          @click="refresh(pick!)"
        >
          {{ t.temple.trial.pick }}
        </button>
      </div>
      <div class="d-flex gap-1 mb-1">
        <button
          v-for="s in ['main', 'sub'] as const"
          :key="s"
          type="button"
          :class="[
            'btn btn-sm flex-fill text-start dt-trial-slot',
            slot === s ? 'btn-primary' : 'btn-outline-secondary',
          ]"
          :aria-pressed="slot === s"
          :data-testid="`trial-slot-${s}`"
          @click="slot = s"
        >
          <!-- 槽名和选中的食材分两行：法文槽名长，挤在一行会把食材名截掉 -->
          <span class="d-block small opacity-75">{{ t.temple.trial[s] }}</span
          ><span class="d-block dt-clamp1">{{ slotName(s === 'main' ? main : sub) }}</span>
        </button>
      </div>
      <input
        v-model="q"
        type="search"
        class="form-control form-control-sm mb-1"
        :placeholder="t.temple.trial.search"
        data-testid="trial-search"
      />
      <div class="dt-card dt-trial-foods mb-1" data-testid="trial-foods">
        <div v-if="groups.length === 0" class="text-muted">
          {{ searching ? t.temple.trial.noMatch : t.temple.trial.noFoods }}
        </div>
        <div v-for="g in groups" :key="g.lv" class="mb-1">
          <button
            type="button"
            class="dt-link-btn dt-group-label"
            :aria-expanded="isOpen(g.lv)"
            :data-testid="`trial-group-${g.lv}`"
            @click="toggleGroup(g.lv)"
          >
            <i :class="['bi', isOpen(g.lv) ? 'bi-chevron-down' : 'bi-chevron-right']" aria-hidden="true"></i>
            {{ t.temple.trial.group(g.lv, g.list.length) }}
          </button>
          <div v-if="isOpen(g.lv)">
            <button
              v-for="f in g.list"
              :key="f.foodsId"
              type="button"
              :class="[
                'btn btn-sm me-1 mb-1',
                f.foodsId === main || f.foodsId === sub ? 'btn-primary' : 'btn-outline-secondary',
              ]"
              :disabled="blockedFood(f)"
              :aria-pressed="f.foodsId === main || f.foodsId === sub"
              :data-testid="`trial-food-${f.foodsId}`"
              @click="pickFood(f.foodsId)"
            >
              {{ t.common.qty(catalog.foodName(f.foodsId), f.num)
              }}<span v-if="isRare(f.foodsId)" class="dt-sale-tag ms-1">{{ t.temple.trial.rareTag }}</span
              ><span
                v-if="f.foodsId === main || f.foodsId === sub"
                class="ms-1"
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
      <div v-if="anyBlocked" class="text-muted" data-testid="trial-blocked-note">
        {{ t.temple.trial.blockedNote }}
      </div>
      <div v-if="rate !== null" class="text-muted" data-testid="trial-rate">
        {{ t.temple.trial.rate(formatPct(rate, { digits: 1, min: 1 })) }}
      </div>
    </template>
    <button
      class="btn btn-sm btn-primary mt-1"
      data-testid="trial-start"
      :disabled="busy || !!block"
      @click="start"
    >
      {{ t.temple.trial.start }}
    </button>
    <div v-if="block" class="text-danger" data-testid="block">{{ block }}</div>
    <div v-if="result" class="mt-1" data-testid="trial-result">
      <template v-if="result.success">
        {{ t.temple.trial.success(!!result.lucky, result.addWorth, result.addExp, result.proficiency) }}
      </template>
      <template v-else>{{ t.temple.trial.fail }}</template>
    </div>
  </div>
</template>

<style scoped>
.dt-trial-slot {
  min-width: 0;
  flex-basis: 0;
}
.dt-trial-foods {
  max-height: 16rem;
  overflow-y: auto;
}
/* 第一个组名不要上边距：卡片自己有内边距，原来上面多一截空白（487 遗留） */
.dt-trial-foods > div:first-child > .dt-group-label {
  margin-top: 0;
}
</style>
