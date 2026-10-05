<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { CookbookListDto, CookbookRowDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { moveHint } from '../utils/moveHint';
import { queryInt } from '../utils/query';
import { GRADE_NAMES, STREET_FOCUS } from '../utils/labels';

const catalog = useCatalogStore();
const restaurant = useRestaurantStore();
const toast = useToastStore();
const t = useT();
const route = useRoute();
const router = useRouter();
const FILTERS = ['all', 'learnable', 'upgradable', 'unlearned', 'learned'] as const;
type Filter = (typeof FILTERS)[number];
// 街道、筛选、页码记在地址里（问题记录 372）：从食谱详情返回时恢复，不回到本店街道的第一页
const fromQuery = queryInt(route.query.street, 0);
const street = ref(fromQuery ?? 0);
const filter = ref<Filter>(FILTERS.find((f) => f === route.query.filter) ?? 'all');
const page = ref(queryInt(route.query.page, 1) ?? 1);
const list = ref<CookbookListDto | null>(null);
const busy = ref(false);
const streetInfo = computed(() => catalog.streets.find((s) => s.id === street.value) ?? null);

async function load() {
  try {
    const r = await endpoints.cookbookList({
      street: street.value,
      page: page.value,
      filter: filter.value,
    });
    // 页码超过现在的总页数（地址里恢复的页码，或学完这页最后一道菜）：退到最后一页，page 的 watch 重读，不留空页
    const last = Math.max(1, Math.ceil(r.total / r.pageSize));
    if (r.items.length === 0 && page.value > last) {
      page.value = last;
      return;
    }
    list.value = r;
  } catch (e) {
    toast.push(errorMessage(e, t.value.cookbook.loadFailed), 'danger');
  }
}

function learnLabel(r: CookbookRowDto): string {
  const c = t.value.cookbook;
  if (r.learn === 'max') return c.maxed;
  if (r.learn === 'z') return c.lackFoods;
  // 别的街的菜只能看（问题记录 312）
  if (r.learn === 'street') return c.otherStreet(catalog.streetName(list.value?.street ?? -1));
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
watch([street, filter, page], ([s, f, p]) => {
  void router.replace({
    query: {
      ...route.query,
      street: String(s),
      filter: f === 'all' ? undefined : f,
      page: p > 1 ? String(p) : undefined,
    },
  });
});
/** 下一星要学会的菜数（问题记录 378 后续的搬街提示）；读不到时不提示 */
const starNeed = ref<{ star: number; need: number } | null>(null);
const hintGap = computed(() => {
  const rest = restaurant.rest;
  const l = list.value;
  if (!rest || !l || !starNeed.value || l.street !== rest.streetId) return null;
  return moveHint({
    need: starNeed.value.need,
    learned: l.learned,
    streetTotal: l.streetTotal,
    streetLearned: l.streetLearned,
  });
});
async function loadStarNeed() {
  try {
    const s = await endpoints.starNeed();
    const c = s.checks.find((x) => x.key === 'cookbooks');
    // 下一星没开放（泛紫星级的 cookbooks 一项不是“学会的菜”）或已满星时不提示
    starNeed.value = s.available && s.nextStar !== null && c ? { star: s.nextStar, need: c.need } : null;
  } catch {
    starNeed.value = null;
  }
}

onMounted(async () => {
  void loadStarNeed();
  // 搬街提示要知道本店在哪条街：地址里带了街道时也读一次餐厅（不改所选街道）
  if (fromQuery !== null && !restaurant.rest) void restaurant.refresh().catch(() => null);
  if (fromQuery === null) {
    const rest = await restaurant.refresh().catch(() => null);
    // 换街道时由上面的 watch 读列表
    if (rest && rest.streetId !== street.value) {
      street.value = rest.streetId;
      return;
    }
  }
  await load();
});
</script>

<template>
  <div class="d-flex flex-wrap gap-2 mb-2">
    <select v-model.number="street" class="form-select form-select-sm w-auto">
      <option v-for="s in catalog.streets" :key="s.id" :value="s.id">{{ s.name }}</option>
    </select>
    <!-- 一排独立按钮，放不下时换行（问题记录 304：英法西文下按钮组超出手机屏幕） -->
    <div class="d-flex flex-wrap gap-1" data-testid="cookbook-filters">
      <button
        v-for="f in FILTERS"
        :key="f"
        :class="['btn btn-sm', filter === f ? 'btn-primary' : 'btn-outline-primary']"
        :data-testid="`filter-${f}`"
        @click="filter = f"
      >
        {{ t.cookbook.filters[f] }}
      </button>
    </div>
  </div>
  <!-- 街道简介（问题记录 380）：类型、加成、为什么是这个加成，按目录取当前语言 -->
  <div v-if="streetInfo && (streetInfo.focus || streetInfo.desc || streetInfo.theme)" class="small mb-1">
    <span v-if="streetInfo.focus" class="dt-tag me-1" data-testid="street-focus">{{
      STREET_FOCUS[streetInfo.focus]
    }}</span>
    <span v-if="streetInfo.desc" data-testid="street-desc">{{ t.cookbook.streetDesc(streetInfo.desc) }}</span>
    <div v-if="streetInfo.theme" class="text-muted" data-testid="street-theme">{{ streetInfo.theme }}</div>
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
  <!-- 本街剩下的菜全学会也凑不够下一星（问题记录 378 后续）：提示学得差不多就搬街 -->
  <div
    v-if="hintGap !== null && starNeed"
    class="alert alert-warning small py-2 mb-2"
    data-testid="move-hint"
  >
    {{ t.cookbook.moveHint(starNeed.star, formatNum(starNeed.need), formatNum(hintGap)) }}
    <RouterLink to="/society/move">{{ t.cookbook.moveLink }}</RouterLink>
  </div>
  <div v-for="r in list?.items ?? []" :key="r.id" class="dt-cb small" :data-testid="`cb-${r.id}`">
    <div class="flex-fill" style="min-width: 0">
      <div class="text-truncate">
        <RouterLink :to="`/cookbooks/${r.id}`" class="fw-bold">{{
          catalog.data('cookbooks', r.id)?.name ?? r.name
        }}</RouterLink>
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
      :disabled="busy || r.learn === 'z' || r.learn === 'max' || r.learn === 'street'"
      @click="learn(r.id)"
    >
      {{ learnLabel(r) }}
    </button>
  </div>
  <div v-if="list && list.total > list.pageSize" class="d-flex justify-content-between mt-2">
    <button
      class="btn btn-sm btn-outline-secondary"
      data-testid="prev-page"
      :disabled="page <= 1"
      @click="page -= 1"
    >
      {{ t.common.prevPage }}
    </button>
    <span class="small">{{ page }} / {{ Math.ceil(list.total / list.pageSize) }}</span>
    <button
      class="btn btn-sm btn-outline-secondary"
      data-testid="next-page"
      :disabled="page * list.pageSize >= list.total"
      @click="page += 1"
    >
      {{ t.common.nextPage }}
    </button>
  </div>
</template>
