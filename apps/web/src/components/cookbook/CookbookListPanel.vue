<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { CookbookListDto, CookbookRowDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import FoodArt from '../FoodArt.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { moveHint } from '../../utils/moveHint';
import { queryInt } from '../../utils/query';
import { GRADE_NAMES, STREET_FOCUS } from '../../utils/labels';

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

/** 只认最后一次请求的结果：换街道、点底部导航时连着发几次，先发的晚回来不能盖掉后发的（backlog 第 ③ 批审查） */
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const r = await endpoints.cookbookList({
      street: street.value,
      page: page.value,
      filter: filter.value,
    });
    if (mine !== seq) return;
    // 页码超过现在的总页数（地址里恢复的页码，或学完这页最后一道菜）：退到最后一页，page 的 watch 重读，不留空页
    const last = Math.max(1, Math.ceil(r.total / r.pageSize));
    if (r.items.length === 0 && page.value > last) {
      page.value = last;
      return;
    }
    list.value = r;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.cookbook.loadFailed), 'danger');
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
// 地址里的街道被外部清掉（停在别的街时点底部导航“食谱”，组件不重新挂载）：回到本店街道第 1 页（backlog 第 ⑧ 批）
watch(
  () => route.query.street,
  async (q) => {
    if (q !== undefined) return;
    const rest = restaurant.rest ?? (await restaurant.refresh().catch(() => null));
    const own = rest?.streetId ?? 0;
    if (street.value === own && filter.value === 'all') {
      if (page.value !== 1) page.value = 1;
      // 三项都没变时 watch 不写地址，这里补上
      else void router.replace({ query: { ...route.query, street: String(own) } });
      return;
    }
    street.value = own;
    filter.value = 'all';
  },
);
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
/** 搬街提示关掉后记住到下一星（backlog 384：休闲玩家会挂好几周）：存“店 id:下一星” */
const HINT_KEY = 'dt_move_hint_closed';
const hintId = computed(() => (starNeed.value ? `${restaurant.rest?.id ?? 0}:${starNeed.value.star}` : ''));
const hintClosed = ref<string | null>(null);
try {
  hintClosed.value = localStorage.getItem(HINT_KEY);
} catch {
  hintClosed.value = null;
}
function closeHint() {
  hintClosed.value = hintId.value;
  try {
    localStorage.setItem(HINT_KEY, hintId.value);
  } catch {
    // 存不了就只在这次关掉
  }
}
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
  // 同一家店、同一星级读过就用记住的（从食谱详情回来页面会重新挂载，backlog 384 审查）
  const key = `${restaurant.rest?.id ?? 0}:${restaurant.rest?.starLevel ?? 0}`;
  if (restaurant.starNeed?.key === key) {
    starNeed.value = restaurant.starNeed.value;
    return;
  }
  try {
    const s = await endpoints.starNeed();
    const c = s.checks.find((x) => x.key === 'cookbooks');
    // 下一星没开放（泛紫星级的 cookbooks 一项不是“学会的菜”）或已满星时不提示
    starNeed.value = s.available && s.nextStar !== null && c ? { star: s.nextStar, need: c.need } : null;
    restaurant.starNeed = { key, value: starNeed.value };
  } catch {
    // 读失败不记住，下次再试
    starNeed.value = null;
  }
}

