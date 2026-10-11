<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { CookbookDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import FoodArt from '../components/FoodArt.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { usePageTitle } from '../stores/pageTitle';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, TASTE_NAMES } from '../utils/labels';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const d = ref<CookbookDetailDto | null>(null);
const busy = ref(false);
/** 读取失败：写失败，不一直显示骨架行 */
const failed = ref(false);
const id = Number(route.params.id);
/** 顶栏标题是食谱名（界面改版 P2a） */
usePageTitle(() => (d.value ? (catalog.data('cookbooks', d.value.id)?.name ?? d.value.name) : null));

/** 头部的食材图：最低一级的第一样食材 */
const heroFood = computed(() => d.value?.grades[0]?.foods[0]?.foodsId ?? 0);
/** 品级行（界面改版 P7）：食材和数量一样、学没学到也一样的相邻几级并成一行，写“普通~极品” */
const foodsKey = (foods: Array<{ foodsId: number; num: number }>) =>
  foods.map((f) => `${f.foodsId}x${f.num}`).join(',');
const gradeRows = computed(() => {
  const rows: Array<{
    from: number;
    to: number;
    label: string;
    done: boolean;
    foods: CookbookDetailDto['grades'][number]['foods'];
  }> = [];
  for (const g of d.value?.grades ?? []) {
    const done = g.grade <= (d.value?.grade ?? 0);
    const key = foodsKey(g.foods);
    const last = rows.at(-1);
    if (last && last.done === done && foodsKey(last.foods) === key) last.to = g.grade;
    else rows.push({ from: g.grade, to: g.grade, label: '', done, foods: g.foods });
  }
  const name = (n: number) => GRADE_NAMES[n] ?? String(n);
  for (const r of rows)
    r.label = r.from === r.to ? name(r.from) : t.value.cookbook.gradeRange(name(r.from), name(r.to));
  return rows;
});
async function load() {
  d.value = await endpoints.cookbookDetail(id);
}
async function learn() {
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
onMounted(() =>
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.cookbook.loadFailed), 'danger');
  }),
);
</script>

<template>
  <DtEmpty v-if="!d && failed" :title="t.cookbook.loadFailed" data-testid="cookbook-failed" />
  <DtSkeleton v-else-if="!d" :rows="6" data-testid="cookbook-skeleton" />
  <div v-else>
    <!-- 头部（界面改版 P7）：大食材图、名字和品级、一行信息；整宽“学习” -->
    <section class="dt-card dt-cbi-hero">
      <div class="dt-detail-head">
        <span class="dt-detail-art"><FoodArt :id="heroFood" :size="52" /></span>
        <div class="dt-detail-info">
          <h2 class="dt-cbi-name">
            {{ catalog.data('cookbooks', d.id)?.name ?? d.name }}
            <span :class="['dt-tag', d.grade > 0 ? 'dt-tag-primary' : 'dt-tag-mute']">{{
              GRADE_NAMES[d.grade]
            }}</span>
          </h2>
          <div class="dt-detail-sub" data-testid="cookbook-info">
            {{
              t.cookbook.info(
                catalog.streetName(d.streetId, d.streetName),
                d.level,
                d.taste.map((x) => TASTE_NAMES[x]).join(t.events.sep),
                formatNum(d.coin),
              )
            }}
          </div>
        </div>
      </div>
      <button
        v-if="d.learn !== 'max'"
        class="btn btn-primary dt-btn-block mt-3"
        :disabled="busy || d.learn === 'z' || d.learn === 'street'"
        data-testid="learn"
        @click="learn"
      >
        {{
          d.learn === 'street'
            ? t.cookbook.otherStreet(catalog.streetName(d.streetId, d.streetName))
            : d.learn === 'z'
              ? t.cookbook.lackFoods
              : d.grade === 0
                ? t.cookbook.learn
                : t.cookbook.upgrade
        }}
      </button>
    </section>
    <!-- 所需食材：一个品级一行，食材相同的几级并成一行；食材是带图的小块，缺的红底；学到的品级打勾 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.cookbook.foodsNeeded }}</h2>
        <span class="dt-block-more">{{ t.cookbook.missNote }}</span>
      </div>
      <div class="dt-card dt-rows-card">
        <div
          v-for="g in gradeRows"
          :key="g.from"
          :class="['dt-grade-row', { 'is-done': g.done }]"
          :data-testid="`grade-${g.from}`"
        >
          <span class="dt-grade-name">
            <i v-if="g.done" class="bi bi-check-lg" aria-hidden="true"></i>{{ g.label }}
          </span>
          <span class="dt-grade-foods">
            <span v-for="f in g.foods" :key="f.foodsId" :class="['dt-need', { 'is-miss': f.have < f.num }]">
              <FoodArt :id="f.foodsId" :size="18" />{{ t.common.qty(catalog.foodName(f.foodsId), f.num)
              }}<small>{{ t.cookbook.haveShort(f.have) }}</small>
            </span>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>
