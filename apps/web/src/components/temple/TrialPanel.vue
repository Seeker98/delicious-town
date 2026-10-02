<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CupboardFoodDto, McLearnedDto, TempleDto, TrialResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

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

onMounted(async () => {
  try {
    const [c, m] = await Promise.all([endpoints.cupboard(), endpoints.mc()]);
    foods.value = c.items.filter((x) => x.num > 0);
    learned.value = m.learned.filter((x) => (catalog.mc(x.mcId)?.level ?? 99) <= 5);
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
});

const trial = computed(() => props.data.trial);
const dish = computed(() => (trial.value.mcId === null ? undefined : catalog.mc(trial.value.mcId)));
/** 试炼对象当前的试炼价值 / 经验（问题记录：试炼的选项说明不够） */
const stat = computed(() => learned.value.find((m) => m.mcId === trial.value.mcId));
const foodLabel = (f: CupboardFoodDto) => {
  const d = catalog.food(f.foodsId);
  return t.value.temple.trial.foodLabel(
    catalog.foodName(f.foodsId),
    d?.level ?? '?',
    !!d && d.odds < RARE,
    f.num,
  );
};
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
const start = () =>
  run(async () => {
    result.value = await endpoints.trialStart(main.value!, sub.value!);
  }, t.value.temple.trial.failed);
</script>

<template>
  <div class="small">
    <p class="text-muted">
      {{ t.temple.trial.intro(trial.creatives) }}
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
        <button class="btn btn-sm btn-link" data-testid="trial-refresh" :disabled="busy" @click="refresh()">
          {{ t.temple.trial.refresh }}
        </button>
        <div v-if="stat" class="text-muted">
          {{ t.temple.trial.stat(stat.trialWorth, stat.trialExp, stat.levelName) }}
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
      <select v-model.number="main" class="form-select form-select-sm mb-1" data-testid="trial-main">
        <option :value="null" disabled>{{ t.temple.trial.main }}</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">{{ foodLabel(f) }}</option>
      </select>
      <select v-model.number="sub" class="form-select form-select-sm mb-1" data-testid="trial-sub">
        <option :value="null" disabled>{{ t.temple.trial.sub }}</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">{{ foodLabel(f) }}</option>
      </select>
      <div v-if="rate !== null" class="text-muted" data-testid="trial-rate">
        {{ t.temple.trial.rate((rate * 100).toFixed(1)) }}
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
