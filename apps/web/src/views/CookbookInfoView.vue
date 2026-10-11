<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
    <div class="small text-muted mb-2">
      <span class="dt-tag dt-tag-lead me-1">{{ GRADE_NAMES[d.grade] }}</span>
      {{
        t.cookbook.info(
          catalog.streetName(d.streetId, d.streetName),
          d.level,
          d.taste.map((x) => TASTE_NAMES[x]).join(t.events.sep),
          formatNum(d.coin),
        )
      }}
    </div>
    <button
      class="btn btn-sm btn-primary mb-2"
      :disabled="busy || d.learn === 'z' || d.learn === 'max' || d.learn === 'street'"
      @click="learn"
    >
      {{
        d.learn === 'street'
          ? t.cookbook.otherStreet(catalog.streetName(d.streetId, d.streetName))
          : d.grade === 0
            ? t.cookbook.learn
            : t.cookbook.upgrade
      }}
    </button>
    <!-- 每个品级一行（界面改版 P4：原来是表格），食材前面是食材图，缺的标红；学到的品级打勾 -->
    <div class="dt-card small">
      <div class="dt-card-title mb-1">{{ t.cookbook.foodsNeeded }}</div>
      <div
        v-for="g in d.grades"
        :key="g.grade"
        :class="['dt-grade-row', { 'is-done': g.grade <= d.grade }]"
        :data-testid="`grade-${g.grade}`"
      >
        <span class="dt-grade-name">
          <i v-if="g.grade <= d.grade" class="bi bi-check-lg text-success" aria-hidden="true"></i
          >{{ GRADE_NAMES[g.grade] ?? g.name }}
        </span>
        <span class="dt-grade-foods">
          <span v-for="f in g.foods" :key="f.foodsId" :class="['dt-need', { 'text-danger': f.have < f.num }]">
            <FoodArt :id="f.foodsId" :size="16" />{{ t.common.qty(catalog.foodName(f.foodsId), f.num)
            }}{{ t.common.paren(String(f.have)) }}
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
