<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { DailyDto } from '@dt/shared';
import { ApiError } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useLocaleStore } from '../../stores/locale';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import { catalogNames, dailyLang, dailyParagraphs, dailyPlain } from '../../utils/daily';
import { newsText } from '../../utils/news';

/** 小镇日报（2026-10-08）：AI 写的前一天的报道；没发布时显示“今日要闻” */
const t = useT();
const catalog = useCatalogStore();
const locale = useLocaleStore();
const toast = useToastStore();
const rest = useRestaurantStore();
const data = ref<DailyDto | null>(null);
/** 区服没开日报：整张卡片不显示 */
const off = ref(false);

let seq = 0;
async function load(day?: string) {
  const mine = ++seq;
  try {
    const v = await endpoints.townDaily(day);
    if (mine === seq) data.value = v;
  } catch (e) {
    if (mine !== seq) return;
    if (e instanceof ApiError && e.code === 'FEATURE_DISABLED') off.value = true;
    else toast.push(errorMessage(e, t.value.town.daily.loadFailed), 'danger');
  }
}
// 已经知道区服关了日报就不请求（backlog：原来每次进新闻标签都多一次 403）
onMounted(() => {
  if (rest.featureOn('daily')) void load();
});

const names = catalogNames(catalog);
const lang = computed(() => dailyLang(locale.locale));
const article = computed(() => data.value?.article?.[lang.value.lang] ?? null);
const title = computed(() =>
  article.value && data.value
    ? dailyPlain(article.value.title, data.value.rests, names, t.value.town.daily.closed)
    : t.value.town.daily.fallbackTitle,
);
const paras = computed(() =>
  article.value && data.value
    ? dailyParagraphs(article.value.body, data.value.rests, names, t.value.town.daily.closed)
    : [],
);
/**
 * days 新的在前。按日期比较找前后一天，不按下标：选中的那天可能没有稿子、不在 days 里
 * （刚开日报、或 00:10 前；backlog）
 */
const prevDay = computed(() => data.value?.days.find((d) => d < data.value!.day));
const nextDay = computed(() =>
  data.value ? [...data.value.days].reverse().find((d) => d > data.value!.day) : undefined,
);
</script>

<template>
  <div v-if="!off && rest.featureOn('daily') && data" class="dt-card mb-2" data-testid="daily-card">
    <div class="d-flex justify-content-between align-items-center mb-1">
      <b>
        <i class="bi bi-newspaper"></i> {{ t.town.daily.title }}
        <span class="dt-meta ms-1">{{ data.day }}</span>
      </b>
      <span class="d-flex gap-1">
        <button
          class="btn btn-sm btn-outline-secondary py-0"
          :disabled="!prevDay"
          :title="t.town.daily.prev"
          data-testid="daily-prev"
          @click="load(prevDay)"
        >
          <i class="bi bi-chevron-left"></i>
        </button>
        <button
          class="btn btn-sm btn-outline-secondary py-0"
          :disabled="!nextDay"
          :title="t.town.daily.next"
          data-testid="daily-next"
          @click="load(nextDay)"
        >
          <i class="bi bi-chevron-right"></i>
        </button>
      </span>
    </div>
    <h6 class="fw-bold mb-1" data-testid="daily-title">{{ title }}</h6>
    <div v-if="article && lang.englishOnly" class="dt-meta mb-1" data-testid="daily-english-only">
      {{ t.town.daily.englishOnly }}
    </div>
    <template v-if="article">
      <p v-for="(p, i) in paras" :key="i" class="mb-2 small" data-testid="daily-para">
        <template v-for="(s, j) in p" :key="j">
          <RouterLink v-if="s.kind === 'rest'" :to="`/friends/${s.id}`">{{ s.text }}</RouterLink>
          <template v-else>{{ s.text }}</template>
        </template>
      </p>
    </template>
    <template v-else-if="data.fallback.length > 0">
      <div class="dt-meta mb-1">{{ t.town.daily.pending }}</div>
      <div v-for="n in data.fallback" :key="n.id" class="small dt-clamp1" data-testid="daily-fallback">
        {{ newsText(n, catalog) }}
      </div>
    </template>
    <div v-else class="dt-empty">{{ t.town.daily.none }}</div>
  </div>
</template>
