<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { CookbookListDto, CookbookRowDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const t = useT();
const street = ref(0);
const filter = ref<'all' | 'learnable' | 'upgradable' | 'unlearned' | 'learned'>('all');
const page = ref(1);
const list = ref<CookbookListDto | null>(null);
const busy = ref(false);
const FILTERS = ['all', 'learnable', 'upgradable', 'unlearned', 'learned'] as const;

async function load() {
  try {
    list.value = await endpoints.cookbookList({
      street: street.value,
      page: page.value,
      filter: filter.value,
    });
  } catch (e) {
    toast.push(errorMessage(e, t.value.cookbook.loadFailed), 'danger');
  }
}

function learnLabel(r: CookbookRowDto): string {
  const c = t.value.cookbook;
  if (r.learn === 'max') return c.maxed;
  if (r.learn === 'z') return c.lackFoods;
  if (r.learn === '0') return r.grade === 0 ? c.learn : c.upgrade;
  return c.useMaster(r.learn);
}

async function learn(id: number) {
  busy.value = true;
  try {
    await endpoints.learn(id);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.cookbook.learnFailed), 'danger');
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
        :key="f"
        :class="['btn', filter === f ? 'btn-primary' : 'btn-outline-primary']"
        :data-testid="`filter-${f}`"
        @click="filter = f"
      >
        {{ t.cookbook.filters[f] }}
      </button>
    </div>
  </div>
  <div v-if="list" class="small text-muted mb-2" data-testid="cookbook-counts">
    {{
      t.cookbook.counts(
        list.streetLearned,
        list.streetTotal,
        formatNum(list.learned),
        formatNum(list.allTotal),
      )
    }}
  </div>
  <div v-for="r in list?.items ?? []" :key="r.id" class="dt-cb small" :data-testid="`cb-${r.id}`">
    <div class="flex-fill" style="min-width: 0">
      <div class="text-truncate">
        <RouterLink :to="`/cookbooks/${r.id}`" class="fw-bold">{{ r.name }}</RouterLink>
        <span class="dt-tag ms-1">{{ GRADE_NAMES[r.grade] }}</span>
      </div>
      <div v-if="r.next" class="dt-cb-foods">
        <span
          v-for="f in r.next"
          :key="f.foodsId"
          :class="['me-2', f.have >= f.num ? 'text-success' : 'text-danger']"
        >
          {{ catalog.foodName(f.foodsId) }} {{ f.have }}/{{ f.num }}
        </span>
      </div>
    </div>
    <button
      class="btn btn-primary dt-btn-xs"
      :data-testid="`learn-${r.id}`"
      :disabled="busy || r.learn === 'z' || r.learn === 'max'"
      @click="learn(r.id)"
    >
      {{ learnLabel(r) }}
    </button>
  </div>
  <div v-if="list && list.total > list.pageSize" class="d-flex justify-content-between mt-2">
    <button class="btn btn-sm btn-outline-secondary" :disabled="page <= 1" @click="page -= 1">
      {{ t.common.prevPage }}
    </button>
    <span class="small">{{ page }} / {{ Math.ceil(list.total / list.pageSize) }}</span>
    <button
      class="btn btn-sm btn-outline-secondary"
      :disabled="page * list.pageSize >= list.total"
      @click="page += 1"
    >
      {{ t.common.nextPage }}
    </button>
  </div>
</template>
