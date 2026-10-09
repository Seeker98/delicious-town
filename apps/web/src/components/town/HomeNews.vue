<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { HeadlinesDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { useCatalogStore } from '../../stores/catalog';
import { useLocaleStore } from '../../stores/locale';
import { catalogNames, dailyLang, dailyPlain } from '../../utils/daily';
import { newsText } from '../../utils/news';

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
  <div class="dt-card my-2 small">
    <div class="d-flex justify-content-between">
      <b>{{ t.nav.news.title }}</b>
      <RouterLink to="/town?tab=news" class="dt-go" data-testid="home-news-more">{{
        t.nav.news.more
      }}</RouterLink>
    </div>
    <div v-if="daily" class="dt-clamp1" data-testid="home-daily">
      <RouterLink to="/town?tab=news" class="fw-bold"
        ><i class="bi bi-newspaper"></i> {{ t.nav.news.daily }}{{ daily }}</RouterLink
      >
    </div>
    <div v-if="headlines.broadcast" class="text-primary fw-bold dt-clamp1" data-testid="home-broadcast">
      {{ t.nav.news.broadcast }}{{ newsText(headlines.broadcast, catalog) }}
    </div>
    <div v-for="n in headlines.news" :key="n.id" class="dt-clamp1" data-testid="home-news">
      {{ newsText(n, catalog) }}
    </div>
    <div v-if="!daily && !headlines.broadcast && headlines.news.length === 0" class="text-muted">
      {{ t.nav.news.empty }}
    </div>
  </div>
</template>
