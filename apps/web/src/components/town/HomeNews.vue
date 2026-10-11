<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { HeadlinesDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { useLocaleStore } from '../../stores/locale';
import { catalogNames, dailyLang, dailyPlain } from '../../utils/daily';
import { newsText } from '../../utils/news';

/** 首页小镇新闻（界面改版 P5：区块标题在卡片外，右边“全部”；卡片里一条一行，长的截断） */
const props = defineProps<{ headlines: HeadlinesDto }>();
const catalog = useCatalogStore();
const locale = useLocaleStore();
const t = useT();
/** 小镇日报入口（2026-10-08）：昨天的日报发布了才有；西语、法语看英文标题 */
const daily = computed(() => {
  const d = props.headlines.daily;
  if (!d) return null;
  const title = d.title[dailyLang(locale.locale).lang];
  return dailyPlain(title, d.rests, catalogNames(catalog), t.value.town.daily.closed);
});
</script>

<template>
  <section class="dt-block">
    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.nav.news.title }}</h2>
      <RouterLink to="/town?tab=news" class="dt-go" data-testid="home-news-more">{{
        t.nav.news.more
      }}</RouterLink>
    </div>
    <div class="dt-card dt-list-card small">
      <div v-if="daily" class="dt-list-line dt-clamp1" data-testid="home-daily">
        <RouterLink to="/town?tab=news" class="fw-bold">{{ t.nav.news.daily }}{{ daily }}</RouterLink>
      </div>
      <div
        v-if="headlines.broadcast"
        class="dt-list-line text-primary fw-bold dt-clamp1"
        data-testid="home-broadcast"
      >
        {{ t.nav.news.broadcast }}{{ newsText(headlines.broadcast, catalog) }}
      </div>
      <div v-for="n in headlines.news" :key="n.id" class="dt-list-line dt-clamp1" data-testid="home-news">
        {{ newsText(n, catalog) }}
      </div>
      <div
        v-if="!daily && !headlines.broadcast && headlines.news.length === 0"
        class="dt-list-line text-muted"
      >
        {{ t.nav.news.empty }}
      </div>
    </div>
  </section>
</template>
