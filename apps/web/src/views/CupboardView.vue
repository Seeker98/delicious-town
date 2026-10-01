<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { CupboardDto, FridgeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { foodLevelLabel } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
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
const MASTER_HIGH = '三级及以上的万能食材不能兑换稀有食材，只能在学食谱时顶替同级缺的那一种食材。';
const MASTER_RULE: Record<number, string> = {
  467: '2 个一级万能食材换 1 个随机二级稀有食材。',
  468: '2 个二级万能食材换 1 个随机三级稀有食材。',
  469: MASTER_HIGH,
  470: MASTER_HIGH,
  471: MASTER_HIGH,
};

/** 一次最多分解几个；合成要偶数个（问题记录：合成不显示最大数） */
const decomposeMax = computed(() => Math.min(data.value?.handleMax ?? 100, pickedItem.value?.num ?? 0));
const composeMax = computed(() => Math.floor(decomposeMax.value / 2) * 2);
const decomposeN = computed(() => Math.max(1, Math.min(num.value || 1, decomposeMax.value)));
const composeN = computed(() =>
  Math.max(2, Math.min(Math.floor((num.value || 2) / 2) * 2, composeMax.value)),
);

async function load() {
  data.value = await endpoints.cupboard();
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
    toast.push(`成功 ${r.success}/${r.chances} 次${r.strengthUsed ? '，消耗 1 体力' : ''}`, 'info');
  }, '处理失败');
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取橱柜失败'), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'cupboard' }]" href="#" @click.prevent="tab = 'cupboard'"
        >橱柜</a
      >
    </li>
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'fridge' }]" href="#" @click.prevent="openFridge">
        冰箱<span v-if="data?.fridgeUnread" class="badge bg-danger ms-1">新</span>
      </a>
    </li>
  </ul>

  <template v-if="tab === 'cupboard' && data">
    <div class="small text-muted mb-2">
      格子 {{ data.slotsUsed }}/{{ data.slots }} · 锁定 {{ data.lockUsed }}/{{ data.lockSlots }} · 单种上限
      {{ data.foodsMaxNum }} · 今天免体力处理还剩 {{ data.freeHandleLeft }} 次 · 本街目标
      {{ data.targetGrade }} 品
    </div>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        :class="['btn', 'btn-sm', level === 0 ? 'btn-secondary' : 'btn-outline-secondary']"
        data-testid="level-all"
        @click="level = 0"
      >
        全部 ({{ data.items.length }})
      </button>
      <button
        v-for="x in levels"
        :key="x.lv"
        :class="['btn', 'btn-sm', level === x.lv ? 'btn-secondary' : 'btn-outline-secondary']"
        :data-testid="`level-${x.lv}`"
        @click="level = x.lv"
      >
        {{ foodLevelLabel(x.lv) }} ({{ x.n }})
      </button>
    </div>
    <div v-if="shown.length === 0" class="small text-muted">这一级没有食材</div>
    <div class="row g-1">
      <div v-for="f in shown" :key="f.foodsId" class="col-4">
        <button
          :class="[
            'btn',
            'btn-sm',
            'w-100',
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
          <div class="dt-tile-sub text-muted">{{ f.streetNeed > 0 ? `本街还需 ${f.streetNeed}` : ' ' }}</div>
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
          分解 ×{{ decomposeN }}
        </button>
        <button
          class="btn btn-sm btn-outline-primary"
          data-testid="compose"
          :disabled="busy || !canCompose || composeMax < 2"
          @click="handle('compose')"
        >
          合成 ×{{ composeN }}
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
              '操作失败',
            )
          "
        >
          {{ pickedItem.locked ? '解锁' : '锁定' }}
        </button>
        <button
          v-if="pickedItem.foodsId === 467 || pickedItem.foodsId === 468"
          class="btn btn-sm btn-outline-success"
          :disabled="busy || pickedItem.num < 2 * num"
          @click="run(() => endpoints.exchangeMaster(pickedItem!.foodsId as 467 | 468, num), '兑换失败')"
        >
          兑换稀有食材
        </button>
      </div>
      <div v-if="MASTER_RULE[pickedItem.foodsId]" class="text-muted mt-1" data-testid="master-rule">
        {{ MASTER_RULE[pickedItem.foodsId] }}
      </div>
      <div class="text-muted mt-1">
        一次最多分解 {{ decomposeMax }}，合成 {{ composeMax }}（合成要偶数个）。分解：1 个 → 2
        次机会得到低一级食材；合成：2 个 → 1 次机会得到高一级食材。
      </div>
    </div>
  </template>

  <template v-if="tab === 'fridge' && fridge">
    <div v-if="fridge.items.length === 0" class="small text-muted">冰箱是空的</div>
    <div
      v-for="f in fridge.items"
      :key="f.foodsId"
      class="d-flex align-items-center border-bottom py-1 small"
    >
      {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
      <button
        class="btn btn-sm btn-outline-primary ms-auto"
        :disabled="busy"
        @click="run(() => endpoints.thaw(f.foodsId), '解冻失败')"
      >
        解冻
      </button>
    </div>
  </template>
</template>

<style scoped>
/* 问题记录 138：窄屏下五个字以上的食材名不截断，最多两行 */
.dt-tile-name {
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
