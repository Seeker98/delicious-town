<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { CupboardDto, FridgeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const tab = ref<'cupboard' | 'fridge'>('cupboard');
const data = ref<CupboardDto | null>(null);
const fridge = ref<FridgeDto | null>(null);
const picked = ref<number | null>(null);
const num = ref(1);
const busy = ref(false);

const pickedItem = computed(() => data.value?.items.find((x) => x.foodsId === picked.value) ?? null);
const pickedLevel = computed(() => (picked.value ? (catalog.food(picked.value)?.level ?? 0) : 0));
const canDecompose = computed(() => pickedLevel.value >= 2 && pickedLevel.value <= 6);
const canCompose = computed(() => pickedLevel.value >= 1 && pickedLevel.value <= 4);
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
    <div class="row g-1">
      <div v-for="f in data.items" :key="f.foodsId" class="col-4">
        <button
          :class="['btn', 'btn-sm', 'w-100', 'border', picked === f.foodsId ? 'btn-warning' : 'btn-light']"
          :data-testid="`pick-${f.foodsId}`"
          @click="pick(f.foodsId)"
        >
          <i v-if="f.locked" class="bi bi-lock-fill"></i>
          {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
          <div v-if="f.streetNeed > 0" class="text-muted" style="font-size: 11px">
            本街还需 {{ f.streetNeed }}
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
