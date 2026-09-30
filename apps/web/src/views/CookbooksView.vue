<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CookbookListDto, CookbookRowDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const street = ref(0);
const filter = ref<'all' | 'learnable' | 'upgradable' | 'unlearned' | 'learned'>('all');
const page = ref(1);
const list = ref<CookbookListDto | null>(null);
const busy = ref(false);
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'learnable', label: '可学' },
  { key: 'upgradable', label: '可升级' },
  { key: 'unlearned', label: '未学' },
  { key: 'learned', label: '已学' },
] as const;

async function load() {
  try {
    list.value = await endpoints.cookbookList({
      street: street.value,
      page: page.value,
      filter: filter.value,
    });
  } catch (e) {
    toast.push(errorMessage(e, '读取食谱失败'), 'danger');
  }
}

function learnLabel(r: CookbookRowDto): string {
  if (r.learn === 'max') return '已满级';
  if (r.learn === 'z') return '食材不够';
  if (r.learn === '0') return r.grade === 0 ? '学习' : '升级';
  return `用${r.learn}级万能食材`;
}

async function learn(id: number) {
  busy.value = true;
  try {
    await endpoints.learn(id);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '学习失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

watch([street, filter], () => {
  page.value = 1;
  void load();
});
watch(page, () => void load());
onMounted(async () => {
  const rest = await restaurant.refresh().catch(() => null);
  if (rest) street.value = rest.streetId;
  await load();
});
</script>

<template>
  <div class="d-flex flex-wrap gap-2 mb-2">
    <select v-model.number="street" class="form-select form-select-sm w-auto">
      <option v-for="s in catalog.streets" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
    <div class="btn-group btn-group-sm">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        :class="['btn', filter === f.key ? 'btn-primary' : 'btn-outline-primary']"
        :data-testid="`filter-${f.key}`"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
    </div>
  </div>
  <div v-if="list" class="small text-muted mb-2" data-testid="cookbook-counts">
    本街已学 {{ list.streetLearned }}/{{ list.streetTotal }} · 共学会 {{ formatNum(list.learned) }} /
    {{ formatNum(list.allTotal) }} 道
  </div>
  <div v-for="r in list?.items ?? []" :key="r.id" class="border rounded p-2 mb-1 small">
    <div class="d-flex align-items-center">
      <RouterLink :to="`/cookbooks/${r.id}`" class="fw-bold">{{ r.name }}</RouterLink>
      <span class="dt-tag ms-2">{{ GRADE_NAMES[r.grade] }}</span>
      <button
        class="btn btn-sm btn-primary ms-auto"
        :data-testid="`learn-${r.id}`"
        :disabled="busy || r.learn === 'z' || r.learn === 'max'"
        @click="learn(r.id)"
      >
        {{ learnLabel(r) }}
      </button>
    </div>
    <div v-if="r.next" class="mt-1">
      <span
        v-for="f in r.next"
        :key="f.foodsId"
        :class="['me-2', f.have >= f.num ? 'text-success' : 'text-danger']"
      >
        {{ catalog.foodName(f.foodsId) }} {{ f.have }}/{{ f.num }}
      </span>
    </div>
  </div>
  <div v-if="list && list.total > list.pageSize" class="d-flex justify-content-between mt-2">
    <button class="btn btn-sm btn-outline-secondary" :disabled="page <= 1" @click="page -= 1">上一页</button>
    <span class="small">{{ page }} / {{ Math.ceil(list.total / list.pageSize) }}</span>
    <button
      class="btn btn-sm btn-outline-secondary"
      :disabled="page * list.pageSize >= list.total"
      @click="page += 1"
    >
      下一页
    </button>
  </div>
</template>
