<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CupboardFoodDto, McLearnedDto, TempleDto, TrialResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const props = defineProps<{ data: TempleDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
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
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
});

const trial = computed(() => props.data.trial);
const dish = computed(() => (trial.value.mcId === null ? undefined : catalog.mc(trial.value.mcId)));
/** 试炼对象当前的试炼价值 / 经验（问题记录：试炼的选项说明不够） */
const stat = computed(() => learned.value.find((m) => m.mcId === trial.value.mcId));
const foodLabel = (f: CupboardFoodDto) => {
  const d = catalog.food(f.foodsId);
  return `${catalog.foodName(f.foodsId)}（${d?.level ?? '?'} 级${d && d.odds < RARE ? '，稀有' : ''}）×${f.num}`;
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
  if (props.data.star < 1) return '1 星以后才能试炼';
  if (trial.value.readyMinutes === 0) return '先注射或冥想做好准备';
  if (trial.value.mcId === null) return '还没有试炼对象';
  if (main.value === null || sub.value === null) return '选好主料和辅料';
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
const prepare = (way: 1 | 2) => run(() => endpoints.trialPrepare(way), '准备失败');
const refresh = (mcId?: number) => run(() => endpoints.trialRefresh(mcId), '更换失败');
const start = () =>
  run(async () => {
    result.value = await endpoints.trialStart(main.value!, sub.value!);
  }, '试炼失败');
</script>

<template>
  <div class="small">
    <p class="text-muted">
      试炼能提高特色菜的试炼价值（每份价值，最多 +50%）和试炼经验（烹制时的餐厅经验，最多 +150%）。创意
      {{ trial.creatives }}。
    </p>
    <details class="mb-2" data-testid="trial-help">
      <summary>玩法说明</summary>
      <ol class="mb-0 ps-3">
        <li>
          先准备：<b>注射</b>花 250,000 银币，得"创意药水"勋章（创意
          +25）；<b>冥想</b>免费，得"冥想"勋章（创意 +5）。勋章 1
          小时内有效，有效期内可以试炼任意次，创意越高成功率越高。
        </li>
        <li>
          准备时会从你学会的 1~5 级特色菜里随机选一道作为<b>试炼对象</b>。不满意可以花 20,000
          银币换一道，或者用 1 条<b>触手</b>（投喂克拉肯得到）指定一道。
        </li>
        <li>
          每次试炼花 10,000 银币，消耗你选的<b>主料</b>和<b>辅料</b>各 1 个（相同时扣 2
          个），再加这道菜的每种食材各 1 个。
        </li>
        <li>
          成功率看三样：创意、食材比这道菜高出的等级（主料影响更大）、食材的稀有度（<b>稀有</b> =
          下拉框里标"稀有"的，权重低于 100）。
        </li>
        <li>
          成功后：试炼经验 +1~4%（主辅都稀有最多）；<b>主料稀有</b>时试炼价值再 +1~2%；熟练度 +800 ×
          熟练度等级。试炼价值最多 50%（提高每份价值），试炼经验最多 150%（烹制时额外得餐厅经验）。
        </li>
      </ol>
    </details>
    <div v-if="trial.readyMinutes === 0" class="d-flex gap-1 mb-2">
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="trial-inject"
        :disabled="busy"
        @click="prepare(1)"
      >
        注射（250,000 银币，创意 +25）
      </button>
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="trial-meditate"
        :disabled="busy"
        @click="prepare(2)"
      >
        冥想（免费，创意 +5）
      </button>
    </div>
    <div v-else class="mb-1 text-success">准备勋章还剩 {{ trial.readyMinutes }} 分钟</div>
    <template v-if="dish">
      <div class="mb-1" data-testid="trial-target">
        试炼对象：<b>{{ dish.name }}</b
        >（{{ dish.level }} 级）
        <button class="btn btn-sm btn-link" data-testid="trial-refresh" :disabled="busy" @click="refresh()">
          换一道（20,000 银币）
        </button>
        <div v-if="stat" class="text-muted">
          当前试炼价值 {{ stat.trialWorth }}% / 50%，试炼经验 {{ stat.trialExp }}% / 150%，熟练度
          {{ stat.levelName }}
        </div>
      </div>
      <div class="d-flex gap-1 mb-2">
        <select v-model.number="pick" class="form-select form-select-sm" data-testid="trial-pick">
          <option :value="null" disabled>用触手指定（持有 {{ data.tentacles }}）</option>
          <option v-for="m in learned" :key="m.mcId" :value="m.mcId">{{ catalog.mcName(m.mcId) }}</option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary text-nowrap"
          :disabled="busy || pick === null || data.tentacles < 1"
          @click="refresh(pick!)"
        >
          指定
        </button>
      </div>
      <select v-model.number="main" class="form-select form-select-sm mb-1" data-testid="trial-main">
        <option :value="null" disabled>主料</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">{{ foodLabel(f) }}</option>
      </select>
      <select v-model.number="sub" class="form-select form-select-sm mb-1" data-testid="trial-sub">
        <option :value="null" disabled>辅料</option>
        <option v-for="f in foods" :key="f.foodsId" :value="f.foodsId">{{ foodLabel(f) }}</option>
      </select>
      <div v-if="rate !== null" class="text-muted" data-testid="trial-rate">
        预计成功率 {{ (rate * 100).toFixed(1) }}%（不含幸运）；另扣 10,000 银币和这道菜的每种食材各 1 个
      </div>
    </template>
    <button
      class="btn btn-sm btn-primary mt-1"
      data-testid="trial-start"
      :disabled="busy || !!block"
      @click="start"
    >
      开始试炼
    </button>
    <div v-if="block" class="text-danger" data-testid="block">{{ block }}</div>
    <div v-if="result" class="mt-1" data-testid="trial-result">
      <template v-if="result.success">
        试炼成功{{ result.lucky ? '（幸运）' : '' }}：试炼价值 +{{ result.addWorth }}%、试炼经验 +{{
          result.addExp
        }}%，熟练度 +{{ result.proficiency }}
      </template>
      <template v-else>试炼失败</template>
    </div>
  </div>
</template>
