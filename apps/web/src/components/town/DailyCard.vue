<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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

/** 小镇日报（2026-10-08）：AI 写的前一天的报道；没发布时显示“当日要闻” */
const t = useT();
const catalog = useCatalogStore();
const locale = useLocaleStore();
const toast = useToastStore();
const rest = useRestaurantStore();
const data = ref<DailyDto | null>(null);
/** 界面改版 P10：默认只显示前两段，“读全文”在卡里展开；换一天收起 */
const full = ref(false);
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
watch(
  () => data.value?.day,
  () => {
    full.value = false;
  },
);
const nextDay = computed(() =>
  data.value ? [...data.value.days].reverse().find((d) => d > data.value!.day) : undefined,
);
</script>

<template>
  <!-- 报刊风（界面改版 P10）：米色纸、宋体报头和标题、双线、首行缩进；默认两段，“读全文”展开 -->
  <article v-if="!off && rest.featureOn('daily') && data" class="dt-paper" data-testid="daily-card">
    <header class="dt-paper-mast">
      <b>{{ t.town.daily.title }}</b>
      <span class="dt-paper-day">{{ data.day }}</span>
      <button
        type="button"
        class="dt-paper-nav"
        :disabled="!prevDay"
        :aria-label="t.town.daily.prev"
        data-testid="daily-prev"
        @click="load(prevDay)"
      >
        <i class="bi bi-chevron-left" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="dt-paper-nav"
        :disabled="!nextDay"
        :aria-label="t.town.daily.next"
        data-testid="daily-next"
        @click="load(nextDay)"
      >
        <i class="bi bi-chevron-right" aria-hidden="true"></i>
      </button>
    </header>
    <h3 class="dt-paper-title" data-testid="daily-title">{{ title }}</h3>
    <div v-if="article && lang.englishOnly" class="dt-paper-sub" data-testid="daily-english-only">
      {{ t.town.daily.englishOnly }}
    </div>
    <template v-if="article">
      <p
        v-for="(p, i) in full ? paras : paras.slice(0, 2)"
        :key="i"
        class="dt-paper-p"
        data-testid="daily-para"
      >
        <template v-for="(s, j) in p" :key="j">
          <RouterLink v-if="s.kind === 'rest'" :to="`/friends/${s.id}`">{{ s.text }}</RouterLink>
          <template v-else>{{ s.text }}</template>
        </template>
      </p>
      <button
        v-if="paras.length > 2"
        type="button"
        class="dt-paper-more"
        :aria-expanded="full"
        data-testid="daily-more"
        @click="full = !full"
      >
        {{ full ? t.town.daily.less : t.town.daily.more }}
      </button>
    </template>
    <template v-else-if="data.fallback.length > 0">
      <div class="dt-paper-sub">{{ t.town.daily.pending }}</div>
      <div
        v-for="n in data.fallback"
        :key="n.id"
        class="dt-paper-line dt-clamp1"
        data-testid="daily-fallback"
      >
        {{ newsText(n, catalog) }}
      </div>
    </template>
    <div v-else class="dt-paper-sub">{{ t.town.daily.none }}</div>
  </article>
</template>