// 下一星要求只在看本店街道时用：第一次看本店街道时读一次，看别的街不读（backlog 384）
let starNeedAsked = false;
watch(
  () => list.value !== null && restaurant.rest !== null && list.value.street === restaurant.rest.streetId,
  (own) => {
    if (!own || starNeedAsked) return;
    starNeedAsked = true;
    void loadStarNeed();
  },
  { immediate: true },
);
onMounted(async () => {
  // 搬街提示要知道本店在哪条街：地址里带了街道时也读一次餐厅（不改所选街道）
  if (fromQuery !== null && !restaurant.rest) void restaurant.refresh().catch(() => null);
  // 记着本店（从首页过来通常有）：按记着的街道马上读列表，餐厅在后台刷新，搬过街时再换（性能排查 2026-10-08：原来多一轮往返）
  const cached = fromQuery === null ? restaurant.rest : null;
  if (cached) {
    if (cached.streetId !== street.value) street.value = cached.streetId;
    else void load();
    const rest = await restaurant.refresh().catch(() => null);
    if (rest && rest.streetId !== cached.streetId && street.value === cached.streetId)
      street.value = rest.streetId;
    return;
  }
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
  <!-- 本街一张折叠卡（界面改版 P7）：街名、学会几道和进度条、加成一行摘要；点开看类型、全部加成、为什么是这个加成 -->
  <details v-if="streetInfo || list" class="dt-card dt-effects dt-cb-street" data-testid="street-card">
    <summary class="dt-effects-sum dt-cb-street-sum">
      <span class="dt-effects-sum-text">
        <span class="dt-cb-street-line"
          ><b>{{ catalog.streetName(street) }}</b>
          <span v-if="list" class="dt-meta" data-testid="cookbook-counts">{{
            t.cookbook.counts(
              list.streetLearned,
              list.streetTotal,
              formatNum(list.learned),
              formatNum(list.allTotal),
            )
          }}</span></span
        >
        <span v-if="list" class="dt-quest-bar"
          ><span :style="{ width: `${(list.streetLearned / Math.max(1, list.streetTotal)) * 100}%` }"></span
        ></span>
        <span v-if="streetInfo?.desc" class="dt-fold-sub">{{ t.cookbook.streetDesc(streetInfo.desc) }}</span>
      </span>
      <i class="bi bi-chevron-down dt-effects-chev" aria-hidden="true"></i>
    </summary>
    <!-- 街道简介（问题记录 380）：类型、加成、为什么是这个加成，按目录取当前语言 -->
    <div v-if="streetInfo" class="dt-effects-body dt-cb-street-body">
      <span v-if="streetInfo.focus" class="dt-tag dt-tag-primary me-1" data-testid="street-focus">{{
        STREET_FOCUS[streetInfo.focus]
      }}</span>
      <span v-if="streetInfo.desc" data-testid="street-desc">{{
        t.cookbook.streetDesc(streetInfo.desc)
      }}</span>
      <div v-if="streetInfo.theme" class="dt-meta mt-1" data-testid="street-theme">
        {{ streetInfo.theme }}
      </div>
    </div>
  </details>

  <!-- 街道选择（原生下拉，样子是胶囊）+ 筛选胶囊，放不下时换行（问题记录 304） -->
  <div class="dt-pills dt-cb-filters" data-testid="cookbook-filters">
    <span class="dt-select-pill">
      <select v-model.number="street" :aria-label="t.cookbook.streetPick">
        <option v-for="s in catalog.streets" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </span>
    <button
      v-for="f in FILTERS"
      :key="f"
      type="button"
      :class="{ active: filter === f }"
      :aria-pressed="filter === f"
      :data-testid="`filter-${f}`"
      @click="filter = f"
    >
      {{ t.cookbook.filters[f] }}
    </button>
  </div>
  <!-- 本街剩下的菜全学会也凑不够下一星（问题记录 378 后续）：提示学得差不多就搬街 -->
  <div
    v-if="hintGap !== null && starNeed && hintClosed !== hintId"
    class="dt-act-note is-warn dt-cb-hint"
    data-testid="move-hint"
  >
    <div class="flex-fill">
      {{ t.cookbook.moveHint(starNeed.star, formatNum(starNeed.need), formatNum(hintGap)) }}
      <RouterLink to="/society/move" class="dt-go">{{ t.cookbook.moveLink }}</RouterLink>
    </div>
    <button type="button" class="dt-link-btn" data-testid="move-hint-close" @click="closeHint">
      {{ t.cookbook.moveHintClose }}
    </button>
  </div>
  <!-- 一张卡片一行一道菜（界面改版 P7）：左边食材图，名字和品级、所需食材（缺的标红）；
       右边按能不能学分三档：能学实心“学习”，要用万能食材浅紫胶囊，学不了只放灰色小标签 -->
  <div v-if="list && list.items.length > 0" class="dt-card dt-rows-card">
    <div v-for="r in list.items" :key="r.id" class="dt-row dt-cb-row" :data-testid="`cb-${r.id}`">
      <span class="dt-row-ico dt-cb-ico"><FoodArt :id="r.next?.[0]?.foodsId ?? 0" :size="28" /></span>
      <span class="dt-row-main">
        <span class="dt-row-title"
          ><RouterLink :to="`/cookbooks/${r.id}`" class="dt-cb-name">{{
            catalog.data('cookbooks', r.id)?.name ?? r.name
          }}</RouterLink
          ><span :class="['dt-tag', r.grade > 0 ? 'dt-tag-primary' : 'dt-tag-mute']">{{
            GRADE_NAMES[r.grade]
          }}</span></span
        >
        <span v-if="r.next" class="dt-row-sub dt-cb-foods">
          <template v-for="(f, i) in r.next" :key="f.foodsId"
            ><template v-if="i > 0"> · </template
            ><span :class="{ 'dt-miss': f.have < f.num }"
              >{{ catalog.foodName(f.foodsId) }} {{ f.have }}/{{ f.num }}</span
            ></template
          >
        </span>
      </span>
      <button
        v-if="r.learn === '0'"
        type="button"
        class="btn btn-sm btn-primary"
        :data-testid="`learn-${r.id}`"
        :disabled="busy"
        @click="learn(r.id)"
      >
        {{ learnLabel(r) }}
      </button>
      <button
        v-else-if="r.learn !== 'z' && r.learn !== 'max' && r.learn !== 'street'"
        type="button"
        class="btn btn-sm btn-outline-primary dt-cb-master"
        :data-testid="`learn-${r.id}`"
        :disabled="busy"
        @click="learn(r.id)"
      >
        {{ learnLabel(r) }}
      </button>
      <span
        v-else
        :class="['dt-tag', r.learn === 'max' ? 'dt-tag-ok' : 'dt-tag-mute', 'dt-cb-state']"
        :data-testid="`learn-${r.id}`"
        >{{ learnLabel(r) }}</span
      >
    </div>
  </div>
  <div v-if="list && list.total > list.pageSize" class="dt-pager">
    <button
      type="button"
      class="btn btn-sm btn-light"
      data-testid="prev-page"
      :disabled="page <= 1"
      @click="page -= 1"
    >
      {{ t.common.prevPage }}
    </button>
    <span class="dt-meta">{{ page }} / {{ Math.ceil(list.total / list.pageSize) }}</span>
    <button
      type="button"
      class="btn btn-sm btn-light"
      data-testid="next-page"
      :disabled="page * list.pageSize >= list.total"
      @click="page += 1"
    >
      {{ t.common.nextPage }}
    </button>
  </div>
</template>
